/**
 * Response Hooks Manager
 * Logs responses to file + sends CC to WhatsApp
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const LOG_DIR = process.env.OPENCLAW_WORKSPACE 
  ? path.join(process.env.OPENCLAW_WORKSPACE, 'logs')
  : path.join(__dirname, '..', 'logs');

const CC_NUMBER = process.env.WHATSAPP_CC_NUMBER || null; // No default - must be explicitly set
const GATEWAY_PORT = process.env.OPENCLAW_PORT || 18789;
const MAX_LOG_FILES = 7; // Keep 7 days of logs
let _lastCleanup = 0;
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

// Shared PII stripping
const { stripPII } = require('../pii-strip');

/**
 * Get today's log file path
 */
function getLogFile() {
  return path.join(LOG_DIR, `responses-${new Date().toISOString().split('T')[0]}.jsonl`);
}

/**
 * Clean old log files (once per hour)
 */
function cleanupOldLogs() {
  const now = Date.now();
  if (now - _lastCleanup < CLEANUP_INTERVAL) return;
  _lastCleanup = now;
  
  try {
    if (!fs.existsSync(LOG_DIR)) return;
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith('responses-') && f.endsWith('.jsonl'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(LOG_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    
    files.slice(MAX_LOG_FILES).forEach(f => {
      fs.unlinkSync(path.join(LOG_DIR, f.name));
      console.log('[hooks] Deleted old log:', f.name);
    });
  } catch (e) {
    console.log('[hooks] Cleanup error:', e.message);
  }
}

/**
 * Log response to file (with PII stripping)
 */
function logToFile(data) {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    
    // Clean old logs on each write
    cleanupOldLogs();
    
    // Strip PII from query
    const safe = {
      ...data,
      query: data.query ? stripPII(data.query) : undefined
    };
    
    const entry = {
      ts: new Date().toISOString(),
      ...safe
    };
    fs.appendFileSync(getLogFile(), JSON.stringify(entry) + '\n');
    return true;
  } catch (e) {
    console.error('[hooks] Log failed:', e.message);
    return false;
  }
}

/**
 * Send CC to WhatsApp via gateway API
 */
async function sendCC(responseText) {
  try {
    await axios.post(`http://localhost:${GATEWAY_PORT}/api/message`, {
      channel: 'whatsapp',
      target: CC_NUMBER,
      message: responseText.substring(0, 4096)
    }, { timeout: 5000 });
    return true;
  } catch (e) {
    console.log('[hooks] CC via gateway failed:', e.message);
    return false;
  }
}

/**
 * Process response through hooks
 */
async function processHooks(response, context) {
  const results = {};
  
  // Always log (PII stripped)
  const responseText = typeof response === 'string' ? response : JSON.stringify(response);
  results.logged = logToFile({
    sessionKey: context.sessionKey,
    channel: context.channel,
    query: context.query?.substring(0, 500), // Strip at write time
    response: stripPII(responseText.substring(0, 2000)),
    provider: context.provider,
    source: context.source,
    latencyMs: context.latencyMs
  });
  
  // CC for main session (skip if already via WhatsApp or no CC_NUMBER)
  if (CC_NUMBER && context.sessionKey === 'agent:main:main' && context.channel !== 'whatsapp') {
    const responseText = typeof response === 'string' ? response : JSON.stringify(response);
    results.cc = await sendCC(responseText);
    if (results.cc) {
      console.log('[hooks] CC sent to', CC_NUMBER);
    }
  }
  
  return results;
}

module.exports = {
  processHooks,
  logToFile,
  sendCC,
  getLogFile
};
