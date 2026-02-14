// void nyan entry point
// Unified interface for all void-pipeline operations

const contextRouter = require('./context-router');
const nyanApi = require('./nyan-api');
const memoryManager = require('./memory-manager');
const webSearch = require('./web-search');
const voidPipeline = require('./void-pipeline');
const modeRegistry = require('./mode-registry');

module.exports = {
  // Core routing
  getContext: contextRouter.getContext,
  
  // Nyan API
  atomicQuery: nyanApi.atomicQuery,
  getPsiEMA: nyanApi.getPsiEMA,
  
  // Memory
  memory: memoryManager,
  
  // Web
  webSearch,
  
  // Mode detection
  detectMode: voidPipeline.detectMode,
  detectCodeMode: modeRegistry.detectCodeMode,
};
