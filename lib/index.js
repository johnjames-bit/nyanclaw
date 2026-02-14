// void nyan entry point
// Unified interface for all void-pipeline operations

const intentDetector = require('./intent-detector');
const nyanApi = require('./nyan-api');
const memoryManager = require('./memory-manager');
const webSearch = require('./web-search');
const voidPipeline = require('./void-pipeline');
const modeRegistry = require('./mode-registry');

module.exports = {
  // Core routing (unified intent detector)
  getContext: intentDetector.getContext,
  detectIntents: intentDetector.detectIntents,
  isForexQuery: intentDetector.isForexQuery,
  isDesignQuestion: intentDetector.isDesignQuestion,
  
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
