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

const { callWithFallback, PROVIDERS, setDynamicChain, estimateTokens, getMinContextLimit, truncateToTokens, CONTEXT_LIMITS } = require('./llm-client');
const { getContext, isForexQuery, isDesignQuestion, detectForexPair, fetchForexRate, buildForexContext, getDesignContext } = require('./intent-detector');
const { getMemoryManager } = require('./memory-manager');
const { atomicQuery, getPsiEMA } = require('./nyan-api');
const envDetect = require('./env-detect');

// Lazy initialization - skip Ollama probe to avoid hangs
// Chain will use defaults from llm-client.js
let _chainInitialized = false;
async function ensureChain() {
  if (_chainInitialized) return;
  _chainInitialized = true;
  // Skip envDetect for now - causes hangs due to Ollama probe
  // Use default chain from llm-client.js instead
}

// No hardcoded fallback - secure by default (must be explicitly set)
const PRIVILEGED_NUMBER = process.env.PRIVILEGED_CALLER_ID || null;

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
  // Only true heavy: multi-step analysis, long documents, explicit data requests
  const heavyKeywords = ['analyze', 'compare', 'evaluate', 'synthesize', 'architect', 'design system', 'long document', 'summary of'];
  const lightGreetings = ['hello', 'hi', 'hey', 'what time', 'how are', 'thanks', 'thank you'];
  
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

  // Unified intent detector (forex + design)
  if (isForexQuery(q)) {
    const pair = detectForexPair(q);
    intents.push({ type: 'forex', pair });
  }
  if (isDesignQuestion(q)) {
    intents.push({ type: 'design' });
  }

  return intents;
}

// ─────────────────────────────────────────────────────────
// Ψ-EMA FORMATTING (our specialized output)
// ─────────────────────────────────────────────────────────

function formatPsiEMA(stockData) {
  if (!stockData) return '[psi-ema] no data';
  
  // Handle both flat format (psi_ema_daily) and nested (psiEma.daily)
  const psiEma = stockData.psiEma || {};
  const d = stockData.psi_ema_daily || psiEma.daily || {};
  const w = stockData.psi_ema_weekly || psiEma.weekly || {};
  const price = stockData.currentPrice || stockData.price || 0;
  const ticker = stockData.ticker || '???';
  const name = stockData.shortName || stockData.name || ticker;
  const sector = stockData.sector || 'N/A';
  const pe = stockData.trailingPE || stockData.pe;
  
  function getReading(theta, z, r) {
    const PHI = 1.618;
    if (!theta && theta !== 0) return 'N/A';
    if (theta < 0 && r > PHI && Math.abs(z) < 1.5) return '🟠 False Positive';
    if (theta > 0 && r > PHI && z > 1) return '🟢 Strong Bull';
    if (r >= 0.618 && r <= 1.618) return '🟢 Breathing';
    if (theta > 0 && r < 0.618) return '🔴 Reversal';
    return '🟡 NEUTRAL';
  }
  
  const theta = parseFloat(d.theta) || 0;
  const z = parseFloat(d.z) || 0;
  const r = parseFloat(d.r) || parseFloat(d.R) || 0;
  const dailyReading = getReading(theta, z, r);
  
  // Always show both daily AND weekly for context
  const wTheta = parseFloat(w?.theta) || 0;
  const wZ = parseFloat(w?.z) || 0;
  const wR = parseFloat(w?.r) || parseFloat(w?.R) || 0;
  const weeklyReading = getReading(wTheta, wZ, wR);
  
  const lines = [
    `═══════════════════════════════════════════`,
    `${name} (${ticker})`,
    `${sector}`,
    `═══════════════════════════════════════════`,
    `Price: USD ${Number(price).toFixed(2)} | P/E: ${pe ? Number(pe).toFixed(2) : 'N/A'}`,
    ``,
    `DAILY  — θ ${theta.toFixed(2)}° | z ${z.toFixed(2)}σ | R ${r.toFixed(2)}`,
    `         ${dailyReading}`,
    ``,
    `WEEKLY — θ ${wTheta.toFixed(2)}° | z ${wZ.toFixed(2)}σ | R ${wR.toFixed(2)}`,
    `         ${weeklyReading}`,
  ];
  
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
  // Lazy init chain on first call
  await ensureChain();
  
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
    return { response: '🔥 nyan~', mode: 'describe', intents: [], provider: null, source: 'shortcut', shortcut: 'empty', latencyMs: Date.now() - t0, tokensIn: 0, tokensOut: 0 };
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
    return { response: identityResponse, mode: effectiveMode, intents: [{ type: 'identity' }], provider: 'shortcut', source: 'shortcut', shortcut: 'identity', latencyMs: Date.now() - t0, tokensIn: estimateTokens(query), tokensOut: estimateTokens(identityResponse) };
  }

  if (psiEmaExplainHit) {
    const explanation = applyPersonality('Ψ-EMA = Phase Space EMA. θ from price flow direction, R from z-score magnitude. Physical substrate: prices are exhaustible, not perpetual.');
    memory.addMessage('user', query);
    memory.addMessage('assistant', explanation);
    return { response: explanation, mode: effectiveMode, intents: [{ type: 'psi-ema-explain' }], provider: 'shortcut', source: 'shortcut', shortcut: 'psi-ema-explain', latencyMs: Date.now() - t0, tokensIn: estimateTokens(query), tokensOut: estimateTokens(explanation) };
  }

  // 4. CONTEXT (MoE expert files + memory)
  const expertResult = getContext(query);
  const memoryPrompt = memory.buildMemoryPrompt(query);

  // 5. CALL (single LLM or specialized API)
  let response;
  let provider = 'fallback';
  let source = 'llm'; // Track response origin: 'atomic:psi-ema', 'atomic:forex', 'llm', 'shortcut', 'none'

  // Ψ-EMA shortcut
  const psiEmaTicker = intents.find(i => i.type === 'psi-ema')?.ticker;
  if (psiEmaTicker) {
    try {
      const psiResult = await getPsiEMA(psiEmaTicker);
      if (psiResult && !psiResult.error) {
        response = applyPersonality(formatPsiEMA(psiResult));
        provider = 'nyan-api';
        source = 'atomic:psi-ema';
      }
    } catch (e) {
      console.log(`[pipeline] psi-ema failed: ${e.message}`);
    }
  }

  // Forex shortcut
  const forexIntent = intents.find(i => i.type === 'forex');
  if (!response && forexIntent?.pair) {
    try {
      const fxResult = await fetchForexRate(forexIntent.pair);
      if (fxResult && fxResult.rate != null) {
        response = applyPersonality(`${forexIntent.pair}: ${fxResult.rate}\n[source: ${fxResult.source}]`);
        provider = 'nyan-api';
        source = 'atomic:forex';
      } else if (fxResult?.raw) {
        response = applyPersonality(fxResult.raw);
        provider = 'nyan-api';
        source = 'atomic:forex';
      }
    } catch (e) {
      console.log(`[pipeline] forex failed: ${e.message}`);
    }
  }

  // Design context injection (adds PHILOSOPHY.md + lib/README.md to context)
  const designIntent = intents.find(i => i.type === 'design');
  if (designIntent) {
    const designCtx = getDesignContext();
    if (designCtx) {
      // Prepend design context to expertResult.context
      const expert = getContext(query); // Re-run to get updated context
      // This is handled via getDesignContext() below
    }
  }

  // Inject forex/design context into expertResult for LLM call
  let expertContext = expertResult.context || '';
  if (forexIntent && !response) {
    const fxCtx = buildForexContext(query);
    if (fxCtx) expertContext += `\n\n[FOREX]\n${fxCtx.systemPrompt}`;
  }
  if (designIntent) {
    const designCtx = getDesignContext();
    if (designCtx) expertContext += `\n\n[DESIGN]\n${designCtx}`;
  }

  // Update system prompt with injected context
  const systemPrompt = `You are void nyan, philosophical AI of nyanbook.
Origin=0, progression=φ², 0+φ⁰+φ¹=φ²
Values: No hallucination, no flattery, data-first.
Mode: ${effectiveMode} (${effectiveMode === 'prescribe' ? 'build' : effectiveMode === 'scribe' ? 'create' : 'chat'})

${expertContext ? `[EXPERT]\n${expertContext}\n` : ''}
${memoryPrompt}`;

  // General atomic query fallback (gated by intent + media)
  const NYAN_API_INTENTS = ['stock', 'psi-ema', 'legal', 'search'];
  const hasNyanIntent = intents.some(i => NYAN_API_INTENTS.includes(i.type));
  const hasMedia = (photos && photos.length > 0) || (documents && documents.length > 0);
  const complexity = scoreComplexity(query);
  // Only use Nyan API for specific data intents, not general "heavy" queries
  // Heavy queries go to LLM (faster for reasoning than Nyan)
  const shouldUseNyan = hasNyanIntent || hasMedia;

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
    // Truncate context to prevent overflow
    const minLimit = getMinContextLimit();
    const totalTokens = estimateTokens(systemPrompt);
    const maxContext = Math.floor(minLimit * 0.8); // 80% for context, 20% reserved
    let truncatedPrompt = systemPrompt;
    if (totalTokens > maxContext) {
      truncatedPrompt = truncateToTokens(systemPrompt, maxContext);
      console.log(`[pipeline] Context truncated: ${totalTokens} -> ~${maxContext} tokens`);
    }
    
    try {
      response = await callWithFallback(query, { 
        system: truncatedPrompt,
        provider: providerOption,
        model,
        temperature,
        chain
      });
      response = applyPersonality(response);
      provider = 'llm';
    } catch (e) {
      response = `Hey! I\'m here — sorry, my brain (LLM) is taking a nap. Try again in a moment, or ask me something simple like "who are you" for an instant answer.\n\n🜁 nyan~`;
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

  // Metrics
  const tokensIn = estimateTokens(query) + estimateTokens(systemPrompt);
  const tokensOut = estimateTokens(response);
  const latencyMs = Date.now() - t0;

  // Set source for shortcuts
  if (provider === 'shortcut') source = 'shortcut';
  if (provider === 'none') source = 'none';

  return {
    response,
    mode: effectiveMode,
    modeRequested: mode,
    privilegeGranted: privilege.allowed,
    intents,
    provider,
    source,
    latencyMs,
    tokensIn,
    tokensOut,
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
