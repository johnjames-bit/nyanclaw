/**
 * Nyan API Client - nyanbook.io Groq-powered API
 * 
 * Use for atomic operations:
 * - Ψ-EMA calculations
 * - Chemistry context
 * - Legal analysis
 * - Other specialized queries
 * 
 * NOTE: O(1) architecture - send ONE query at a time, not compounded
 */

const axios = require('axios');

const NYAN_API_ENDPOINT = 'https://nyanbook.io/api/v1/nyan';
const NYAN_API_TOKEN = process.env.NYAN_API_TOKEN;

/**
 * Call Nyan API with a single atomic query
 * @param {string} message - Single query (not compounded)
 * @param {object} options - Optional settings
 * @returns {Promise<object>} API response
 */
async function callNyanAPI(message, options = {}) {
  const { timeout = 30000, photos, documents } = options;
  
  // Build payload with media if present (defensive)
  const payload = { message };
  if (photos && photos.length > 0) payload.photos = photos;
  if (documents && documents.length > 0) payload.documents = documents;
  
  try {
    const response = await axios.post(
      NYAN_API_ENDPOINT,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${NYAN_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout
      }
    );
    
    return response.data;
  } catch (e) {
    console.error('[nyan-api] error:', e.message);
    return {
      success: false,
      error: e.message,
      response: null
    };
  }
}

/**
 * Call Ψ-EMA specifically (LLM-free, pure calculation)
 * @param {string} ticker - Stock ticker (e.g., 'AAPL') or array of tickers (up to 5)
 * @returns {Promise<object>} Ψ-EMA data
 */
async function getPsiEMA(ticker) {
  // Use new dedicated endpoint for LLM-free calculation
  const isArray = Array.isArray(ticker);
  
  try {
    const response = await axios.post(
      `${NYAN_API_ENDPOINT}/psi-ema`,
      isArray ? { tickers: ticker } : { ticker: ticker },
      {
        headers: {
          'Authorization': `Bearer ${NYAN_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    
    const result = response.data;
    
    // API returns results object with tickers as keys
    const results = result.results || {};
    const tickers = Object.keys(results);
    
    return {
      ticker: isArray ? tickers : ticker,
      tickers: tickers,
      results: results,
      psiEma: results,  // Alias for compatibility
      confidence: result.confidence,
      processingMs: result.processingMs,
      success: result.success
    };
  } catch (e) {
    // Fallback to atomic query if dedicated endpoint fails
    const fallback = await callNyanAPI(`$${ticker} psi-ema`);
    if (fallback.success) {
      return {
        ticker: fallback.ticker || ticker,
        mode: fallback.mode,
        psiEma: fallback.psiEma,
        confidence: fallback.confidence,
        processingMs: fallback.processingMs,
        response: fallback.response
      };
    }
    return { error: e.message, ticker, success: false };
  }
}

/**
 * Call for legal analysis
 * @param {string} text - Legal query or document text
 * @returns {Promise<object>} Legal analysis
 */
async function getLegalAnalysis(text) {
  return await callNyanAPI(text.substring(0, 2000)); // Truncate to avoid O(1) overflow
}

/**
 * Call for chemistry context
 * @param {string} text - Chemistry query
 * @returns {Promise<object>} Chemistry analysis
 */
async function getChemistryContext(text) {
  return await callNyanAPI(text.substring(0, 2000));
}

/**
 * Generic atomic query handler
 * @param {string} message - Single atomic query
 * @param {string} domain - Domain hint (psi-ema, legal, chemistry, multimodal, reasoning)
 * @param {object} mediaOpts - Optional media options { photos: [], documents: [] }
 * @returns {Promise<object>} API response
 */
async function atomicQuery(message, domain = null, mediaOpts = null) {
  // Add domain hint if provided
  let fullMessage = message;
  if (domain) fullMessage = `${message} [${domain}]`;
  
  // Pass media to API
  const options = { 
    ...(mediaOpts || {}),
    photos: (mediaOpts?.photos || []),
    documents: (mediaOpts?.documents || [])
  };
  
  return await callNyanAPI(fullMessage, options);
}

/**
 * Batch atomic queries (sequentially, not in parallel)
 * Nyan API is O(1) - don't compound!
 * @param {Array} queries - Array of {message, domain}
 * @returns {Promise<Array>} Array of results
 */
async function batchAtomic(queries) {
  const results = [];
  
  for (const q of queries) {
    const result = await atomicQuery(q.message, q.domain);
    results.push(result);
    
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }
  
  return results;
}

module.exports = {
  callNyanAPI,
  getPsiEMA,
  getLegalAnalysis,
  getChemistryContext,
  atomicQuery,
  batchAtomic
};
