/**
 * Web Search - Standalone wrapper
 * Uses exec to call web search (OpenClaw tool available at runtime)
 */

const { exec } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

/**
 * Search the web - delegates to OpenClaw's web_search
 * Note: In actual OpenClaw runtime, use the web_search tool directly
 * This is a standalone fallback for development/testing
 */
async function webSearch(query, options = {}) {
  const { count = 5 } = options;
  
  // This will only work in OpenClaw runtime with web_search tool
  // For now, return a stub indicating tool needed
  return { 
    error: 'Use OpenClaw web_search tool directly in pipeline',
    query,
    count 
  };
}

/**
 * Format web search results for display
 */
function formatSearchResults(searchResult) {
  if (searchResult.error) {
    return `Search error: ${searchResult.error}`;
  }
  
  const lines = [
    `**Search: ${searchResult.query}**`,
    ''
  ];
  
  searchResult.results.forEach((r, i) => {
    lines.push(`${i + 1}. [${r.title}](${r.url})`);
    lines.push(`   ${r.snippet?.slice(0, 150)}...`);
    lines.push('');
  });
  
  return lines.join('\n');
}

module.exports = {
  webSearch,
  formatSearchResults
};
