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
  if (!callerId) return { allowed: false, reason: 'prescribe requires auth' };
  const normalized = callerId.replace(/[\s\-]/g, '');
  if (normalized === PRIVILEGED_NUMBER) return { allowed: true };
  return { allowed: false, reason: 'prescribe restricted — describe only' };
}

function isIdentityQuery(query) {
  return IDENTITY_PATTERNS.some(p => p.test(query));
}

function isPsiEmaExplain(query) {
  return PSI_EMA_EXPLAIN.some(p => p.test(query.trim()));
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
  const d = stockData.psi_ema_daily;
  const w = stockData.psi_ema_weekly;
  const price = stockData.currentPrice;
  
  function getReading(theta, z, r) {
    const PHI = 1.618;
    if (theta < 0 && r > PHI && Math.abs(z) < 1.5) return '🟠 False Positive';
    if (theta > 0 && r > PHI && z > 1) return '🟢 Strong Bull';
    if (r >= 0.618 && r <= 1.618) return '🟢 Breathing';
    return '🟡 NEUTRAL';
  }
  
  return `═══════════════════════════════════════════
${stockData.shortName || stockData.ticker} (${stockData.ticker})
${stockData.sector || 'N/A'}
═══════════════════════════════════════════

Price: USD ${price.toFixed(2)} | P/E: ${stockData.trailingPE?.toFixed(2) || 'N/A'}
Θ: ${d.theta}° | z: ${d.z}σ | R: ${d.r}
${getReading(d.theta, d.z, d.r)}

🔥 nyan~`;
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
  const { query, sessionId = 'default', callerId = null } = input;

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

  // General atomic query fallback (gated by intent)
  const NYAN_API_INTENTS = ['stock', 'psi-ema', 'legal', 'search'];
  const hasNyanIntent = intents.some(i => NYAN_API_INTENTS.includes(i.type));

  if (!response && hasNyanIntent) {
    try {
      const result = await atomicQuery(query);
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
      response = await callWithFallback(query, { system: systemPrompt });
      response = applyPersonality(response);
      provider = 'llm';
    } catch (e) {
      response = `[error] all providers failed: ${e.message}`;
      provider = 'none';
    }
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
  isIdentityQuery,
  isPsiEmaExplain,
  detectIntents,
  applyPersonality,
  formatPsiEMA,
  PRIVILEGED_NUMBER
};
