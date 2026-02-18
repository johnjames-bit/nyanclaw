const crypto = require('crypto');
const { runPipeline } = require('./void-pipeline');
const { clearMemory } = require('./memory-manager');
const { estimateTokens } = require('./llm-client');

const MAX_WORKERS_PER_SWARM = 10;
const MAX_CONCURRENT_SWARMS = 5;
const DEFAULT_TOKEN_BUDGET = 50000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const COMPLETED_TTL_MS = 15 * 60 * 1000;

const _registry = new Map();

function _generateSwarmId() {
  return `swarm_${crypto.randomBytes(8).toString('hex')}`;
}

function _generateWorkerId(index) {
  return `worker_${index}_${crypto.randomBytes(4).toString('hex')}`;
}

function _evictCompletedSwarm() {
  if (_registry.size < MAX_CONCURRENT_SWARMS) return;

  let oldestId = null;
  let oldestTime = Infinity;
  for (const [id, swarm] of _registry) {
    if (swarm.status !== 'running' && swarm.createdAt < oldestTime) {
      oldestTime = swarm.createdAt;
      oldestId = id;
    }
  }
  if (oldestId) {
    const swarm = _registry.get(oldestId);
    _cleanupSwarmSessions(swarm);
    _registry.delete(oldestId);
    console.log(`[swarm] LRU evicted ${oldestId}`);
  }
}

function _cleanupSwarmSessions(swarm) {
  if (!swarm) return;
  for (const worker of swarm.workers) {
    if (worker.status !== 'pending') {
      const sessionId = swarm.parentSessionId + ':swarm:' + worker.workerId;
      clearMemory(sessionId, false);
    }
  }
}

function spawnSwarm({ parentSessionId, callerId, tasks, options = {}, chain = null, tokenBudget = DEFAULT_TOKEN_BUDGET }) {
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('[swarm] tasks array is required and must not be empty');
  }

  if (tasks.length > MAX_WORKERS_PER_SWARM) {
    throw new Error(`[swarm] max ${MAX_WORKERS_PER_SWARM} workers per swarm, got ${tasks.length}`);
  }

  _evictCompletedSwarm();

  if (_registry.size >= MAX_CONCURRENT_SWARMS) {
    let hasRoom = false;
    for (const [id, swarm] of _registry) {
      if (swarm.status !== 'running') {
        _cleanupSwarmSessions(swarm);
        _registry.delete(id);
        console.log(`[swarm] force-evicted completed swarm ${id} to make room`);
        hasRoom = true;
        break;
      }
    }
    if (!hasRoom) {
      throw new Error(`[swarm] max ${MAX_CONCURRENT_SWARMS} concurrent swarms reached`);
    }
  }

  const swarmId = _generateSwarmId();
  const workers = tasks.map((task, index) => ({
    workerId: _generateWorkerId(index),
    index,
    label: task.label || `task-${index}`,
    query: task.query,
    status: 'pending',
    response: null,
    audit: null,
  }));

  const swarm = {
    swarmId,
    parentSessionId: parentSessionId || 'default',
    callerId: callerId || null,
    options,
    chain,
    tokenBudget: tokenBudget || DEFAULT_TOKEN_BUDGET,
    status: 'pending',
    workers,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalLatencyMs: 0,
    createdAt: Date.now(),
    completedAt: null,
  };

  _registry.set(swarmId, swarm);
  console.log(`[swarm] spawned ${swarmId} with ${workers.length} workers (budget: ${swarm.tokenBudget} tokens)`);

  return {
    swarmId,
    workers: workers.map(w => ({ workerId: w.workerId, label: w.label, status: w.status })),
  };
}

async function executeSwarm(swarmId) {
  const swarm = _registry.get(swarmId);
  if (!swarm) {
    throw new Error(`[swarm] swarm ${swarmId} not found`);
  }

  if (swarm.status === 'done' || swarm.status === 'failed' || swarm.status === 'aborted') {
    throw new Error(`[swarm] swarm ${swarmId} already completed with status: ${swarm.status}`);
  }

  swarm.status = 'running';
  const t0 = Date.now();
  let budgetExceeded = false;

  const promises = swarm.workers.map(async (worker, index) => {
    if (worker.status === 'aborted') return;

    if (budgetExceeded || swarm.status === 'aborted') {
      worker.status = 'aborted';
      console.log(`[swarm] ${swarmId}/${worker.workerId} aborted — budget exceeded before start`);
      return;
    }

    worker.status = 'running';
    const sessionId = swarm.parentSessionId + ':swarm:' + worker.workerId;

    try {
      const result = await runPipeline({
        query: worker.query,
        sessionId,
        callerId: swarm.callerId,
        options: swarm.options,
        chain: swarm.chain,
      });

      const tokensIn = result.audit?.tokensIn || 0;
      const tokensOut = result.audit?.tokensOut || 0;

      swarm.totalTokensIn += tokensIn;
      swarm.totalTokensOut += tokensOut;
      const currentTotal = swarm.totalTokensIn + swarm.totalTokensOut;

      worker.status = 'done';
      worker.response = result.response || null;
      worker.audit = result.audit || null;
      console.log(`[swarm] ${swarmId}/${worker.workerId} done (tokens: ${tokensIn + tokensOut}, total: ${currentTotal}/${swarm.tokenBudget})`);

      if (currentTotal >= swarm.tokenBudget) {
        budgetExceeded = true;
        for (const w of swarm.workers) {
          if (w.status === 'pending') {
            w.status = 'aborted';
            console.log(`[swarm] ${swarmId}/${w.workerId} aborted — token budget exceeded after ${worker.workerId}`);
          }
        }
      }
    } catch (err) {
      worker.status = 'failed';
      worker.response = `[swarm error] ${err.message}`;
      worker.audit = { latencyMs: Date.now() - t0, tokensIn: 0, tokensOut: 0 };
      console.log(`[swarm] ${swarmId}/${worker.workerId} failed: ${err.message}`);
    }
  });

  await Promise.allSettled(promises);

  swarm.totalLatencyMs = Date.now() - t0;
  swarm.completedAt = Date.now();

  const doneCount = swarm.workers.filter(w => w.status === 'done').length;
  const failedCount = swarm.workers.filter(w => w.status === 'failed').length;
  const abortedCount = swarm.workers.filter(w => w.status === 'aborted').length;

  if (doneCount === swarm.workers.length) {
    swarm.status = 'done';
  } else if (doneCount > 0) {
    swarm.status = 'partial';
  } else {
    swarm.status = 'failed';
  }

  _cleanupSwarmSessions(swarm);

  console.log(`[swarm] ${swarmId} completed: ${swarm.status} (done=${doneCount}, failed=${failedCount}, aborted=${abortedCount}, latency=${swarm.totalLatencyMs}ms)`);

  return swarm;
}

function aggregateResults(swarmId) {
  const swarm = _registry.get(swarmId);
  if (!swarm) {
    throw new Error(`[swarm] swarm ${swarmId} not found`);
  }

  return {
    swarmId: swarm.swarmId,
    status: swarm.status,
    workers: swarm.workers.map(w => ({
      workerId: w.workerId,
      label: w.label,
      status: w.status,
      response: w.response,
      audit: w.audit,
    })),
    totalTokensIn: swarm.totalTokensIn,
    totalTokensOut: swarm.totalTokensOut,
    totalLatencyMs: swarm.totalLatencyMs,
  };
}

async function runSwarm(input) {
  const { parentSessionId, callerId, tasks, options, chain, tokenBudget } = input;
  const spawned = spawnSwarm({ parentSessionId, callerId, tasks, options, chain, tokenBudget });
  await executeSwarm(spawned.swarmId);
  return aggregateResults(spawned.swarmId);
}

function abortSwarm(swarmId) {
  const swarm = _registry.get(swarmId);
  if (!swarm) {
    throw new Error(`[swarm] swarm ${swarmId} not found`);
  }

  for (const worker of swarm.workers) {
    if (worker.status === 'pending' || worker.status === 'running') {
      worker.status = 'aborted';
    }
  }

  swarm.status = 'aborted';
  swarm.completedAt = Date.now();
  _cleanupSwarmSessions(swarm);
  console.log(`[swarm] ${swarmId} aborted — all workers stopped, sessions cleared`);

  return { swarmId, status: 'aborted' };
}

function abortWorker(swarmId, workerId) {
  const swarm = _registry.get(swarmId);
  if (!swarm) {
    throw new Error(`[swarm] swarm ${swarmId} not found`);
  }

  const worker = swarm.workers.find(w => w.workerId === workerId);
  if (!worker) {
    throw new Error(`[swarm] worker ${workerId} not found in swarm ${swarmId}`);
  }

  if (worker.status === 'pending' || worker.status === 'running') {
    worker.status = 'aborted';
    const sessionId = swarm.parentSessionId + ':swarm:' + worker.workerId;
    clearMemory(sessionId, false);
    console.log(`[swarm] ${swarmId}/${workerId} aborted`);
  }

  return { swarmId, workerId, status: worker.status };
}

function getSwarmStatus(swarmId) {
  const swarm = _registry.get(swarmId);
  if (!swarm) return null;

  return {
    swarmId: swarm.swarmId,
    status: swarm.status,
    workers: swarm.workers.map(w => ({
      workerId: w.workerId,
      label: w.label,
      status: w.status,
    })),
    totalTokensIn: swarm.totalTokensIn,
    totalTokensOut: swarm.totalTokensOut,
    totalLatencyMs: swarm.totalLatencyMs,
    createdAt: swarm.createdAt,
    completedAt: swarm.completedAt,
  };
}

function listSwarms() {
  const result = [];
  for (const [, swarm] of _registry) {
    const doneCount = swarm.workers.filter(w => w.status === 'done').length;
    const failedCount = swarm.workers.filter(w => w.status === 'failed').length;
    const abortedCount = swarm.workers.filter(w => w.status === 'aborted').length;
    const pendingCount = swarm.workers.filter(w => w.status === 'pending').length;
    const runningCount = swarm.workers.filter(w => w.status === 'running').length;

    result.push({
      swarmId: swarm.swarmId,
      status: swarm.status,
      workerCount: swarm.workers.length,
      done: doneCount,
      failed: failedCount,
      aborted: abortedCount,
      pending: pendingCount,
      running: runningCount,
      totalTokensIn: swarm.totalTokensIn,
      totalTokensOut: swarm.totalTokensOut,
      totalLatencyMs: swarm.totalLatencyMs,
      createdAt: swarm.createdAt,
      completedAt: swarm.completedAt,
    });
  }
  return result;
}

function clearSwarmRegistry() {
  for (const [, swarm] of _registry) {
    _cleanupSwarmSessions(swarm);
  }
  _registry.clear();
  console.log('[swarm] registry cleared');
}

function getSwarmRegistrySize() {
  return _registry.size;
}

function _cleanupOldSwarms() {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, swarm] of _registry) {
    if (swarm.status !== 'running' && swarm.status !== 'pending') {
      const age = now - (swarm.completedAt || swarm.createdAt);
      if (age > COMPLETED_TTL_MS) {
        _cleanupSwarmSessions(swarm);
        _registry.delete(id);
        cleaned++;
      }
    }
  }
  if (cleaned > 0) {
    console.log(`[swarm] auto-cleaned ${cleaned} expired swarms`);
  }
}

const _cleanupTimer = setInterval(_cleanupOldSwarms, CLEANUP_INTERVAL_MS);
_cleanupTimer.unref();

module.exports = {
  spawnSwarm,
  executeSwarm,
  aggregateResults,
  runSwarm,
  abortSwarm,
  abortWorker,
  getSwarmStatus,
  listSwarms,
  clearSwarmRegistry,
  getSwarmRegistrySize,
  MAX_WORKERS_PER_SWARM,
  MAX_CONCURRENT_SWARMS,
  DEFAULT_TOKEN_BUDGET,
};
