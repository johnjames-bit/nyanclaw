/**
 * OpenClaw Workspace - Module Exports
 * 
 * This workspace provides modules for the OpenClaw gateway.
 * No standalone server needed - gateway loads these as library.
 */

module.exports = {
  // Core pipeline
  runPipeline: require('./lib/void-pipeline'),
  
  // LLM client
  llmClient: require('./lib/llm-client'),
  
  // Memory
  memoryManager: require('./lib/memory-manager'),
  
  // Intent detection
  intentDetector: require('./lib/intent-detector'),
  
  // Security
  ssrfGuard: require('./lib/ssrf-guard'),
  execWatchtower: require('./lib/exec-watchtower'),
  
  // Utilities
  piiStrip: require('./lib/pii-strip'),
  nyanApi: require('./lib/nyan-api'),
  envDetect: require('./lib/env-detect'),
  webSearch: require('./lib/web-search'),
};
