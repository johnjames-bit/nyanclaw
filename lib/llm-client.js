/**
 * LLM Client - Unified interface for multiple providers
 * Supports: MiniMax, Ollama (Qwen), Groq (if available)
 */

const axios = require('axios');

const PROVIDERS = {
  MINIMAX: 'minimax',
  OLLAMA: 'ollama',
  GROQ: 'groq'
};

/**
 * Call LLM with given provider
 */
async function callLLM(prompt, options = {}) {
  const {
    provider = PROVIDERS.MINIMAX,
    model = null,
    temperature = 0.7,
    maxTokens = 2000
  } = options;

  if (provider === PROVIDERS.MINIMAX) {
    return await callMiniMax(prompt, { model, temperature, maxTokens });
  } else if (provider === PROVIDERS.OLLAMA) {
    return await callOllama(prompt, { model: model || 'qwen2.5-coder:7b', temperature, maxTokens });
  } else if (provider === PROVIDERS.GROQ) {
    return await callGroq(prompt, { model: model || 'llama-3.1-8b-instant', temperature, maxTokens });
  }
  
  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * MiniMax API call
 */
async function callMiniMax(prompt, options = {}) {
  const { 
    model = 'abab6.5s-chat', 
    temperature = 0.7, 
    maxTokens = 2000 
  } = options;
  
  // MiniMax endpoint (placeholder - needs actual API key)
  const endpoint = 'https://api.minimax.chat/v1/text/chatcompletion_pro';
  
  // This would need actual API key from config
  const apiKey = process.env.MINIMAX_API_KEY || 'placeholder';
  
  try {
    const response = await axios.post(endpoint, {
      model,
      messages: [{ role: 'user', content: prompt }],
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
    console.error('MiniMax error:', e.message);
    // Fallback to Ollama
    console.log('Falling back to Ollama...');
    return await callOllama(prompt, options);
  }
}

/**
 * Ollama API call (local)
 */
async function callOllama(prompt, options = {}) {
  const { 
    model = 'qwen2.5-coder:7b', 
    temperature = 0.7, 
    maxTokens = 2000 
  } = options;
  
  const endpoint = 'http://localhost:11434/api/chat';
  
  try {
    const response = await axios.post(endpoint, {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      stream: false
    }, {
      timeout: 120000 // 2 min timeout
    });
    
    return response.data.message?.content || '';
  } catch (e) {
    console.error('Ollama error:', e.message);
    throw new Error(`Ollama unavailable: ${e.message}`);
  }
}

/**
 * Groq API call
 */
async function callGroq(prompt, options = {}) {
  const { 
    model = 'llama-3.1-8b-instant', 
    temperature = 0.7, 
    maxTokens = 2000 
  } = options;
  
  const endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  const apiKey = process.env.GROQ_API_KEY || process.env.PLAYGROUND_GROQ_TOKEN || 'placeholder';
  
  try {
    const response = await axios.post(endpoint, {
      model,
      messages: [{ role: 'user', content: prompt }],
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
    console.error('Groq error:', e.message);
    throw new Error(`Groq unavailable: ${e.message}`);
  }
}

/**
 * Smart provider selection - try in order of preference
 */
async function callWithFallback(prompt, options = {}) {
  // If single provider specified, try just that one
  if (options.provider) {
    try {
      console.log(`Trying ${options.provider}...`);
      return await callLLM(prompt, options);
    } catch (e) {
      console.log(`${options.provider} failed: ${e.message}`);
      throw e;
    }
  }
  
  // Default: try Minimax first, then Ollama
  const providers = [PROVIDERS.MINIMAX, PROVIDERS.OLLAMA];
  let lastError = null;
  
  for (const provider of providers) {
    try {
      console.log(`Trying ${provider}...`);
      return await callLLM(prompt, { ...options, provider });
    } catch (e) {
      console.log(`${provider} failed: ${e.message}`);
      lastError = e;
    }
  }
  
  throw lastError || new Error('All providers failed');
}

module.exports = {
  PROVIDERS,
  callLLM,
  callMiniMax,
  callOllama,
  callGroq,
  callWithFallback
};
