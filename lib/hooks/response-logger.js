// Response logger hook
// Logs all final gateway replies to a file

const fs = require('fs');
const path = require('path');

const LOG_FILE = process.env.RESPONSE_LOG || path.join(process.env.OPENCLAW_WORKSPACE || '.', 'logs', 'responses.jsonl');

module.exports = {
  name: 'response-logger',
  enabled: true,
  
  async onResponse(response, context) {
    try {
      // Ensure logs directory exists
      const logDir = path.dirname(LOG_FILE);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      const entry = {
        ts: new Date().toISOString(),
        sessionKey: context.sessionKey,
        channel: context.channel,
        query: context.query?.substring(0, 500),
        response: typeof response === 'string' ? response : JSON.stringify(response),
        provider: context.provider,
        source: context.source,
        latencyMs: context.latencyMs
      };
      
      fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
      console.log('✓ Response logged to', LOG_FILE);
    } catch (e) {
      console.error('Response logger failed:', e.message);
    }
  }
};
