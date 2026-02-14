/**
 * Response Hooks Manager
 * Logs responses to file + sends CC to WhatsApp
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.OPENCLAW_WORKSPACE 
  ? path.join(process.env.OPENCLAW_WORKSPACE, 'logs')
  : path.join(__dirname, '..', 'logs');

const LOG_FILE = path.join(LOG_DIR, `responses-${new Date().toISOString().split('T')[0]}.jsonl`);
const CC_NUMBER = '+628116360610';

let _messageClient = null;

/**
 * Set message client (for WhatsApp CC)
 */
function setMessageClient(client) {
  _messageClient = client;
}

/**
 * Log response to file
 */
function logToFile(data) {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    const entry = {
      ts: new Date().toISOString(),
      ...data
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
    return true;
  } catch (e) {
    console.error('[hooks] Log failed:', e.message);
    return false;
  }
}

/**
 * Send CC to WhatsApp
 */
async function sendCC(responseText) {
  if (!_messageClient) {
    console.log('[hooks] No message client, skipping CC');
    return false;
  }
  try {
    await _messageClient({
      action: 'send',
      channel: 'whatsapp',
      target: CC_NUMBER,
      message: responseText.substring(0, 4096)
    });
    return true;
  } catch (e) {
    console.error('[hooks] CC failed:', e.message);
    return false;
  }
}

/**
 * Process response through hooks
 */
async function processHooks(response, context) {
  const results = {};
  
  // Always log
  results.logged = logToFile({
    sessionKey: context.sessionKey,
    channel: context.channel,
    query: context.query?.substring(0, 500),
    response: typeof response === 'string' ? response : JSON.stringify(response).substring(0, 2000),
    provider: context.provider,
    source: context.source,
    latencyMs: context.latencyMs
  });
  
  // CC for main session (skip if already via WhatsApp)
  if (context.sessionKey === 'agent:main:main' && context.channel !== 'whatsapp') {
    const responseText = typeof response === 'string' ? response : JSON.stringify(response);
    results.cc = await sendCC(responseText);
  }
  
  return results;
}

module.exports = {
  setMessageClient,
  processHooks,
  logToFile,
  sendCC,
  LOG_FILE
};
