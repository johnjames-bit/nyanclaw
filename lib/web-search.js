/**
 * Web Search - Using OpenClaw's web_search
 * Wraps the existing tool for pipeline integration
 */

const { web_search: webSearchTool } = require('./tool-adapters.js');

/**
 * Search the web using configured provider (Brave)
 */
async function webSearch(query, options = {}) {
  const { count = 5 } = options;
  
  try {
    // Use OpenClaw's web_search tool
    const results = await webSearchTool({ query, count });
    
    if (!results || results.length === 0) {
      return { error: 'No results found', query };
    }
    
    return {
      query,
      results: results.slice(0, count).map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet
      })),
      count: results.length
    };
  } catch (e) {
    console.error('Web search error:', e.message);
    return { error: e.message, query };
  }
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
