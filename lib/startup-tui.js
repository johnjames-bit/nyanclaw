/**
 * Startup TUI - Terminal UI for environment status and guidance
 * Shows colored banner with provider readiness and setup instructions.
 */

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgBlack: '\x1b[40m',
};

function ok(text) { return `${C.green}[ok]${C.reset} ${text}`; }
function fail(text) { return `${C.red}[--]${C.reset} ${C.dim}${text}${C.reset}`; }
function warn(text) { return `${C.yellow}[!!]${C.reset} ${text}`; }
function info(text) { return `${C.cyan}    ${text}${C.reset}`; }

function runtimeLabel(runtime) {
  switch (runtime) {
    case 'local': return `${C.green}LOCAL${C.reset} ${C.dim}(your machine)${C.reset}`;
    case 'cloud': return `${C.cyan}CLOUD${C.reset} ${C.dim}(deployed)${C.reset}`;
    case 'replit-dev': return `${C.yellow}REPLIT-DEV${C.reset} ${C.dim}(development only)${C.reset}`;
    default: return runtime;
  }
}

function printBanner(env, port) {
  const lines = [];

  lines.push('');
  lines.push(`${C.bold}${C.cyan}  ╔══════════════════════════════════════════╗${C.reset}`);
  lines.push(`${C.bold}${C.cyan}  ║       ${C.white}MY OPENCLAW${C.cyan}  ${C.dim}hybrid ai workspace${C.cyan}  ║${C.reset}`);
  lines.push(`${C.bold}${C.cyan}  ╚══════════════════════════════════════════╝${C.reset}`);
  lines.push('');

  lines.push(`${C.bold}  ENVIRONMENT${C.reset}`);
  lines.push(`  runtime:  ${runtimeLabel(env.runtime)}`);
  lines.push(`  port:     ${C.white}${port}${C.reset}`);
  lines.push(`  nyan-api: ${env.nyanApi ? ok('connected') : fail('no NYAN_API_TOKEN')}`);
  lines.push('');

  lines.push(`${C.bold}  LLM PROVIDERS${C.reset}`);

  if (env.ollama.available) {
    const modelList = env.ollama.models.slice(0, 5).join(', ');
    const extra = env.ollama.models.length > 5 ? ` +${env.ollama.models.length - 5} more` : '';
    lines.push(`  ${ok(`ollama  ${C.dim}${env.ollama.url}${C.reset}`)}`);
    lines.push(info(`models: ${modelList}${extra}`));
  } else {
    lines.push(`  ${fail(`ollama  ${C.dim}(not running at ${env.ollama.url})${C.reset}`)}`);
  }

  const cloudProviders = [
    { key: 'minimax', label: 'minimax', envKey: 'MINIMAX_API_KEY' },
    { key: 'claude', label: 'claude ', envKey: 'ANTHROPIC_API_KEY' },
    { key: 'groq', label: 'groq   ', envKey: 'GROQ_API_KEY' },
    { key: 'openai', label: 'openai ', envKey: 'OPENAI_API_KEY' },
  ];

  for (const p of cloudProviders) {
    const status = env.providers[p.key];
    if (status.configured) {
      lines.push(`  ${ok(`${p.label} ${C.dim}(${p.envKey})${C.reset}`)}`);
    } else {
      lines.push(`  ${fail(`${p.label} ${C.dim}set ${p.envKey} to enable${C.reset}`)}`);
    }
  }

  lines.push('');
  lines.push(`${C.bold}  FALLBACK CHAIN${C.reset}`);
  if (env.chain.length > 0) {
    const chainStr = env.chain.map((p, i) => {
      if (i === 0) return `${C.green}${C.bold}${p}${C.reset}`;
      return `${C.dim}${p}${C.reset}`;
    }).join(` ${C.gray}->${C.reset} `);
    lines.push(`  ${chainStr}`);
  } else {
    lines.push(`  ${C.red}${C.bold}NO PROVIDERS AVAILABLE${C.reset}`);
  }

  lines.push('');
  lines.push(`${C.bold}  MODES${C.reset}`);
  const privIds = (process.env.PRIVILEGED_CALLER_ID || process.env.PRIMARY_CALLER_ID || '').split(',').map(s => s.trim()).filter(Boolean);
  if (privIds.length > 0) {
    const masked = privIds.map(id => id.length > 6 ? id.slice(0, 3) + '***' + id.slice(-3) : '***');
    lines.push(`  ${C.magenta}prescribe${C.reset} ${C.dim}build/kernel  ${C.green}[${masked.join(', ')}]${C.reset}`);
  } else {
    lines.push(`  ${C.magenta}prescribe${C.reset} ${C.dim}build/kernel  ${C.yellow}[locked — set PRIVILEGED_CALLER_ID]${C.reset}`);
  }
  lines.push(`  ${C.cyan}scribe${C.reset}    ${C.dim}create/docs   (open)${C.reset}`);
  lines.push(`  ${C.white}describe${C.reset}  ${C.dim}chat/general  (open)${C.reset}`);

  if (!env.ready) {
    lines.push('');
    lines.push(`${C.red}${C.bold}  WARNING: No LLM providers available!${C.reset}`);
    lines.push(`  ${C.yellow}Shortcuts (identity, psi-ema docs) will still work.${C.reset}`);
    lines.push(`  ${C.yellow}For full functionality, either:${C.reset}`);
    lines.push(`    ${C.white}1. Start Ollama locally: ${C.cyan}ollama serve${C.reset}`);
    lines.push(`    ${C.white}2. Set a cloud API key:${C.reset}`);
    lines.push(`       ${C.dim}export MINIMAX_API_KEY=your_key${C.reset}`);
    lines.push(`       ${C.dim}export ANTHROPIC_API_KEY=your_key${C.reset}`);
    lines.push(`       ${C.dim}export GROQ_API_KEY=your_key${C.reset}`);
  }

  if (env.runtime === 'replit-dev') {
    lines.push('');
    lines.push(`${C.yellow}  NOTE: Running in Replit dev environment.${C.reset}`);
    lines.push(`  ${C.dim}  This is for development/testing only.${C.reset}`);
    lines.push(`  ${C.dim}  For production, deploy to your own infra${C.reset}`);
    lines.push(`  ${C.dim}  with Ollama locally or cloud API keys.${C.reset}`);
  }

  if (env.ollama.available && env.chain[0] === 'ollama') {
    lines.push('');
    lines.push(`  ${C.green}Primary: local Ollama (fastest, private)${C.reset}`);
  }

  lines.push('');
  lines.push(`${C.dim}  endpoints: /api/chat  /api/atomic  /api/psi-ema  /api/search${C.reset}`);
  lines.push(`${C.dim}  status:    /health    /api/modules /api/env${C.reset}`);
  lines.push('');

  console.log(lines.join('\n'));
}

module.exports = { printBanner };
