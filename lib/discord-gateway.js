/**
 * Discord Gateway - Event-Driven (No Polling)
 * Discord PUSHES messages via Gateway events → no scraping detection
 * 
 * Based on Replit's approach, synthesized for local void-pipeline
 */

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { runPipeline } = require('./void-pipeline');

let _client = null;
let _chain = null;

// Config - read from environment
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const MAX_CHUNK = 2000;

/**
 * Chunk response to fit Discord's 2000 char limit
 */
function chunkText(text, maxLen = MAX_CHUNK) {
  if (!text || text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Try to split at newline, then space, then hard split
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf(' ', maxLen);
    if (splitAt < maxLen * 0.3) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks;
}

/**
 * Start Discord Gateway - event-driven
 */
function start(options = {}) {
  if (!TOKEN) {
    console.log('[discord-gw] no DISCORD_BOT_TOKEN — disabled');
    return null;
  }

  _chain = options.chain || null;

  _client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });

  // Connection events
  _client.once('ready', () => {
    console.log(`[discord-gw] connected as ${_client.user.tag}`);
    console.log(`[discord-gw] serving ${_client.guilds.cache.size} server(s)`);
  });

  _client.on('error', err => {
    console.error(`[discord-gw] error: ${err.message}`);
  });

  _client.on('disconnect', () => {
    console.log('[discord-gw] disconnected');
  });

  // MESSAGE_CREATE - Discord pushes to us (no polling!)
  _client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;

    const isMentioned = msg.mentions.has(_client.user);
    const isDM = !msg.guild;

    // Accept: mentioned in channel OR DM
    if (!isMentioned && !isDM) return;

    // Clean query - remove mention
    let query = msg.content;
    if (isMentioned) {
      query = query.replace(/<@!?\d+>/g, '').trim();
    }
    if (!query) return;

    // Map to void-pipeline format
    const sessionKey = isDM 
      ? `discord:dm:${msg.channel.id}` 
      : `discord:channel:${msg.channel.id}`;
    const callerId = `discord:${msg.author.id}`;

    console.log(`[discord-gw] ${callerId}: ${query.slice(0, 50)}...`);

    try {
      await msg.channel.sendTyping();
      
      const result = await runPipeline({
        query,
        sessionId: sessionKey,
        callerId,
        chain: _chain || undefined,
      });

      const response = result?.response || '🔥 nyan~';
      
      // Send chunks
      for (const chunk of chunkText(response)) {
        await msg.reply({ content: chunk, allowedMentions: { repliedUser: false } });
      }
    } catch (e) {
      console.error(`[discord-gw] pipeline error: ${e.message}`);
      try {
        await msg.reply({ content: `[error] ${e.message}`, allowedMentions: { repliedUser: false } });
      } catch (replyErr) {
        console.error(`[discord-gw] reply failed: ${replyErr.message}`);
      }
    }
  });

  // Login
  _client.login(TOKEN).catch(e => {
    console.error(`[discord-gw] login failed: ${e.message}`);
  });

  return _client;
}

/**
 * Stop gracefully
 */
function stop() {
  if (_client) {
    _client.destroy();
    _client = null;
    console.log('[discord-gw] stopped');
  }
}

/**
 * Health check
 */
function status() {
  if (!_client) return { state: 'stopped' };
  if (!_client.isReady()) return { state: 'connecting' };
  return {
    state: 'connected',
    user: _client.user?.tag,
    guilds: _client.guilds?.cache.size || 0,
  };
}

module.exports = { 
  start, 
  stop, 
  status, 
  chunkText,
  startDiscordGateway: start,
  stopDiscordGateway: stop,
  getDiscordStatus: status
};
