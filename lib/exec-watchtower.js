const crypto = require('crypto');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const { containsDangerousPattern, isPathWithinWorkspace, WORKSPACE_ROOT } = require('./void-pipeline');

const MAX_BACKGROUND_PROCESSES = 20;
const OUTPUT_MAX_BYTES = 4096;
const DEFAULT_FG_TIMEOUT_MS = 30000;
const DEFAULT_BG_TIMEOUT_MS = 120000;
const SIGKILL_GRACE_MS = 5000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const COMPLETED_TTL_MS = 10 * 60 * 1000;

const BLOCKED_ENV_KEYS = [
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'PATH',
];

const SAFE_PATH = [
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  path.join(WORKSPACE_ROOT, 'node_modules', '.bin'),
].join(':');

const _registry = new Map();

function _generateRunId() {
  return `run_${crypto.randomBytes(8).toString('hex')}`;
}

function _truncateBuffer(buf, maxBytes) {
  if (!buf || buf.length <= maxBytes) return buf ? buf.toString() : '';
  return buf.slice(0, maxBytes).toString();
}

function _validateEnv(env) {
  if (!env || typeof env !== 'object') return null;
  for (const key of Object.keys(env)) {
    const upper = key.toUpperCase();
    if (BLOCKED_ENV_KEYS.includes(upper)) {
      return `blocked env key: ${key}`;
    }
  }
  return null;
}

const SAFE_PATH_PREFIXES = [
  '/usr/', '/bin/', '/sbin/', '/etc/', '/tmp/', '/dev/',
  '/nix/', '/proc/', '/sys/',
];

function _isSystemPath(p) {
  for (const prefix of SAFE_PATH_PREFIXES) {
    if (p.startsWith(prefix)) return true;
  }
  return false;
}

function _extractCommandPaths(command) {
  const paths = [];
  const tokens = command.split(/\s+/);
  for (const token of tokens) {
    const clean = token.replace(/^["']|["']$/g, '');
    if (clean.includes('/') || clean.includes('..')) {
      paths.push(clean);
    }
  }
  return paths;
}

function _validateCommand(command) {
  if (!command || typeof command !== 'string' || !command.trim()) {
    return 'empty command';
  }
  if (containsDangerousPattern(command)) {
    return 'dangerous command pattern detected';
  }
  const paths = _extractCommandPaths(command);
  for (const p of paths) {
    if (_isSystemPath(p)) continue;
    const resolved = path.resolve(WORKSPACE_ROOT, p);
    if (!isPathWithinWorkspace(resolved)) {
      return `path outside workspace: ${p}`;
    }
  }
  return null;
}

function _buildSpawnEnv(userEnv) {
  const base = { PATH: SAFE_PATH, HOME: process.env.HOME || '/tmp' };
  if (userEnv && typeof userEnv === 'object') {
    Object.assign(base, userEnv);
  }
  base.PATH = SAFE_PATH;
  return base;
}

function _evictLRU() {
  if (_registry.size < MAX_BACKGROUND_PROCESSES) return false;

  let oldestId = null;
  let oldestTime = Infinity;
  for (const [id, entry] of _registry) {
    if (entry.status !== 'running' && entry.startTime < oldestTime) {
      oldestTime = entry.startTime;
      oldestId = id;
    }
  }
  if (oldestId) {
    const entry = _registry.get(oldestId);
    if (entry && entry._killTimer) clearTimeout(entry._killTimer);
    _registry.delete(oldestId);
    console.log(`[watchtower] LRU evicted completed ${oldestId}`);
    return true;
  }

  return false;
}

function _killProcess(entry) {
  if (!entry || !entry._process || entry.status !== 'running') return;

  try {
    entry._process.kill('SIGTERM');
    entry._killTimer = setTimeout(() => {
      try {
        if (entry.status === 'running' && entry._process) {
          entry._process.kill('SIGKILL');
          console.log(`[watchtower] SIGKILL sent to ${entry.runId} after grace period`);
        }
      } catch (_) {}
    }, SIGKILL_GRACE_MS);
  } catch (_) {}
}

function execForeground(command, opts = {}) {
  const validation = _validateCommand(command);
  if (validation) {
    console.log(`[watchtower] foreground blocked: ${validation}`);
    return { stdout: '', stderr: `[watchtower] blocked: ${validation}`, exitCode: 1, timedOut: false };
  }

  const envError = _validateEnv(opts.env);
  if (envError) {
    console.log(`[watchtower] foreground env blocked: ${envError}`);
    return { stdout: '', stderr: `[watchtower] blocked: ${envError}`, exitCode: 1, timedOut: false };
  }

  const timeoutMs = opts.timeout || DEFAULT_FG_TIMEOUT_MS;
  const maxOutput = opts.maxOutput || OUTPUT_MAX_BYTES;
  const env = _buildSpawnEnv(opts.env);

  console.log(`[watchtower] foreground exec: ${command} (timeout: ${timeoutMs}ms)`);

  const result = spawnSync('sh', ['-c', command], {
    timeout: timeoutMs,
    cwd: opts.cwd || WORKSPACE_ROOT,
    env,
    maxBuffer: maxOutput,
    killSignal: 'SIGTERM',
  });

  const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM';

  return {
    stdout: _truncateBuffer(result.stdout, maxOutput),
    stderr: _truncateBuffer(result.stderr, maxOutput),
    exitCode: result.status != null ? result.status : (result.signal ? 1 : 0),
    timedOut,
  };
}

function execBackground(command, opts = {}) {
  const validation = _validateCommand(command);
  if (validation) {
    console.log(`[watchtower] background blocked: ${validation}`);
    return { error: `blocked: ${validation}`, runId: null };
  }

  const envError = _validateEnv(opts.env);
  if (envError) {
    console.log(`[watchtower] background env blocked: ${envError}`);
    return { error: `blocked: ${envError}`, runId: null };
  }

  if (_registry.size >= MAX_BACKGROUND_PROCESSES) {
    const evicted = _evictLRU();
    if (!evicted) {
      console.log(`[watchtower] background rejected: capacity full (${_registry.size} running processes)`);
      return { error: `capacity full: ${MAX_BACKGROUND_PROCESSES} background processes running`, runId: null };
    }
  }

  const runId = _generateRunId();
  const timeoutMs = opts.timeout || DEFAULT_BG_TIMEOUT_MS;
  const maxOutput = opts.maxOutput || OUTPUT_MAX_BYTES;
  const env = _buildSpawnEnv(opts.env);

  console.log(`[watchtower] background exec: ${command} (runId: ${runId}, timeout: ${timeoutMs}ms)`);

  const child = spawn('sh', ['-c', command], {
    cwd: opts.cwd || WORKSPACE_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const entry = {
    runId,
    command,
    pid: child.pid,
    startTime: Date.now(),
    status: 'running',
    stdout: '',
    stderr: '',
    exitCode: null,
    timedOut: false,
    _process: child,
    _killTimer: null,
    _timeoutTimer: null,
  };

  child.stdout.on('data', (chunk) => {
    if (entry.stdout.length < maxOutput) {
      entry.stdout += chunk.toString().slice(0, maxOutput - entry.stdout.length);
    }
  });

  child.stderr.on('data', (chunk) => {
    if (entry.stderr.length < maxOutput) {
      entry.stderr += chunk.toString().slice(0, maxOutput - entry.stderr.length);
    }
  });

  child.on('close', (code, signal) => {
    if (entry._timeoutTimer) clearTimeout(entry._timeoutTimer);
    if (entry._killTimer) clearTimeout(entry._killTimer);

    if (entry.status === 'killed') return;

    if (entry.timedOut) {
      entry.status = 'failed';
      entry.exitCode = code != null ? code : 1;
    } else if (code === 0) {
      entry.status = 'done';
      entry.exitCode = 0;
    } else {
      entry.status = 'failed';
      entry.exitCode = code != null ? code : 1;
    }

    entry._process = null;
    console.log(`[watchtower] ${runId} finished: status=${entry.status}, exitCode=${entry.exitCode}`);
  });

  child.on('error', (err) => {
    if (entry._timeoutTimer) clearTimeout(entry._timeoutTimer);
    if (entry._killTimer) clearTimeout(entry._killTimer);
    entry.status = 'failed';
    entry.stderr += `\n[watchtower] spawn error: ${err.message}`;
    entry._process = null;
    console.log(`[watchtower] ${runId} error: ${err.message}`);
  });

  entry._timeoutTimer = setTimeout(() => {
    if (entry.status !== 'running') return;
    entry.timedOut = true;
    console.log(`[watchtower] ${runId} timed out after ${timeoutMs}ms`);
    _killProcess(entry);
  }, timeoutMs);

  _registry.set(runId, entry);

  return { runId, pid: child.pid };
}

function pollProcess(runId) {
  const entry = _registry.get(runId);
  if (!entry) return null;
  return {
    runId: entry.runId,
    command: entry.command,
    pid: entry.pid,
    startTime: entry.startTime,
    status: entry.status,
    stdout: entry.stdout,
    stderr: entry.stderr,
    exitCode: entry.exitCode,
    timedOut: entry.timedOut,
    elapsedMs: Date.now() - entry.startTime,
  };
}

function stopProcess(runId) {
  const entry = _registry.get(runId);
  if (!entry) return { error: 'not found' };
  if (entry.status !== 'running') return { status: entry.status, message: 'already finished' };

  entry.status = 'killed';
  _killProcess(entry);
  if (entry._timeoutTimer) clearTimeout(entry._timeoutTimer);
  console.log(`[watchtower] ${runId} killed by request`);
  return { status: 'killed', runId };
}

function listProcesses() {
  const result = [];
  for (const [, entry] of _registry) {
    result.push({
      runId: entry.runId,
      command: entry.command,
      pid: entry.pid,
      startTime: entry.startTime,
      status: entry.status,
      exitCode: entry.exitCode,
      timedOut: entry.timedOut,
      elapsedMs: Date.now() - entry.startTime,
    });
  }
  return result;
}

function clearRegistry() {
  for (const [, entry] of _registry) {
    if (entry.status === 'running') {
      _killProcess(entry);
    }
    if (entry._timeoutTimer) clearTimeout(entry._timeoutTimer);
    if (entry._killTimer) clearTimeout(entry._killTimer);
  }
  _registry.clear();
  console.log('[watchtower] registry cleared');
}

function getRegistrySize() {
  return _registry.size;
}

function _cleanupCompleted() {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, entry] of _registry) {
    if (entry.status !== 'running' && now - entry.startTime > COMPLETED_TTL_MS) {
      if (entry._killTimer) clearTimeout(entry._killTimer);
      _registry.delete(id);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[watchtower] auto-cleaned ${cleaned} completed processes`);
  }
}

const _cleanupTimer = setInterval(_cleanupCompleted, CLEANUP_INTERVAL_MS);
_cleanupTimer.unref();

module.exports = {
  execForeground,
  execBackground,
  pollProcess,
  stopProcess,
  listProcesses,
  clearRegistry,
  getRegistrySize,
  MAX_BACKGROUND_PROCESSES,
  OUTPUT_MAX_BYTES,
  DEFAULT_FG_TIMEOUT_MS,
  DEFAULT_BG_TIMEOUT_MS,
  BLOCKED_ENV_KEYS,
};
