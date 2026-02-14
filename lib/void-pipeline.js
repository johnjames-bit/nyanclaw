/**
 * Void Pipeline - Unified O(n) Single-Pass Orchestrator
 * v2.0 - merged from ProbablyNothing + our Ψ-EMA improvements
 * 
 * MoE-inspired routing: one pass through parallel detection branches,
 * then single LLM call with injected context. No sequential chains.
 *
 * MODES (prescribe/scribe/describe):
 *   prescribe = build (kernel/code) — privileged, +628116360610 only
 *   scribe    = create (docs, legal, apps) — open
 *   describe  = chat (general queries) — open
 */

const { callWithFallback, PROVIDERS, setDynamicChain } = require('./llm-client');
const { getContext } = require('./context-router');
const { getMemoryManager } = require('./memory-manager');
const { atomicQuery, getPsiEMA } = require('./nyan-api');
const envDetect = require('./env-detect');

// Initialize dynamic chain at startup
(async () => {
  try {
    const env = await envDetect.detectEnvironment();
    if (env.chain && env.chain.length > 0) {
      setDynamicChain(env.chain);
    }
  } catch (e) {
    console.log('[pipeline] Could not initialize dynamic chain:', e.message);
  }
})();

const PRIVILEGED_NUMBER = process.env.PRIVILEGED_CALLER_ID || '+628116360610';

// ─────────────────────────────────────────────────────────
// PATTERNS (O(n) regex, no LLM calls)
// ─────────────────────────────────────────────────────────

const IDENTITY_PATTERNS = [
  /who\s+(?:are|is)\s+(?:you|nyan)/i,
  /what\s+(?:are|is)\s+(?:you|nyan)/i,
  /tell\s+me\s+about\s+(?:yourself|nyan)/i,
  /introduce\s+yourself/i,
  /your\s+(?:creator|origin|source|developer)/i,
];

const PSI_EMA_EXPLAIN = [
  /^what\s+is\s+(?:the\s+)?(?:psi|ψ)[\s\-]?ema\??$/i,
  /^(?:explain|describe)\s+(?:the\s+)?(?:psi|ψ)[\s\-]?ema\??$/i,
  /^how\s+does\s+(?:the\s+)?(?:psi|ψ)[\s\-]?ema\s+work\??$/i,
];

const PRESCRIBE_PATTERNS = [
  /\b(build|deploy|install|configure|setup|kernel|system|hardware|code|debug|program|function|refactor|rewrite)\b/i,
];

const SCRIBE_PATTERNS = [
  /\b(draft|write|compose|document|memo|letter|report|contract|agreement|legal|clause|brief|template)\b/i,
];

const STOCK_PATTERN = /\$([A-Z]{1,5})\b/;
const PSI_EMA_TRIGGER = /\b(psi|ψ)[\s\-]?ema\b/i;
const LEGAL_PATTERN = /\b(legal|contract|agreement|clause|liability|indemnity|arbitration|jurisdiction|governing law)\b/i;

// ─────────────────────────────────────────────────────────
// MODE DETECTION (O(n), no LLM)
// ─────────────────────────────────────────────────────────

function detectMode(query) {
  const q = (query || '').trim();
  if (PRESCRIBE_PATTERNS.some(p => p.test(q))) return 'prescribe';
  if (SCRIBE_PATTERNS.some(p => p.test(q))) return 'scribe';
  return 'describe';
}

function checkPrivilege(mode, callerId) {
  if (mode !== 'prescribe') return { allowed: true };
  if (!callerId) return { allowed: false, reason: 'prescribe locked: authentication required' };
  const normalized = callerId.replace(/[\s\-]/g, '');
  const privilegedIds = getPrivilegedIds();
  if (privilegedIds.includes(normalized)) return { allowed: true };
  return { allowed: false, reason: 'prescribe locked: caller not authorized' };
}

function getPrivilegedIds() {
  const priv = process.env.PRIVILEGED_CALLER_ID;
  if (!priv) return [];
  return priv.split(',').map(id => id.trim().replace(/[\s\-]/g, '')).filter(Boolean);
}

function isIdentityQuery(query) {
  // Also match "who made this" pattern
  const q = (query || '').toLowerCase();
  if (IDENTITY_PATTERNS.some(p => p.test(q))) return true;
  return /\b(who made|created|built|developed)\b/i.test(q);
}

function isPsiEmaExplain(query) {
  return PSI_EMA_EXPLAIN.some(p => p.test(query.trim()));
}

function containsDangerousPattern(cmd) {
  // Basic security check - block destructive patterns
  const dangerous = [
    /rm\s+-rf\s+\//, 
    /dd\s+if=/, 
    /:\s*\(\)\s*\{[^}]*:\s*\|[^}]*:\s*&[^}]*\}/,  // fork bomb
    /^shutdown/,
    /chmod\s+777\s+\//,
    /sudo\s+shutdown/
  ];
  return dangerous.some(p => p.test(cmd));
}

function scoreComplexity(query) {
  const q = (query || '').toLowerCase();
  const heavyKeywords = ['analyze', 'compare', 'evaluate', 'synthesize', 'design', 'architecture', 'phi', 'φ', 'why', 'how does', 'meaning', 'philosophy'];
  const lightGreetings = ['hello', 'hi', 'hey', 'what time', 'how are'];
  
  if (lightGreetings.some(g => q.includes(g))) return 'light';
  if (heavyKeywords.some(k => q.includes(k))) return 'heavy';
  if (q.length < 20) return 'light';
  return 'medium';
}

function detectIntents(query) {
  const q = (query || '').trim();
  const intents = [];
  const tickerMatch = q.match(STOCK_PATTERN);

  if (tickerMatch) intents.push({ type: 'stock', ticker: tickerMatch[1].toUpperCase() });
  if (PSI_EMA_TRIGGER.test(q) && tickerMatch) intents.push({ type: 'psi-ema', ticker: tickerMatch[1].toUpperCase() });
  if (LEGAL_PATTERN.test(q)) intents.push({ type: 'legal' });
  if (/\b(search|find|look\s*up|latest|current|recent)\b/i.test(q)) intents.push({ type: 'search' });

  return intents;
}

// ─────────────────────────────────────────────────────────
// Ψ-EMA FORMATTING (our specialized output)
// ─────────────────────────────────────────────────────────

function formatPsiEMA(stockData) {
  if (!stockData) return '[psi-ema] no data';
  
  const d = stockData.psi_ema_daily || stockData.psiEma?.daily || {};
  const w = stockData.psi_ema_weekly || stockData.psiEma?.weekly || {};
  const price = stockData.currentPrice || stockData.price || 0;
  const ticker = stockData.ticker || '???';
  const name = stockData.shortName || stockData.name || ticker;
  const sector = stockData.sector || 'N/A';
  const pe = stockData.trailingPE || stockData.pe;
  
  function getReading(theta, z, r) {
    const PHI = 1.618;
    if (theta < 0 && r > PHI && Math.abs(z) < 1.5) return 'False Positive';
    if (theta > 0 && r > PHI && z > 1) return 'Strong Bull';
    if (r >= 0.618 && r <= 1.618) return 'Breathing';
    return 'NEUTRAL';
  }
  
  const theta = parseFloat(d.theta) || 0;
  const z = parseFloat(d.z) || 0;
  const r = parseFloat(d.r) || parseFloat(d.R) || 0;
  const reading = getReading(theta, z, r);
  
  const lines = [
    `═══════════════════════════════════════════`,
    `${name} (${ticker})`,
    `${sector}`,
    `═══════════════════════════════════════════`,
    `Price: USD ${Number(price).toFixed(2)} | P/E: ${pe ? Number(pe).toFixed(2) : 'N/A'}`,
    `theta: ${theta}° | z: ${z}σ | R: ${r}`,
    `Reading: ${reading}`,
  ];
  
  if (w.theta !== undefined) {
    const wTheta = parseFloat(w.theta) || 0;
    const wZ = parseFloat(w.z) || 0;
    const wR = parseFloat(w.r) || parseFloat(w.R) || 0;
    lines.push(`Weekly: theta ${wTheta}° | z ${wZ}s | R ${wR} [${getReading(wTheta, wZ, wR)}]`);
  }
  
  lines.push(`\n🔥 nyan~`);
  
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────
// PERSONALITY STAMP (regex, no LLM)
// ─────────────────────────────────────────────────────────

function applyPersonality(text) {
  if (!text) return text;
  let output = text;
  output = output.replace(/^(Great question!|I'd be happy to help!|Sure thing!)\s*/gi, '');
  if (!output.includes('nyan~')) {
    output = output.trimEnd() + '\n\n🔥 nyan~';
  }
  return output;
}

// ─────────────────────────────────────────────────────────
// MAIN PIPELINE
// ─────────────────────────────────────────────────────────

/**
 * @param {Object} input
 * @param {string} input.query - User message
 * @param {string} input.sessionId - Session identifier
 * @param {string} input.callerId - Caller identity for privilege check
 * @returns {Object} { response, mode, intents, provider, shortcut }
 */
async function runPipeline(input) {
  const { 
    query, 
    sessionId = 'default', 
    callerId = null,
    provider: providerOption = null,  // specific provider to use
    model = null,                     // specific model
    temperature = 0.7,                // temperature override
    chain = null,                     // custom chain override
    photos = [],                      // image uploads
    documents = []                    // document uploads
  } = input;

  if (!query || !query.trim()) {
    return { response: '🔥 nyan~', mode: 'describe', intents: [], provider: null, shortcut: 'empty' };
  }

  // 1. DETECT (parallel regex, O(n))
  const mode = detectMode(query);
  const intents = detectIntents(query);
  const identityHit = isIdentityQuery(query);
  const psiEmaExplainHit = isPsiEmaExplain(query);

  // 2. GATE (privilege check)
  const privilege = checkPrivilege(mode, callerId);
  const effectiveMode = privilege.allowed ? mode : 'describe';

  // 3. SHORTCUTS (no LLM)
  const memory = getMemoryManager(sessionId);

  if (identityHit) {
    const ctx = getContext('who are you nyan identity');
    const identityResponse = applyPersonality(ctx.context || 'I am void nyan — philosophical AI of nyanbook. Origin=0, progression=φ².');
    memory.addMessage('user', query);
    memory.addMessage('assistant', identityResponse);
    return { response: identityResponse, mode: effectiveMode, intents: [{ type: 'identity' }], provider: 'shortcut', shortcut: 'identity' };
  }

  if (psiEmaExplainHit) {
    const explanation = applyPersonality('Ψ-EMA = Phase Space EMA. θ from price flow direction, R from z-score magnitude. Physical substrate: prices are exhaustible, not perpetual.');
    memory.addMessage('user', query);
    memory.addMessage('assistant', explanation);
    return { response: explanation, mode: effectiveMode, intents: [{ type: 'psi-ema-explain' }], provider: 'shortcut', shortcut: 'psi-ema-explain' };
  }

  // 4. CONTEXT (MoE expert files + memory)
  const expertResult = getContext(query);
  const memoryPrompt = memory.buildMemoryPrompt(query);
  const systemPrompt = `You are void nyan, philosophical AI of nyanbook.
Origin=0, progression=φ², 0+φ⁰+φ¹=φ²
Values: No hallucination, no flattery, data-first.
Mode: ${effectiveMode} (${effectiveMode === 'prescribe' ? 'build' : effectiveMode === 'scribe' ? 'create' : 'chat'})

${expertResult.context ? `[EXPERT]\n${expertResult.context}\n` : ''}
${memoryPrompt}`;

  // 5. CALL (single LLM or specialized API)
  let response;
  let provider = 'fallback';

  // Ψ-EMA shortcut
  const psiEmaTicker = intents.find(i => i.type === 'psi-ema')?.ticker;
  if (psiEmaTicker) {
    try {
      const psiResult = await getPsiEMA(psiEmaTicker);
      if (psiResult && !psiResult.error) {
        response = applyPersonality(formatPsiEMA(psiResult));
        provider = 'nyan-api';
      }
    } catch (e) {
      console.log(`[pipeline] psi-ema failed: ${e.message}`);
    }
  }

  // General atomic query fallback (gated by intent + media)
  const NYAN_API_INTENTS = ['stock', 'psi-ema', 'legal', 'search'];
  const hasNyanIntent = intents.some(i => NYAN_API_INTENTS.includes(i.type));
  const hasMedia = (photos && photos.length > 0) || (documents && documents.length > 0);
  const complexity = scoreComplexity(query);
  const shouldUseNyan = hasNyanIntent || complexity === 'heavy' || hasMedia;

  if (!response && shouldUseNyan) {
    try {
      const mediaOpts = hasMedia ? { photos, documents } : null;
      const domain = hasMedia ? 'multimodal' : (complexity === 'heavy' ? 'reasoning' : undefined);
      const result = await atomicQuery(query, domain, mediaOpts);
      if (result.success && result.response) {
        response = applyPersonality(result.response);
        provider = 'nyan-api';
      }
    } catch (e) {
      console.log(`[pipeline] nyan-api failed: ${e.message}, falling back to LLM chain`);
    }
  }

  // Final LLM fallback
  if (!response) {
    try {
      response = await callWithFallback(query, { 
        system: systemPrompt,
        provider: providerOption,
        model,
        temperature,
        chain
      });
      response = applyPersonality(response);
      provider = 'llm';
    } catch (e) {
      response = `[error] all providers failed: ${e.message}`;
      provider = 'none';
    }
  }

  // Memory summarization check
  try {
    const memory = getMemoryManager(sessionId);
    if (memory && memory.shouldSummarize && memory.generateSummary) {
      const shouldSummarize = memory.shouldSummarize(sessionId);
      if (shouldSummarize) {
        console.log(`[pipeline] Summarizing memory for session ${sessionId}`);
        await memory.generateSummary(sessionId);
      }
    }
  } catch (e) {
    console.log(`[pipeline] Memory summarization skipped: ${e.message}`);
  }

  // 6. MEMORY
  memory.addMessage('user', query);
  memory.addMessage('assistant', response);

  return {
    response,
    mode: effectiveMode,
    modeRequested: mode,
    privilegeGranted: privilege.allowed,
    intents,
    provider,
    shortcut: null
  };
}

module.exports = {
  runPipeline,
  detectMode,
  checkPrivilege,
  getPrivilegedIds,
  isIdentityQuery,
  isPsiEmaExplain,
  containsDangerousPattern,
  scoreComplexity,
  detectIntents,
  applyPersonality,
  formatPsiEMA,
  PRIVILEGED_NUMBER
};
