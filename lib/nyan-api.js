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
  const { timeout = 30000 } = options;
  
  try {
    const response = await axios.post(
      NYAN_API_ENDPOINT,
      { message },
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
    console.error('Nyan API error:', e.message);
    return {
      success: false,
      error: e.message,
      response: null
    };
  }
}

/**
 * Call Ψ-EMA specifically
 * @param {string} ticker - Stock ticker (e.g., 'AAPL')
 * @returns {Promise<object>} Ψ-EMA data
 */
async function getPsiEMA(ticker) {
  const result = await callNyanAPI(`$${ticker} psi-ema`);
  
  if (result.success) {
    return {
      ticker: result.ticker || ticker,
      mode: result.mode,
      psiEma: result.psiEma,
      confidence: result.confidence,
      processingMs: result.processingMs,
      response: result.response
    };
  }
  
  return { error: result.error, ticker };
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
  
  // Include media context if provided
  if (mediaOpts) {
    const { photos, documents } = mediaOpts;
    if (photos && photos.length > 0) fullMessage += ` [photos: ${photos.length}]`;
    if (documents && documents.length > 0) fullMessage += ` [documents: ${documents.length}]`;
  }
  
  return await callNyanAPI(fullMessage);
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
