#!/usr/bin/env node
/**
 * Model Fallback Router
 * Tries primary model (MiniMax), falls back to local (Qwen) on failure
 * 
 * Usage: node model-fallback.js "your prompt here"
 */

const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || 'openclaw';
const PRIMARY_MODEL = 'minimax-portal/MiniMax-M2.5';
const FALLBACK_MODEL = 'ollama/qwen2.5-coder:7b';
const GW_URL = 'http://127.0.0.1:18789';

async function callAgent(prompt, model = PRIMARY_MODEL) {
  const response = await fetch(`${GW_URL}/v1/agent/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENCLAW_TOKEN}`
    },
    body: JSON.stringify({
      model: model,
      message: prompt,
      sessionKey: 'agent:main:main'
    })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

async function main() {
  const prompt = process.argv.slice(2).join(' ');
  
  if (!prompt) {
    console.log('Usage: node model-fallback.js "your prompt here"');
    console.log('Models:', PRIMARY_MODEL, '->', FALLBACK_MODEL);
    process.exit(1);
  }
  
  console.log(`[1/2] Trying ${PRIMARY_MODEL}...`);
  
  try {
    const result = await callAgent(prompt, PRIMARY_MODEL);
    console.log(result.message?.content || result);
  } catch (err) {
    console.log(`❌ Primary failed: ${err.message}`);
    console.log(`[2/2] Falling back to ${FALLBACK_MODEL}...`);
    
    try {
      const result = await callAgent(prompt, FALLBACK_MODEL);
      console.log(result.message?.content || result);
    } catch (err2) {
      console.error(`❌ Fallback also failed: ${err2.message}`);
      process.exit(1);
    }
  }
}

main();
