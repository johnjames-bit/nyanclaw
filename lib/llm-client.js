/**
 * LLM Client - Unified interface for multiple providers
 * Supports: MiniMax, Groq, Claude, OpenAI, Ollama (substrate)
 * Dynamic chain built at startup via env-detect.js
 */

const axios = require('axios');

const PROVIDERS = {
  MINIMAX: 'minimax',
  GROQ: 'groq',
  CLAUDE: 'claude',
  OPENAI: 'openai',
  OLLAMA: 'ollama'
};

// Context limits for all providers
const CONTEXT_LIMITS = {
  [PROVIDERS.MINIMAX]: { contextWindow: 200000 },
  [PROVIDERS.GROQ]: { contextWindow: 128000 },
  [PROVIDERS.CLAUDE]: { contextWindow: 200000, maxOutputTokens: 8192 },
  [PROVIDERS.OPENAI]: { contextWindow: 128000, maxOutputTokens: 16384 },
  [PROVIDERS.OLLAMA]: { contextWindow: 32768 }
};

// Default fallback chain
let DYNAMIC_CHAIN = [PROVIDERS.MINIMAX, PROVIDERS.OLLAMA];

/**
 * Set dynamic chain from env-detect
 */
function setDynamicChain(chain) {
  if (chain && Array.isArray(chain) && chain.length > 0) {
    // Keep lowercase to match PROVIDERS values
    DYNAMIC_CHAIN = chain.map(p => p.toLowerCase());
    console.log('[llm-client] Dynamic chain set:', DYNAMIC_CHAIN.join(' -> '));
  }
}

/**
 * Build messages array with system prompt
 */
function buildMessages(systemPrompt, userPrompt) {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userPrompt });
  return messages;
}

/**
 * Call LLM with given provider
 */
async function callLLM(prompt, options = {}) {
  const {
    provider = null, // null = use dynamic chain
    system = null,
    model = null,
    temperature = 0.7,
    maxTokens = 2000
  } = options;

  // If specific provider requested, use it directly
  if (provider) {
    return await routeToProvider(provider, prompt, { system, model, temperature, maxTokens });
  }

  // Otherwise, try dynamic chain with error accumulation
  const errors = [];
  for (const prov of DYNAMIC_CHAIN) {
    try {
      const result = await routeToProvider(prov, prompt, { system, model, temperature, maxTokens });
      return result;
    } catch (e) {
      errors.push(`${prov}: ${e.message}`);
      console.log(`[llm-client] ${prov} failed: ${e.message}, trying next...`);
    }
  }

  throw new Error(`All providers failed: ${errors.join(' | ')}`);
}

/**
 * Route to specific provider
 */
async function routeToProvider(provider, prompt, options) {
  const { system, model, temperature, maxTokens } = options;
  const prov = provider.toLowerCase();

  if ((prov === 'minimax' || prov === PROVIDERS.MINIMAX)) {
    return await callMiniMax(prompt, { system, model, temperature, maxTokens });
  } else if ((prov === 'groq' || prov === PROVIDERS.GROQ)) {
    return await callGroq(prompt, { system, model, temperature, maxTokens });
  } else if ((prov === 'claude' || prov === PROVIDERS.CLAUDE)) {
    return await callClaude(prompt, { system, model, temperature, maxTokens });
  } else if ((prov === 'openai' || prov === PROVIDERS.OPENAI)) {
    return await callOpenAI(prompt, { system, model, temperature, maxTokens });
  } else if ((prov === 'ollama' || prov === PROVIDERS.OLLAMA)) {
    return await callOllama(prompt, { system, model, temperature, maxTokens });
  }

  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * MiniMax API call
 */
async function callMiniMax(prompt, options = {}) {
  const { system, model = 'MiniMax-M2.5', temperature = 0.7, maxTokens = 2000 } = options;
  const apiKey = process.env.MINIMAX_API_KEY;
  
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY not set');
  }

  try {
    const response = await axios.post('https://api.minimax.io/v1/text/chatcompletion_v2', {
      model,
      messages: buildMessages(system, prompt),
      temperature,
      max_tokens: maxTokens
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    return response.data.choices?.[0]?.message?.content || '';
  } catch (e) {
    throw new Error(`MiniMax error: ${e.message}`);
  }
}

/**
 * Groq API call
 */
async function callGroq(prompt, options = {}) {
  const { system, model = 'llama-3.1-70b-versatile', temperature = 0.7, maxTokens = 2000 } = options;
  const apiKey = process.env.GROQ_API_KEY || process.env.PLAYGROUND_GROQ_TOKEN;
  
  if (!apiKey) {
    throw new Error('GROQ_API_KEY not set');
  }

  try {
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model,
      messages: buildMessages(system, prompt),
      temperature,
      max_tokens: maxTokens
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    return response.data.choices?.[0]?.message?.content || '';
  } catch (e) {
    throw new Error(`Groq error: ${e.message}`);
  }
}

/**
 * Claude API call (via Anthropic Messages API)
 */
async function callClaude(prompt, options = {}) {
  const { system, model = 'claude-sonnet-4-20250514', temperature = 0.7, maxTokens = 2000 } = options;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set');
  }

  try {
    const messages = [{ role: 'user', content: prompt }];

    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model,
      system, // Top-level system parameter
      messages,
      temperature,
      max_tokens: maxTokens
    }, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    });
    
    return response.data.content?.[0]?.text || '';
  } catch (e) {
    throw new Error(`Claude error: ${e.message}`);
  }
}

/**
 * OpenAI API call
 */
async function callOpenAI(prompt, options = {}) {
  const { system, model = 'gpt-4o', temperature = 0.7, maxTokens = 2000 } = options;
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model,
      messages: buildMessages(system, prompt),
      temperature,
      max_tokens: maxTokens
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    return response.data.choices?.[0]?.message?.content || '';
  } catch (e) {
    throw new Error(`OpenAI error: ${e.message}`);
  }
}

/**
 * Ollama API call (local substrate)
 */
async function callOllama(prompt, options = {}) {
  const { system, model = 'qwen2.5-coder:7b', temperature = 0.7, maxTokens = 2000 } = options;
  const ctxLimit = CONTEXT_LIMITS[PROVIDERS.OLLAMA]?.contextWindow;
  
  const endpoint = 'http://localhost:11434/api/chat';
  
  const body = {
    model,
    messages: buildMessages(system, prompt),
    temperature,
    stream: false,
    options: {}
  };
  if (maxTokens) body.options.num_predict = maxTokens;
  if (ctxLimit) body.options.num_ctx = ctxLimit;
  
  try {
    const response = await axios.post(endpoint, body, { timeout: 120000 });
    return response.data.message?.content || '';
  } catch (e) {
    throw new Error(`Ollama unavailable: ${e.message}`);
  }
}

/**
 * Fallback chain (for backwards compatibility)
 */
async function callWithFallback(prompt, options = {}) {
  return await callLLM(prompt, options);
}

/**
 * Estimate token count (rough: ~4 chars per token)
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Get smallest context limit in chain
 */
function getMinContextLimit(chain = DYNAMIC_CHAIN) {
  let min = Infinity;
  for (const prov of chain) {
    const limit = CONTEXT_LIMITS[prov]?.contextWindow;
    if (limit && limit < min) min = limit;
  }
  return min === Infinity ? 128000 : min;
}

/**
 * Truncate text to fit within token budget
 */
function truncateToTokens(text, maxTokens) {
  if (!text || !maxTokens) return text;
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return text;
  const targetLen = maxTokens * 4;
  return text.slice(0, targetLen) + '\n...(truncated)';
}

module.exports = {
  PROVIDERS,
  CONTEXT_LIMITS,
  estimateTokens,
  getMinContextLimit,
  truncateToTokens,
  callLLM,
  callWithFallback,
  setDynamicChain,
  buildMessages,
  callMiniMax,
  callGroq,
  callClaude,
  callOpenAI,
  callOllama
};
