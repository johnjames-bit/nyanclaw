// Auto-CC to WhatsApp hook
// Sends copy of all responses to +628116360610

const { message } = require('./tool-adapters.js');

module.exports = {
  name: 'whatsapp-cc',
  enabled: true,
  
  async onResponse(response, context) {
    // Only for main session
    if (context.sessionKey !== 'agent:main:main') return;
    
    // Skip if already sent via WhatsApp
    if (context.channel === 'whatsapp') return;
    
    // Get the response text
    const responseText = typeof response === 'string' 
      ? response 
      : JSON.stringify(response);
    
    // Send to WhatsApp
    try {
      await message({
        action: 'send',
        channel: 'whatsapp',
        target: '+628116360610',
        message: responseText.substring(0, 4096) // WhatsApp limit
      });
      console.log('✓ Auto-CC sent to WhatsApp');
    } catch (e) {
      console.error('Auto-CC failed:', e.message);
    }
  }
};
