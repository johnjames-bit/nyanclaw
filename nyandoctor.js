#!/usr/bin/env node
/**
 * NyanDoctor — diagnose and auto-fix common issues
 *
 * Usage:
 *   node nyandoctor.js              # diagnose only (safe, read-only)
 *   node nyandoctor.js --fix        # diagnose + auto-repair what we can
 *   node nyandoctor.js --json       # machine-parseable JSON output (CI/scripting)
 *   node nyandoctor.js --json --fix # JSON output + auto-repair
 */

// Note: dotenv loaded differently in OpenClaw context
const fs = require('fs');
const path = require('path');
const net = require('net');
const axios = require('axios');
const { execSync } = require('child_process');

// Load .env if exists
const ENV_PATH = path.join(__dirname, '.env');
if (fs.existsSync(ENV_PATH)) {
  const envContent = fs.readFileSync(ENV_PATH, 'utf8');
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const [key, ...vals] = line.split('=');
    if (key) process.env[key] = vals.join('=').trim();
  });
}

const FIX = process.argv.includes('--fix');
const JSON_MODE = process.argv.includes('--json');

const C = JSON_MODE ? {
  reset: '', bold: '', dim: '', green: '', red: '', yellow: '', cyan: '', white: ''
} : {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

let passed = 0;
let warned = 0;
let failed = 0;
const issues = [];
const checks = [];

function ok(label, detail) {
  passed++;
  checks.push({ status: 'ok', label, detail: detail || null });
  if (!JSON_MODE) console.log(`  ${C.green}[ok]${C.reset} ${label}${detail ? ` ${C.dim}${detail}${C.reset}` : ''}`);
}

function warn(label, detail, fixable) {
  warned++;
  checks.push({ status: 'warn', label, detail: detail || null, fixable: !!fixable });
  issues.push({ label, detail, fixable: !!fixable });
  if (!JSON_MODE) {
    const tag = fixable ? `${C.yellow}[!!]${C.reset}` : `${C.yellow}[--]${C.reset}`;
    console.log(`  ${tag} ${label}${detail ? ` ${C.dim}${detail}${C.reset}` : ''}`);
  }
}

function fail(label, detail, fixable) {
  failed++;
  checks.push({ status: 'fail', label, detail: detail || null, fixable: !!fixable });
  issues.push({ label, detail, fixable: !!fixable });
  if (!JSON_MODE) {
    const tag = fixable ? `${C.red}[FX]${C.reset}` : `${C.red}[!!]${C.reset}`;
    console.log(`  ${tag} ${label}${detail ? ` ${C.dim}${detail}${C.reset}` : ''}`);
  }
}

function fixed(label, detail) {
  checks.push({ status: 'fixed', label, detail: detail || null });
  if (!JSON_MODE) console.log(`  ${C.cyan}[fx]${C.reset} ${label}${detail ? ` ${C.dim}${detail}${C.reset}` : ''}`);
}

function info(label, detail) {
  checks.push({ status: 'info', label, detail: detail || null });
  if (!JSON_MODE) console.log(`  ${C.dim}[--]${C.reset} ${C.dim}${label}${detail ? ` — ${detail}` : ''}${C.reset}`);
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(port, '0.0.0.0');
  });
}

async function run() {
  if (!JSON_MODE) {
    console.log('');
    console.log(`${C.bold}${C.cyan}  ╔══════════════════════════════════╗${C.reset}`);
    console.log(`${C.bold}${C.cyan}  ║   ${C.white}NYANDOCTOR${C.cyan}  ${C.dim}${FIX ? '--fix' : 'diagnose'}${C.cyan}    ║${C.reset}`);
    console.log(`${C.bold}${C.cyan}  ╚══════════════════════════════════╝${C.reset}`);
    console.log('');
  }

  // ── 1. node_modules ──
  if (!JSON_MODE) console.log(`${C.bold}  Dependencies${C.reset}`);
  const hasModules = fs.existsSync(path.join(__dirname, 'node_modules'));
  if (hasModules) {
    ok('node_modules', 'installed');
  } else {
    fail('node_modules', 'missing', true);
    if (FIX) {
      fixed('running npm install...');
      try {
        execSync('npm install', { cwd: __dirname, stdio: 'inherit' });
        fixed('node_modules installed');
      } catch (e) {
        fail('npm install failed', e.message);
      }
    }
  }

  const pkgPath = path.join(__dirname, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = Object.keys(pkg.dependencies || {});
    ok('package.json', `${deps.length} dependencies`);
  } else {
    fail('package.json', 'missing');
  }
  if (!JSON_MODE) console.log('');

  // ── 2. .env ──
  if (!JSON_MODE) console.log(`${C.bold}  Environment${C.reset}`);
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    ok('.env file', envPath);
  } else {
    warn('.env file', 'not found — run node setup.js to create', true);
    if (FIX) {
      fixed('running setup.js...');
      try {
        execSync('node setup.js', { cwd: __dirname, stdio: 'inherit' });
      } catch (e) {
        // setup.js boots the server, so ctrl-c is expected
      }
    }
  }
  if (!JSON_MODE) console.log('');

  // ── 3. Privilege ──
  if (!JSON_MODE) console.log(`${C.bold}  Privilege${C.reset}`);
  const privId = process.env.PRIVILEGED_CALLER_ID;
  if (privId && privId.trim()) {
    const ids = privId.split(',').map(s => s.trim()).filter(Boolean);
    const masked = ids.map(id => id.length > 6 ? id.slice(0, 3) + '***' + id.slice(-3) : '***');
    ok('PRIVILEGED_CALLER_ID', `${ids.length} ID(s): ${masked.join(', ')}`);
  } else {
    warn('PRIVILEGED_CALLER_ID', 'not set — prescribe mode locked (secure by default)');
  }
  if (!JSON_MODE) console.log('');

  // ── 4. API Keys ──
  if (!JSON_MODE) console.log(`${C.bold}  Cloud Providers${C.reset}`);
  const cloudKeys = [
    { key: 'MINIMAX_API_KEY', label: 'MiniMax', priority: '1st' },
    { key: 'GROQ_API_KEY', label: 'Groq', priority: '2nd' },
    { key: 'ANTHROPIC_API_KEY', label: 'Claude', priority: '3rd' },
    { key: 'OPENAI_API_KEY', label: 'OpenAI', priority: '4th' },
  ];
  let cloudCount = 0;
  for (const c of cloudKeys) {
    if (process.env[c.key]) {
      cloudCount++;
      ok(c.label, `${c.key} set (${c.priority})`);
    } else {
      info(c.label, `${c.key} not set`);
    }
  }
  if (cloudCount === 0) {
    warn('No cloud providers', 'set at least one API key or use Ollama locally');
  }
  if (!JSON_MODE) console.log('');

  // ── 5. Ollama ──
  if (!JSON_MODE) console.log(`${C.bold}  Ollama (substrate)${C.reset}`);
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  try {
    const res = await axios.get(`${ollamaUrl}/api/tags`, { timeout: 3000 });
    const models = (res.data.models || []).map(m => m.name);
    ok('Ollama', `reachable at ${ollamaUrl}`);
    if (models.length > 0) {
      ok('Models', models.slice(0, 5).join(', ') + (models.length > 5 ? ` +${models.length - 5} more` : ''));
    } else {
      warn('Models', 'no models pulled — run: ollama pull qwen2.5-coder:7b');
    }
  } catch (e) {
    warn('Ollama', `not reachable at ${ollamaUrl} — run: ollama serve`);
  }
  if (cloudCount === 0) {
    try {
      await axios.get(`${ollamaUrl}/api/tags`, { timeout: 1000 });
    } catch {
      fail('No LLM providers', 'no cloud keys AND Ollama unreachable — pipeline will fail');
    }
  }
  if (!JSON_MODE) console.log('');

  // ── 6. Nyan API ──
  if (!JSON_MODE) console.log(`${C.bold}  Nyan API${C.reset}`);
  const nyanToken = process.env.NYAN_API_TOKEN;
  if (!nyanToken) {
    warn('NYAN_API_TOKEN', 'not set — atomic queries will fail');
  } else {
    try {
      const res = await axios.post('https://nyanbook.io/api/v1/nyan', { message: 'ping' }, {
        headers: { 'Authorization': `Bearer ${nyanToken}`, 'Content-Type': 'application/json' },
        timeout: 10000
      });
      if (res.status >= 200 && res.status < 400) {
        ok('Nyan API', 'token valid, endpoint reachable');
      } else {
        warn('Nyan API', `unexpected status ${res.status}`);
      }
    } catch (e) {
      if (e.response && e.response.status === 401) {
        fail('Nyan API', 'token rejected (401) — check NYAN_API_TOKEN');
      } else if (e.response && e.response.status === 429) {
        ok('Nyan API', 'token valid (rate limited, but reachable)');
      } else {
        warn('Nyan API', `connection failed: ${e.message}`);
      }
    }
  }
  if (!JSON_MODE) console.log('');

  // ── 7. Port ──
  if (!JSON_MODE) console.log(`${C.bold}  Network${C.reset}`);
  const portFree = await checkPort(5000);
  if (portFree) {
    ok('Port 5000', 'available');
  } else {
    warn('Port 5000', 'in use — server may already be running, or another process has it');
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (sessionSecret) {
    ok('SESSION_SECRET', 'set (non-localhost auth enabled)');
  } else {
    info('SESSION_SECRET', 'not set (dev mode: all requests trusted)');
  }
  if (!JSON_MODE) console.log('');

  // ── 8. Core files ──
  if (!JSON_MODE) console.log(`${C.bold}  Core Files${C.reset}`);
  const coreFiles = [
    'index.js', 'lib/void-pipeline.js', 'lib/llm-client.js', 'lib/env-detect.js',
    'lib/startup-tui.js', 'lib/context-router.js', 'lib/memory-manager.js',
    'lib/nyan-api.js', 'IDENTITY.md', 'SOUL.md'
  ];
  let missingCore = 0;
  for (const f of coreFiles) {
    if (fs.existsSync(path.join(__dirname, f))) {
      ok(f);
    } else {
      fail(f, 'missing');
      missingCore++;
    }
  }
  if (!JSON_MODE) console.log('');

  // ── 9. Tests ──
  if (!JSON_MODE) console.log(`${C.bold}  Tests${C.reset}`);
  const testPath = path.join(__dirname, 'test', 'run.js');
  if (fs.existsSync(testPath)) {
    try {
      execSync('node test/run.js', { cwd: __dirname, stdio: 'pipe', timeout: 15000 });
      ok('test/run.js', 'all tests passed');
    } catch (e) {
      const output = (e.stdout || '').toString();
      const failMatch = output.match(/(\d+) failed/);
      const failCount = failMatch ? failMatch[1] : '?';
      fail('test/run.js', `${failCount} test(s) failed`);
    }
  } else {
    warn('test/run.js', 'not found');
  }
  if (!JSON_MODE) console.log('');

  // ── Summary ──
  if (JSON_MODE) {
    const result = {
      ok: passed,
      warnings: warned,
      errors: failed,
      healthy: failed === 0 && warned === 0,
      checks,
      issues,
      timestamp: new Date().toISOString()
    };
    console.log(JSON.stringify(result));
  } else {
    console.log(`${C.bold}  ── Summary ──${C.reset}`);
    console.log(`  ${C.green}${passed} ok${C.reset}  ${C.yellow}${warned} warning${warned !== 1 ? 's' : ''}${C.reset}  ${C.red}${failed} error${failed !== 1 ? 's' : ''}${C.reset}`);

    if (issues.length > 0 && !FIX) {
      const fixable = issues.filter(i => i.fixable);
      if (fixable.length > 0) {
        console.log('');
        console.log(`  ${C.cyan}Run ${C.bold}node nyandoctor.js --fix${C.reset}${C.cyan} to auto-repair ${fixable.length} issue(s)${C.reset}`);
      }
    }

    if (failed === 0 && warned === 0) {
      console.log(`  ${C.green}${C.bold}System healthy.${C.reset}`);
    } else if (failed === 0) {
      console.log(`  ${C.yellow}System operational with warnings.${C.reset}`);
    } else {
      console.log(`  ${C.red}System has issues that need attention.${C.reset}`);
    }
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error(`${C.red}Doctor failed:${C.reset}`, e.message);
  process.exit(1);
});
