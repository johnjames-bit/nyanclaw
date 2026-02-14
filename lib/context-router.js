/**
 * Context Router - MoE-inspired context selection
 * Routes queries to relevant expert modules
 * 
 * Usage:
 *   const { getContext } = require('./lib/context-router.js');
 *   const result = getContext("your query");
 *   // result = { experts: [...], context: "...", tokenEstimate: N }
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = '/Users/enoch/.openclaw/workspace';

// Expert file mappings
const EXPERTS = {
  core: ['USER.md', 'IDENTITY.md', 'SOUL.md'],
  philosophy: ['PHILOSOPHY.md', 'IDENTITY.md'],
  memory: ['MEMORY.md'],
  tools: ['TOOLS.md'],
  daily: [] // Filled dynamically
};

// Keywords for routing
const TRIGGERS = {
  philosophy: ['φ', 'phi', 'philosophy', 'nyan', 'fire', 'logos', 'genesis', 'peano', 'dimension', 'gougu', 'tetralemma', 'paticca', 'dependent', 'impermanence', 'suffering', 'awakening', 'dialectic', 'koan'],
  memory: ['remember', 'past', 'yesterday', 'earlier', 'before', 'context', 'what did we', 'history'],
  tools: ['price', 'weather', 'cpo', 'stock', 'psi-ema', 'model', 'ollama', 'openclaw', 'api', 'token'],
  daily: ['today', 'morning', 'afternoon', 'evening', 'now']
};

/**
 * Get today's memory file
 */
function getDailyFile() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const dailyPath = path.join(WORKSPACE, 'memory', `${today}.md`);
  if (fs.existsSync(dailyPath)) {
    return dailyPath;
  }
  return null;
}

/**
 * Read file content with fallback
 */
function readFile(filePath) {
  try {
    const fullPath = filePath.startsWith('/') ? filePath : path.join(WORKSPACE, filePath);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf8');
    }
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e.message);
  }
  return null;
}

/**
 * Route query to relevant experts
 */
function route(query) {
  const q = (query || '').toLowerCase();
  const experts = new Set(['core']); // Always include core
  
  // Check each trigger category
  for (const [expert, keywords] of Object.entries(TRIGGERS)) {
    if (keywords.some(k => q.includes(k))) {
      experts.add(expert);
    }
  }
  
  // Check for daily memory
  const dailyFile = getDailyFile();
  if (dailyFile) {
    EXPERTS.daily = [dailyFile.replace(WORKSPACE + '/', '')];
  }
  
  return Array.from(experts);
}

/**
 * Get context for query - with error handling
 */
function getContext(query) {
  if (!query) {
    return { experts: ['core'], context: '', tokenEstimate: 0 };
  }
  
  try {
    const experts = route(query);
    const context = [];
    
    for (const expert of experts) {
      const files = EXPERTS[expert] || [];
      for (const file of files) {
        const content = readFile(file);
        if (content) {
          context.push(`--- ${expert.toUpperCase()}: ${file} ---\n${content}`);
        }
      }
    }
    
    return {
      experts,
      context: context.join('\n\n'),
      tokenEstimate: Math.ceil(context.join('').split(' ').length * 1.3)
    };
  } catch (e) {
    // Fallback: return minimal core context on error
    console.error('Context router error:', e.message);
    return {
      experts: ['core'],
      context: '[Error loading extended context. Use core files: USER.md, IDENTITY.md, SOUL.md]',
      tokenEstimate: 0
    };
  }
}

// CLI mode for testing
if (require.main === module) {
  const query = process.argv.slice(2).join(' ');
  if (!query) {
    console.log('Usage: node context-router.js "your query here"');
    process.exit(1);
  }
  
  const result = getContext(query);
  console.log('=== ROUTING RESULT ===');
  console.log('Query:', query);
  console.log('Experts:', result.experts.join(', '));
  console.log('Est. tokens:', result.tokenEstimate);
  console.log('\n=== CONTEXT ===');
  console.log(result.context);
}

module.exports = { route, getContext, EXPERTS, TRIGGERS };
