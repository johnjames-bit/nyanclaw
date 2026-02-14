/**
 * Environment Detector
 * Probes local Ollama, checks API keys, detects runtime environment.
 * Returns structured report for startup TUI and dynamic chain building.
 */

const axios = require('axios');

const ENV_TYPES = {
  LOCAL: 'local',
  CLOUD: 'cloud',
  REPLIT_DEV: 'replit-dev'
};

function detectRuntime() {
  if (process.env.REPL_ID || process.env.REPLIT_DEV_DOMAIN) {
    return ENV_TYPES.REPLIT_DEV;
  }
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RENDER_SERVICE_ID || process.env.FLY_APP_NAME || process.env.HEROKU_APP_NAME) {
    return ENV_TYPES.CLOUD;
  }
  return ENV_TYPES.LOCAL;
}

async function probeOllama() {
  const url = process.env.OLLAMA_URL || 'http://localhost:11434';
  const apiUrl = url.replace(/\/api\/chat$/, '');
  try {
    const res = await axios.get(`${apiUrl}/api/tags`, { timeout: 3000 });
    const models = (res.data.models || []).map(m => m.name);
    return { available: true, url: apiUrl, models, latency: 'local' };
  } catch (e) {
    return { available: false, url: apiUrl, models: [], error: e.message };
  }
}

function checkProvider(name, keyEnvVar, altKeyEnvVar) {
  const key = process.env[keyEnvVar] || (altKeyEnvVar ? process.env[altKeyEnvVar] : null);
  return {
    name,
    configured: !!key,
    keySource: key ? keyEnvVar : null
  };
}

function checkAllProviders() {
  return {
    minimax: checkProvider('MiniMax', 'MINIMAX_API_KEY'),
    claude: checkProvider('Claude', 'ANTHROPIC_API_KEY'),
    groq: checkProvider('Groq', 'GROQ_API_KEY', 'PLAYGROUND_GROQ_TOKEN'),
    openai: checkProvider('OpenAI', 'OPENAI_API_KEY')
  };
}

function buildDynamicChain(ollamaStatus, providers) {
  const chain = [];

  if (providers.minimax.configured) chain.push('minimax');
  if (providers.groq.configured) chain.push('groq');
  if (providers.claude.configured) chain.push('claude');
  if (providers.openai.configured) chain.push('openai');

  if (ollamaStatus.available) {
    chain.push('ollama');
  }

  return chain;
}

async function detectEnvironment() {
  const runtime = detectRuntime();
  const ollama = await probeOllama();
  const providers = checkAllProviders();
  const chain = buildDynamicChain(ollama, providers);
  const nyanApi = !!process.env.NYAN_API_TOKEN;

  return {
    runtime,
    ollama,
    providers,
    chain,
    nyanApi,
    ready: chain.length > 0,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  detectEnvironment,
  detectRuntime,
  probeOllama,
  checkAllProviders,
  buildDynamicChain,
  ENV_TYPES
};
