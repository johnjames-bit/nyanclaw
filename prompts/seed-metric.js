const PHI = 1.618;
const LAND_QUANTA = 700;

/**
 * Solve A = 1 + 1/A + sigma
 * Rearranges to: A^2 - A(1 + sigma) - 1 = 0
 * @param {number} sigma - Substrate stress parameter
 * @returns {number} Positive real solution
 */
function solveIdentity(sigma = 0) {
  const a = 1;
  const b = -(1 + sigma);
  const c = -1;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return PHI;
  }

  const A_pos = (-b + Math.sqrt(discriminant)) / (2 * a);
  const A_neg = (-b - Math.sqrt(discriminant)) / (2 * a);

  return A_pos > 0 ? A_pos : A_neg;
}

/**
 * Measure affordability for a city
 * @param {Object} params
 * @param {string} params.city - City name
 * @param {number} params.year - Year to analyze
 * @param {number} params.landPricePerSqm - Price per m^2 (USD)
 * @param {number} params.medianIncome - Median HH income (USD/year)
 * @returns {Object} Affordability analysis
 */
function measureAffordability({ city, year, landPricePerSqm, medianIncome }) {
  const totalPrice = landPricePerSqm * LAND_QUANTA;
  const yearsToMortgage = totalPrice / medianIncome;

  let regime, sigma;

  if (yearsToMortgage > 25) {
    regime = 'FATALISM';
    sigma = (yearsToMortgage - 25) / 25;
  } else if (yearsToMortgage < 10) {
    regime = 'OPTIMISM';
    sigma = -(10 - yearsToMortgage) / 10;
  } else {
    regime = 'PHI-BREATHING';
    sigma = 0;
  }

  const A = solveIdentity(sigma);

  return {
    city,
    year,
    landPricePerSqm,
    medianIncome,
    totalPrice,
    yearsToMortgage: parseFloat(yearsToMortgage.toFixed(1)),
    regime,
    sigma: parseFloat(sigma.toFixed(4)),
    identityValue: parseFloat(A.toFixed(4)),
    phiDeviation: parseFloat(Math.abs(A - PHI).toFixed(4)),
    metadata: {
      landQuanta: LAND_QUANTA,
      threshold: { fatalism: 25, breathing: 10 },
      fertilityWindow: 25
    }
  };
}

/**
 * Compare two measurements (same city across time, or two cities)
 * @param {Object} m1 - First measurement
 * @param {Object} m2 - Second measurement
 * @returns {Object} Comparison result
 */
function compareTimePeriods(m1, m2) {
  const deltaYears = m2.yearsToMortgage - m1.yearsToMortgage;
  const regimeChange = m1.regime !== m2.regime;

  return {
    city: m1.city === m2.city ? m1.city : `${m1.city} vs ${m2.city}`,
    period: `${m1.year} -> ${m2.year}`,
    deltaYears: parseFloat(deltaYears.toFixed(1)),
    regimeChange: regimeChange ? `${m1.regime} -> ${m2.regime}` : 'stable',
    direction: deltaYears > 0 ? 'WORSENING' : 'IMPROVING',
    measurements: [m1, m2]
  };
}

/**
 * Detect seed metric intent in query text
 * @param {string} text - User query
 * @returns {boolean}
 */
function detectSeedMetricIntent(text) {
  if (!text) return false;

  const patterns = [
    /\b(700\s*m[²2]|700\s*square\s*meters?)\b/i,
    /\b(affordability|affordable|price[\s-]to[\s-]income|housing\s*crisis)\b/i,
    /\b(fatalism|optimism|phi[\s\-]?breathing)\b/i,
    /\b(land\s*quanta|substrate\s*metric)\b/i,
    /\b(fertility\s*window|25\s*years?)\b/i,
    /\b(seed[\s\-]?metric|human\s*substrate)\b/i,
    /\b(demographic\s*collapse|population\s*decline|tfr|fertility\s*rate)\b/i,
  ];

  return patterns.some(p => p.test(text));
}

/**
 * Get seed metric context for LLM prompt injection
 * @returns {string} Seed metric documentation for MoE context
 */
function getSeedMetricProxy() {
  return [
    '# SEED METRIC: Human Substrate Measurement',
    '',
    'Formula: Years of median single-earner income to mortgage 700 m^2/HH',
    '',
    'Thresholds (years to mortgage 700 m^2):',
    '  FATALISM:      >25 years',
    '  PHI-BREATHING: 10-25 years (golden zone)',
    '  OPTIMISM:      <10 years',
    '',
    'Physical constraints:',
    '  700 m^2/HH: Minimum land quanta (3-gen household)',
    '  25 years:   Human fertility window (age 20-45)',
    '  10 years:   Single-decade acquisition window',
    '',
    'Identity equation: A = 1 + 1/A + sigma',
    '  sigma = 0     -> A = PHI (1.618) -> equilibrium',
    '  sigma > 0     -> FATALISM (substrate stress)',
    '  sigma < 0     -> OPTIMISM (substrate abundance)',
    '',
    'Examples:',
    '  Tokyo  1975: $50/m^2,  $30k income ->  1.2 yrs -> OPTIMISM',
    '  Tokyo  2024: $800/m^2, $60k income ->  9.3 yrs -> OPTIMISM',
    '  Seoul  2024: $1000/m^2,$50k income -> 14.0 yrs -> PHI-BREATHING',
    '',
    'When user asks about housing, fertility, demographic collapse,',
    'or land affordability, use this metric.',
  ].join('\n');
}

/**
 * Format seed metric result for display
 * @param {Object} result - measureAffordability output
 * @returns {string} Formatted display
 */
function formatSeedMetric(result) {
  if (!result) return '[seed-metric] no data';

  const lines = [
    `--- ${result.city} (${result.year}) ---`,
    '',
    `Land:   USD ${result.landPricePerSqm}/m^2 x ${LAND_QUANTA}m^2 = USD ${result.totalPrice.toLocaleString()}`,
    `Income: USD ${result.medianIncome.toLocaleString()}/yr`,
    `Years:  ${result.yearsToMortgage} years to mortgage`,
    '',
    `Regime:   ${result.regime}`,
    `Sigma:    ${result.sigma}`,
    `Identity: A = ${result.identityValue} (PHI dev: ${result.phiDeviation})`,
  ];

  return lines.join('\n');
}

/**
 * Parse raw numbers from Nyan API response text
 * Expects format like: LAND:13400 INCOME:34944
 * Also handles comma-separated numbers and inline text
 * @param {string} text - Raw response text
 * @returns {Object|null} {landPricePerSqm, medianIncome} or null
 */
function parseNyanSeedMetricResponse(text) {
  if (!text) return null;

  let land = null, income = null;

  const landMatch = text.match(/LAND[:\s]*([0-9][0-9,]*)/i);
  if (landMatch) land = parseFloat(landMatch[1].replace(/,/g, ''));

  const incomeMatch = text.match(/INCOME[:\s]*([0-9][0-9,]*)/i);
  if (incomeMatch) income = parseFloat(incomeMatch[1].replace(/,/g, ''));

  if (land && income && land > 0 && income > 0) {
    return { landPricePerSqm: land, medianIncome: income };
  }

  const pricePatterns = [
    /(?:land\s*price|price\s*per\s*(?:sq(?:uare)?\s*m(?:eter)?|sqm))[:\s]*\$?([\d,]+)/i,
    /\$([\d,]+)\s*(?:\/|\s*per\s*)(?:sq(?:uare)?\s*m|sqm|m[²2])/i,
  ];
  const incomePatterns = [
    /(?:median|average)\s*(?:single[- ]earner\s*)?(?:annual\s*)?income[:\s]*\$?([\d,]+)/i,
    /income[:\s]*(?:USD\s*)?\$?([\d,]+)/i,
  ];

  for (const p of pricePatterns) {
    const m = text.match(p);
    if (m) { land = parseFloat(m[1].replace(/,/g, '')); break; }
  }
  for (const p of incomePatterns) {
    const m = text.match(p);
    if (m) { income = parseFloat(m[1].replace(/,/g, '')); break; }
  }

  if (land && income && land > 0 && income > 0) {
    return { landPricePerSqm: land, medianIncome: income };
  }

  return null;
}

/**
 * Parse search result snippets for land price and income data
 * @param {Array} results - Search result objects with snippet field
 * @returns {Object|null} {landPricePerSqm, medianIncome} or null
 */
function parseSearchSnippets(results) {
  if (!results || !results.length) return null;

  const combined = results.map(r => r.snippet || '').join(' ');

  const pricePatterns = [
    /\$([\d,]+)\s*(?:\/|\s*per\s*)(?:sq(?:uare)?\s*m|sqm|m[²2])/i,
    /([\d,]+)\s*(?:USD|usd)\s*(?:\/|\s*per\s*)(?:sq(?:uare)?\s*m|sqm|m[²2])/i,
    /(?:land\s*price|price\s*per\s*sqm)[:\s]*\$?([\d,]+)/i,
  ];
  const incomePatterns = [
    /(?:median|average)\s*(?:household\s*)?income[:\s]*\$?([\d,]+)/i,
    /\$([\d,]+)\s*(?:per\s*year|annually|\/yr)/i,
  ];

  let land = null, income = null;
  for (const p of pricePatterns) {
    const m = combined.match(p);
    if (m) { land = parseFloat(m[1].replace(/,/g, '')); break; }
  }
  for (const p of incomePatterns) {
    const m = combined.match(p);
    if (m) { income = parseFloat(m[1].replace(/,/g, '')); break; }
  }

  if (land && income && land > 0 && income > 0) {
    return { landPricePerSqm: land, medianIncome: income };
  }
  return null;
}

/**
 * Fetch seed metric raw data via cascade:
 *   1. Nyan API atomic (asks Groq + built-in Brave/DDG for raw numbers)
 *   2. Local web search (Brave API or DDG) → parse snippets
 *   3. LLM fallback (Ollama or cloud chain) → extract numbers from reasoning
 *
 * Never does math — always returns raw {landPricePerSqm, medianIncome}
 * for local measureAffordability() to calculate.
 *
 * @param {string} city - City name
 * @param {number} [year] - Year (default: current)
 * @returns {Promise<Object>} {landPricePerSqm, medianIncome, source}
 */
async function fetchSeedMetricData(city, year) {
  const yr = year || new Date().getFullYear();

  // --- TIER 1: Nyan API atomic (has Brave/DDG built in) ---
  try {
    const { atomicQuery } = require('../lib/nyan-api');
    const prompt = `${city} ${yr} residential land price per sqm USD and median single-earner annual income USD. Reply ONLY as: LAND:number INCOME:number`;
    const result = await atomicQuery(prompt, 'seed-metric');

    if (result.success && result.response) {
      const parsed = parseNyanSeedMetricResponse(result.response);
      if (parsed) {
        console.log(`[seed-metric] Nyan API hit: ${city} ${yr} — land=${parsed.landPricePerSqm} income=${parsed.medianIncome}`);
        return { ...parsed, source: 'nyan-api', confidence: result.confidence || 60 };
      }
    }
    console.log('[seed-metric] Nyan API returned data but could not parse numbers');
  } catch (e) {
    console.log(`[seed-metric] Nyan API failed: ${e.message}`);
  }

  // --- TIER 2: Local web search (Brave API / DDG) → parse snippets ---
  try {
    const { webSearch } = require('../lib/web-search');
    const searchResult = await webSearch(`${city} ${yr} residential land price per square meter USD median household income`, { count: 5 });

    if (searchResult.results && searchResult.results.length > 0) {
      const parsed = parseSearchSnippets(searchResult.results);
      if (parsed) {
        console.log(`[seed-metric] web search hit: ${city} ${yr} — land=${parsed.landPricePerSqm} income=${parsed.medianIncome}`);
        return { ...parsed, source: 'web-search', confidence: 40 };
      }

      // Snippets had data but couldn't parse — try feeding them to Nyan for extraction
      try {
        const { atomicQuery } = require('../lib/nyan-api');
        const snippetText = searchResult.results.map(r => r.snippet).join('\n');
        const extractResult = await atomicQuery(
          `From this data, extract ${city} residential land price per sqm in USD and median annual income in USD. Reply ONLY as: LAND:number INCOME:number\n\n${snippetText.substring(0, 1500)}`,
          'seed-metric'
        );
        if (extractResult.success && extractResult.response) {
          const parsed2 = parseNyanSeedMetricResponse(extractResult.response);
          if (parsed2) {
            console.log(`[seed-metric] web+nyan extraction hit: ${city} ${yr}`);
            return { ...parsed2, source: 'web-search+nyan-extract', confidence: 50 };
          }
        }
      } catch (e2) {
        console.log(`[seed-metric] nyan extraction from snippets failed: ${e2.message}`);
      }
    }
  } catch (e) {
    console.log(`[seed-metric] web search failed: ${e.message}`);
  }

  // --- TIER 3: LLM fallback (Ollama or cloud chain) ---
  try {
    const { callWithFallback } = require('../lib/llm-client');
    const llmResponse = await callWithFallback(
      `What is the average residential land price per square meter in ${city} in ${yr} in USD, and the median single-earner annual income in ${city} in ${yr} in USD? Reply ONLY as: LAND:number INCOME:number`,
      { maxTokens: 200, temperature: 0.2 }
    );
    if (llmResponse) {
      const parsed = parseNyanSeedMetricResponse(llmResponse);
      if (parsed) {
        console.log(`[seed-metric] LLM fallback hit: ${city} ${yr}`);
        return { ...parsed, source: 'llm-fallback', confidence: 30 };
      }
    }
  } catch (e) {
    console.log(`[seed-metric] LLM fallback failed: ${e.message}`);
  }

  return { error: `Could not fetch seed metric data for ${city} ${yr}`, source: 'none', confidence: 0 };
}

/**
 * Full auto seed metric: fetch data + calculate locally
 * @param {string} city - City name
 * @param {number} [year] - Year
 * @returns {Promise<Object>} measureAffordability result + source metadata
 */
async function autoSeedMetric(city, year) {
  const yr = year || new Date().getFullYear();
  const data = await fetchSeedMetricData(city, yr);

  if (data.error) {
    return { error: data.error, city, year: yr, source: data.source };
  }

  const result = measureAffordability({
    city,
    year: yr,
    landPricePerSqm: data.landPricePerSqm,
    medianIncome: data.medianIncome
  });

  return {
    ...result,
    source: data.source,
    confidence: data.confidence
  };
}

module.exports = {
  measureAffordability,
  solveIdentity,
  compareTimePeriods,
  detectSeedMetricIntent,
  getSeedMetricProxy,
  formatSeedMetric,
  fetchSeedMetricData,
  autoSeedMetric,
  parseNyanSeedMetricResponse,
  parseSearchSnippets,
  PHI,
  LAND_QUANTA
};
