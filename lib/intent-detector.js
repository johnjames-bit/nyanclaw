/**
 * Intent Detector - Unified O(n) context & intent detection
 * Replaces: context-router.js + code-context.js (merged)
 * Single pass for all triggers, unified file loading
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────
// KEYWORD TRIGGERS (single source of truth)
// ─────────────────────────────────────────────────────────

const TRIGGERS = {
  // Context Router triggers
  philosophy: ['φ', 'phi', 'philosophy', 'nyan', 'fire', 'logos', 'genesis', 'peano', 'dimension', 'gougu', 'tetralemma', 'paticca', 'dependent', 'impermanence', 'suffering', 'awakening', 'dialectic', 'koan', 'void', 'ontology', 'substrate'],
  memory: ['remember', 'past', 'yesterday', 'earlier', 'before', 'context', 'what did we', 'history'],
  tools: ['price', 'weather', 'cpo', 'stock', 'psi-ema', 'model', 'ollama', 'openclaw', 'api', 'token'],
  daily: ['today', 'morning', 'afternoon', 'evening', 'now'],
  
  // Design/Architecture triggers (was in code-context.js)
  design: ['architect', 'design', 'pattern', 'refactor', 'structure', 'module', 'kernel', 'satellite', 'coupling', 'cohesion', 'separation', 'abstraction', 'interface', 'protocol', 'pipeline', 'layer', 'dependency', 'inject', 'composition', 'inheritance', 'encapsulat', 'decouple', 'solid', 'dry', 'kiss', 'yagni', 'clean code', 'code review', 'best practice', 'anti-pattern', 'code smell', 'technical debt', 'monolith', 'microservice', 'event-driven', 'pub-sub', 'observer', 'factory', 'singleton', 'strategy', 'middleware', 'plugin', 'hook', 'extension'],
  
  // Forex triggers (was in forex-fetcher.js)
  forex: ['forex', 'fx', 'exchange rate', 'currency', 'foreign exchange', 'currency pair', 'spot rate', 'usd', 'eur', 'gbp', 'jpy', 'chf', 'aud', 'cad', 'nzd', 'idr', 'sgd', 'cny', 'krw', 'xau', 'dollar', 'euro', 'pound', 'yen', 'franc', 'rupiah', 'yuan', 'won']
};

const FOREX_PAIRS = {
  'EUR/USD': ['eur/usd', 'eurusd', 'euro dollar', 'euro usd', 'eur usd'],
  'GBP/USD': ['gbp/usd', 'gbpusd', 'pound dollar', 'gbp usd', 'sterling dollar'],
  'USD/JPY': ['usd/jpy', 'usdjpy', 'dollar yen', 'usd jpy'],
  'USD/CHF': ['usd/chf', 'usdchf', 'dollar franc', 'usd chf'],
  'AUD/USD': ['aud/usd', 'audusd', 'aussie dollar', 'aud usd'],
  'USD/CAD': ['usd/cad', 'usdcad', 'dollar loonie', 'usd cad'],
  'NZD/USD': ['nzd/usd', 'nzdusd', 'kiwi dollar', 'nzd usd'],
  'EUR/GBP': ['eur/gbp', 'eurgbp', 'euro pound', 'eur gbp'],
  'EUR/JPY': ['eur/jpy', 'eurjpy', 'euro yen', 'eur jpy'],
  'GBP/JPY': ['gbp/jpy', 'gbpjpy', 'pound yen', 'gbp jpy'],
  'USD/IDR': ['usd/idr', 'usdidr', 'dollar rupiah', 'usd idr', 'rupiah'],
  'USD/SGD': ['usd/sgd', 'usdsgd', 'dollar sgd', 'usd sgd', 'singapore dollar'],
  'USD/CNY': ['usd/cny', 'usdcny', 'dollar yuan', 'usd cny', 'yuan', 'renminbi', 'rmb'],
  'USD/KRW': ['usd/krw', 'usdkrw', 'dollar won', 'usd krw', 'korean won'],
  'XAU/USD': ['xau/usd', 'xauusd', 'gold price', 'gold usd', 'gold spot'],
};

// Compile to regex for O(n) matching
const TRIGGER_REGEX = {};
for (const [key, words] of Object.entries(TRIGGERS)) {
  TRIGGER_REGEX[key] = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
}

// ─────────────────────────────────────────────────────────
// FILE LOADING (cached, single read per file)
// ─────────────────────────────────────────────────────────

const _fileCache = new Map();

function readFileCached(filePath) {
  if (_fileCache.has(filePath)) return _fileCache.get(filePath);
  try {
    const fullPath = path.resolve(WORKSPACE, filePath);
    if (!fullPath.startsWith(WORKSPACE)) return null;
    const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : null;
    _fileCache.set(filePath, content);
    return content;
  } catch (e) { return null; }
}

function getDailyFile() {
  const today = new Date().toISOString().split('T')[0];
  const dailyPath = path.join(WORKSPACE, 'memory', `${today}.md`);
  return fs.existsSync(dailyPath) ? `memory/${today}.md` : null;
}

// ─────────────────────────────────────────────────────────
// CORE FUNCTIONS
// ─────────────────────────────────────────────────────────

/**
 * Detect which intent categories match the query
 * @returns {string[]} list of matching triggers
 */
/**
 * Detect intent categories (simplified version)
 * Returns array of matching category names
 */
function detectIntentCategories(query) {
  const q = (query || '').toLowerCase();
  const matched = [];
  
  for (const [key, regex] of Object.entries(TRIGGER_REGEX)) {
    if (regex.test(q)) matched.push(key);
  }
  
  // Special: forex pair detection
  const forexPair = detectForexPair(q);
  if (forexPair) matched.push('forex');
  
  return matched;
}

/**
 * Detect specific forex pair from query
 */
function detectForexPair(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [pair, aliases] of Object.entries(FOREX_PAIRS)) {
    if (aliases.some(a => lower.includes(a))) return pair;
  }
  const slashMatch = text.match(/\b([A-Z]{3})\s*[\/\\]\s*([A-Z]{3})\b/i);
  if (slashMatch) return `${slashMatch[1].toUpperCase()}/${slashMatch[2].toUpperCase()}`;
  return null;
}

/**
 * Check if query is a forex query (for pipeline short-circuit)
 */
function isForexQuery(text) {
  if (!text) return false;
  const q = text.toLowerCase();
  return TRIGGER_REGEX.forex.test(q) || detectForexPair(q) !== null;
}

/**
 * Check if query is a design question (for pipeline)
 */
function isDesignQuestion(text) {
  if (!text) return false;
  return TRIGGER_REGEX.design.test(text);
}

/**
 * Main entry: get context for query
 * Returns: { experts: [], context: string, intents: {}, tokenEstimate: number }
 */
function getContext(query) {
  if (!query) {
    return { experts: ['core'], context: '', intents: {}, tokenEstimate: 0 };
  }

  const q = query.toLowerCase();
  const intents = {};
  const experts = new Set(['core']);
  const contextParts = [];

  // Check each trigger category
  for (const [key, regex] of Object.entries(TRIGGER_REGEX)) {
    if (regex.test(q)) {
      intents[key] = true;
      experts.add(key);
    }
  }

  // Forex pair detection
  const forexPair = detectForexPair(q);
  if (forexPair) {
    intents.forex = { pair: forexPair };
    experts.add('forex');
  }

  // ─── Load files by expert ───
  const EXPERTS = {
    core: ['IDENTITY.md', 'SOUL.md'],
    philosophy: ['PHILOSOPHY.md'],
    tools: ['TOOLS.md'],
    memory: [],
    daily: [],
    design: ['PHILOSOPHY.md', 'lib/README.md'],
    forex: []
  };

  // Daily file
  const dailyFile = getDailyFile();
  if (dailyFile) {
    EXPERTS.daily = [dailyFile];
    intents.daily = true;
  }

  const seen = new Set();
  for (const expert of experts) {
    const files = EXPERTS[expert] || [];
    for (const file of files) {
      if (seen.has(file)) continue;
      seen.add(file);
      const content = readFileCached(file);
      if (content) {
        const label = expert.toUpperCase();
        const truncated = content.length > 4000 ? content.slice(0, 4000) + '\n...(truncated)' : content;
        contextParts.push(`--- ${label}: ${file} ---\n${truncated}`);
      }
    }
  }

  const fullContext = contextParts.join('\n\n');
  return {
    experts: Array.from(experts),
    context: fullContext,
    intents,
    tokenEstimate: Math.ceil(fullContext.split(' ').length * 1.3)
  };
}

/**
 * Build forex context for pipeline injection
 */
function buildForexContext(query) {
  const pair = detectForexPair(query);
  if (!pair) return null;
  return {
    type: 'forex',
    pair,
    systemPrompt: `The user is asking about ${pair}. Provide current rate context, recent trend if known, and relevant factors. Be concise and data-focused.`
  };
}

/**
 * Get design context (for pipeline)
 */
function getDesignContext() {
  const parts = [];
  const phil = readFileCached('PHILOSOPHY.md');
  if (phil) parts.push(phil.slice(0, 4000));
  const readme = readFileCached('lib/README.md');
  if (readme) parts.push(readme.slice(0, 2000));
  return parts.length ? parts.join('\n\n') : null;
}

/**
 * Fetch forex rate via Nyan API (moved from forex-fetcher.js)
 */
async function fetchForexRate(pair) {
  if (!pair) return null;
  try {
    const { atomicQuery } = require('./nyan-api');
    const result = await atomicQuery(
      `Current ${pair} exchange rate. Reply with ONLY the number (e.g. 1.0842). No text.`,
      'forex'
    );
    if (!result || !result.success) return null;
    const numMatch = (result.response || '').match(/[\d]+\.[\d]+/);
    if (numMatch) {
      return { pair, rate: parseFloat(numMatch[0]), source: 'nyanbook.io', timestamp: new Date().toISOString(), raw: result.response };
    }
    return { pair, rate: null, source: 'nyanbook.io', timestamp: new Date().toISOString(), raw: result.response };
  } catch (e) {
    console.error(`[forex] fetchForexRate(${pair}) failed:`, e.message);
    return null;
  }
}

// Clear cache (for testing)
function clearCache() { _fileCache.clear(); }

module.exports = {
  detectIntentCategories,
  getContext,
  isForexQuery,
  isDesignQuestion,
  detectForexPair,
  fetchForexRate,
  buildForexContext,
  getDesignContext,
  clearCache,
  TRIGGERS,
  FOREX_PAIRS
};
