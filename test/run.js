#!/usr/bin/env node
/**
 * OpenClaw Test Runner — lightweight, zero-dependency
 * Uses Node assert. Run: node test/run.js
 */

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    \x1b[90m${e.message}\x1b[0m`);
  }
}

// ═══════════════════════════════════════════
// void-pipeline.js
// ═══════════════════════════════════════════
const {
  detectMode,
  checkPrivilege,
  isIdentityQuery,
  isPsiEmaExplain,
  detectIntents,
  applyPersonality,
  containsDangerousPattern,
  getPrivilegedIds,
  DANGEROUS_PATTERNS
} = require('../lib/void-pipeline');

console.log('\n\x1b[1m── void-pipeline ──\x1b[0m');

// detectMode
console.log('\n  detectMode:');
test('prescribe: "build the kernel"', () => assert.strictEqual(detectMode('build the kernel'), 'prescribe'));
test('prescribe: "debug this function"', () => assert.strictEqual(detectMode('debug this function'), 'prescribe'));
test('prescribe: "deploy to production"', () => assert.strictEqual(detectMode('deploy to production'), 'prescribe'));
test('scribe: "draft a memo"', () => assert.strictEqual(detectMode('draft a memo'), 'scribe'));
test('scribe: "write a contract"', () => assert.strictEqual(detectMode('write a contract'), 'scribe'));
test('scribe: "compose a letter"', () => assert.strictEqual(detectMode('compose a letter'), 'scribe'));
test('describe: "hello"', () => assert.strictEqual(detectMode('hello'), 'describe'));
test('describe: "what time is it"', () => assert.strictEqual(detectMode('what time is it'), 'describe'));
test('describe: empty string', () => assert.strictEqual(detectMode(''), 'describe'));
test('describe: null', () => assert.strictEqual(detectMode(null), 'describe'));

// checkPrivilege
console.log('\n  checkPrivilege:');

test('non-prescribe always allowed', () => {
  assert.strictEqual(checkPrivilege('describe', null).allowed, true);
  assert.strictEqual(checkPrivilege('scribe', null).allowed, true);
});

test('prescribe locked when no env var', () => {
  const orig = process.env.PRIVILEGED_CALLER_ID;
  delete process.env.PRIVILEGED_CALLER_ID;
  const result = checkPrivilege('prescribe', 'anyone');
  assert.strictEqual(result.allowed, false);
  assert.ok(result.reason.includes('locked'));
  if (orig !== undefined) process.env.PRIVILEGED_CALLER_ID = orig;
});

test('prescribe denied without callerId', () => {
  const orig = process.env.PRIVILEGED_CALLER_ID;
  process.env.PRIVILEGED_CALLER_ID = 'user1';
  const result = checkPrivilege('prescribe', null);
  assert.strictEqual(result.allowed, false);
  assert.ok(result.reason.includes('authentication'));
  if (orig !== undefined) process.env.PRIVILEGED_CALLER_ID = orig;
  else delete process.env.PRIVILEGED_CALLER_ID;
});

test('prescribe allowed for matching caller', () => {
  const orig = process.env.PRIVILEGED_CALLER_ID;
  process.env.PRIVILEGED_CALLER_ID = '+1234567890,admin@test.com';
  assert.strictEqual(checkPrivilege('prescribe', '+1234567890').allowed, true);
  assert.strictEqual(checkPrivilege('prescribe', 'admin@test.com').allowed, true);
  if (orig !== undefined) process.env.PRIVILEGED_CALLER_ID = orig;
  else delete process.env.PRIVILEGED_CALLER_ID;
});

test('prescribe denied for wrong caller', () => {
  const orig = process.env.PRIVILEGED_CALLER_ID;
  process.env.PRIVILEGED_CALLER_ID = 'admin@test.com';
  const result = checkPrivilege('prescribe', 'intruder@evil.com');
  assert.strictEqual(result.allowed, false);
  if (orig !== undefined) process.env.PRIVILEGED_CALLER_ID = orig;
  else delete process.env.PRIVILEGED_CALLER_ID;
});

// getPrivilegedIds
console.log('\n  getPrivilegedIds:');

test('empty when unset', () => {
  const orig = process.env.PRIVILEGED_CALLER_ID;
  delete process.env.PRIVILEGED_CALLER_ID;
  assert.deepStrictEqual(getPrivilegedIds(), []);
  if (orig !== undefined) process.env.PRIVILEGED_CALLER_ID = orig;
});

test('parses comma-separated', () => {
  const orig = process.env.PRIVILEGED_CALLER_ID;
  process.env.PRIVILEGED_CALLER_ID = ' user1 , user2 , user3 ';
  const ids = getPrivilegedIds();
  assert.strictEqual(ids.length, 3);
  assert.ok(ids.includes('user1'));
  assert.ok(ids.includes('user2'));
  assert.ok(ids.includes('user3'));
  if (orig !== undefined) process.env.PRIVILEGED_CALLER_ID = orig;
  else delete process.env.PRIVILEGED_CALLER_ID;
});

test('normalizes hyphens and spaces', () => {
  const orig = process.env.PRIVILEGED_CALLER_ID;
  process.env.PRIVILEGED_CALLER_ID = '+62-811-636-0610';
  const ids = getPrivilegedIds();
  assert.strictEqual(ids[0], '+628116360610');
  if (orig !== undefined) process.env.PRIVILEGED_CALLER_ID = orig;
  else delete process.env.PRIVILEGED_CALLER_ID;
});

// isIdentityQuery
console.log('\n  isIdentityQuery:');
test('"who are you" matches', () => assert.ok(isIdentityQuery('who are you')));
test('"Who is nyan" matches', () => assert.ok(isIdentityQuery('Who is nyan')));
test('"tell me about yourself" matches', () => assert.ok(isIdentityQuery('tell me about yourself')));
test('"who made this" matches', () => assert.ok(isIdentityQuery('who made this')));
test('"hello" does not match', () => assert.ok(!isIdentityQuery('hello')));
test('"what is 2+2" does not match', () => assert.ok(!isIdentityQuery('what is 2+2')));

// isPsiEmaExplain
console.log('\n  isPsiEmaExplain:');
test('"what is psi-ema" matches', () => assert.ok(isPsiEmaExplain('what is psi-ema')));
test('"explain the psi ema" matches', () => assert.ok(isPsiEmaExplain('explain the psi ema')));
test('"how does the psi-ema work" matches', () => assert.ok(isPsiEmaExplain('how does the psi-ema work')));
test('"use psi-ema on $AAPL" does not match', () => assert.ok(!isPsiEmaExplain('use psi-ema on $AAPL')));

// detectIntents
console.log('\n  detectIntents:');
test('$AAPL triggers stock intent', () => {
  const intents = detectIntents('check $AAPL price');
  assert.ok(intents.some(i => i.type === 'stock' && i.ticker === 'AAPL'));
});
test('psi-ema $TSLA triggers both stock and psi-ema', () => {
  const intents = detectIntents('run psi-ema on $TSLA');
  assert.ok(intents.some(i => i.type === 'stock'));
  assert.ok(intents.some(i => i.type === 'psi-ema'));
});
test('legal triggers legal intent', () => {
  const intents = detectIntents('review the contract clause');
  assert.ok(intents.some(i => i.type === 'legal'));
});
test('"search for latest news" triggers search', () => {
  const intents = detectIntents('search for latest news');
  assert.ok(intents.some(i => i.type === 'search'));
});
test('"hello" has no intents', () => {
  assert.strictEqual(detectIntents('hello').length, 0);
});

// containsDangerousPattern
console.log('\n  containsDangerousPattern (safety guard):');
test('rm -rf / blocked', () => assert.ok(containsDangerousPattern('rm -rf /')));
test('dd if=/dev/zero blocked', () => assert.ok(containsDangerousPattern('dd if=/dev/zero of=/dev/sda')));
test('fork bomb blocked', () => assert.ok(containsDangerousPattern(':() { : | : & } ; :')));
test('shutdown blocked', () => assert.ok(containsDangerousPattern('sudo shutdown now')));
test('chmod 777 / blocked', () => assert.ok(containsDangerousPattern('chmod 777 /')));
test('normal code not blocked', () => assert.ok(!containsDangerousPattern('function hello() { return 1; }')));
test('mkdir safe', () => assert.ok(!containsDangerousPattern('mkdir -p /app/data')));
test('rm single file safe', () => assert.ok(!containsDangerousPattern('rm file.txt')));

// applyPersonality
console.log('\n  applyPersonality:');
test('appends nyan~', () => assert.ok(applyPersonality('hello').includes('nyan~')));
test('does not double nyan~', () => {
  const result = applyPersonality('hello nyan~');
  assert.strictEqual(result.split('nyan~').length - 1, 1);
});
test('strips flattery', () => {
  const result = applyPersonality('Great question! Here is the answer');
  assert.ok(!result.startsWith('Great question'));
});

// ═══════════════════════════════════════════
// env-detect.js
// ═══════════════════════════════════════════
const {
  detectRuntime,
  checkAllProviders,
  buildDynamicChain,
  ENV_TYPES
} = require('../lib/env-detect');

console.log('\n\x1b[1m── env-detect ──\x1b[0m\n');

test('detectRuntime returns valid type', () => {
  const runtime = detectRuntime();
  assert.ok(Object.values(ENV_TYPES).includes(runtime));
});

test('checkAllProviders returns all four providers', () => {
  const providers = checkAllProviders();
  assert.ok('minimax' in providers);
  assert.ok('claude' in providers);
  assert.ok('groq' in providers);
  assert.ok('openai' in providers);
});

test('each provider has configured boolean', () => {
  const providers = checkAllProviders();
  for (const [name, p] of Object.entries(providers)) {
    assert.strictEqual(typeof p.configured, 'boolean', `${name}.configured should be boolean`);
  }
});

test('buildDynamicChain with no providers returns empty', () => {
  const noOllama = { available: false };
  const noCloud = {
    minimax: { configured: false },
    groq: { configured: false },
    claude: { configured: false },
    openai: { configured: false }
  };
  assert.deepStrictEqual(buildDynamicChain(noOllama, noCloud), []);
});

test('buildDynamicChain respects priority order', () => {
  const ollama = { available: true };
  const allCloud = {
    minimax: { configured: true },
    groq: { configured: true },
    claude: { configured: true },
    openai: { configured: true }
  };
  const chain = buildDynamicChain(ollama, allCloud);
  assert.strictEqual(chain[0], 'minimax');
  assert.strictEqual(chain[chain.length - 1], 'ollama');
  assert.ok(chain.indexOf('groq') < chain.indexOf('claude'));
  assert.ok(chain.indexOf('claude') < chain.indexOf('openai'));
  assert.ok(chain.indexOf('openai') < chain.indexOf('ollama'));
});

test('buildDynamicChain ollama-only when no cloud', () => {
  const ollama = { available: true };
  const noCloud = {
    minimax: { configured: false },
    groq: { configured: false },
    claude: { configured: false },
    openai: { configured: false }
  };
  const chain = buildDynamicChain(ollama, noCloud);
  assert.deepStrictEqual(chain, ['ollama']);
});

// ═══════════════════════════════════════════
// context-router.js
// ═══════════════════════════════════════════
const { route, getContext, WORKSPACE } = require('../lib/context-router');

console.log('\n\x1b[1m── context-router ──\x1b[0m\n');

test('route always includes core', () => {
  assert.ok(route('hello').includes('core'));
});

test('route triggers philosophy on "phi"', () => {
  assert.ok(route('tell me about phi').includes('philosophy'));
});

test('route triggers tools on "stock"', () => {
  assert.ok(route('check stock price').includes('tools'));
});

test('getContext returns valid structure', () => {
  const ctx = getContext('hello');
  assert.ok('experts' in ctx);
  assert.ok('context' in ctx);
  assert.ok('tokenEstimate' in ctx);
  assert.ok(Array.isArray(ctx.experts));
});

test('getContext handles null query', () => {
  const ctx = getContext(null);
  assert.deepStrictEqual(ctx.experts, ['core']);
  assert.strictEqual(ctx.context, '');
});

test('WORKSPACE is absolute path', () => {
  assert.ok(path.isAbsolute(WORKSPACE));
});

// ═══════════════════════════════════════════
// complexity scoring
// ═══════════════════════════════════════════
const { scoreComplexity } = require('../lib/void-pipeline');

console.log('\n\x1b[1m── complexity scoring ──\x1b[0m\n');

test('greetings are light complexity', () => {
  assert.strictEqual(scoreComplexity('hi'), 'light');
  assert.strictEqual(scoreComplexity('hello'), 'light');
  assert.strictEqual(scoreComplexity('thanks'), 'light');
});

test('short queries are light complexity', () => {
  assert.strictEqual(scoreComplexity('what is 2+2?'), 'light');
});

test('analysis keywords trigger heavy complexity', () => {
  assert.strictEqual(scoreComplexity('analyze the quarterly earnings report and compare year-over-year growth metrics for this company'), 'heavy');
});

test('philosophical queries trigger heavy complexity', () => {
  assert.strictEqual(scoreComplexity('explain the dialectic relationship between thesis and antithesis in modern epistemology'), 'heavy');
});

test('medium queries score correctly', () => {
  const r = scoreComplexity('Can you also tell me about the weather and what activities might be good?');
  assert.ok(r === 'medium' || r === 'heavy', `expected medium or heavy, got ${r}`);
});

test('empty query is light', () => {
  assert.strictEqual(scoreComplexity(''), 'light');
  assert.strictEqual(scoreComplexity(null), 'light');
});

// ═══════════════════════════════════════════
// multimodal passthrough
// ═══════════════════════════════════════════
const { callNyanAPI, atomicQuery: atomicQ } = require('../lib/nyan-api');
const axios = require('axios');

console.log('\n\x1b[1m── multimodal passthrough ──\x1b[0m\n');

test('callNyanAPI builds multimodal payload with photos', async () => {
  const fakePhoto = 'iVBORw0KGgoAAAANSUhEUg==';
  const origPost = axios.post;
  let capturedPayload = null;
  axios.post = async (url, payload) => {
    capturedPayload = payload;
    return { data: { success: true, response: 'saw photos' } };
  };
  try {
    await callNyanAPI('what is in these photos?', { photos: [fakePhoto] });
    assert.ok(Array.isArray(capturedPayload.photos), 'payload should have photos array');
    assert.strictEqual(capturedPayload.photos[0], fakePhoto);
  } finally {
    axios.post = origPost;
  }
});

test('callNyanAPI builds multimodal payload with documents', async () => {
  const origPost = axios.post;
  let capturedPayload = null;
  axios.post = async (url, payload) => {
    capturedPayload = payload;
    return { data: { success: true, response: 'saw docs' } };
  };
  try {
    const doc = { name: 'test.pdf', data: 'base64', type: 'pdf' };
    await callNyanAPI('summarize this', { documents: [doc] });
    assert.ok(Array.isArray(capturedPayload.documents), 'payload should have documents array');
    assert.strictEqual(capturedPayload.documents[0].name, 'test.pdf');
  } finally {
    axios.post = origPost;
  }
});

test('atomicQuery passes multimodal opts through', async () => {
  const origPost = axios.post;
  let capturedPayload = null;
  axios.post = async (url, payload) => {
    capturedPayload = payload;
    return { data: { success: true, response: 'multimodal atomic' } };
  };
  try {
    await atomicQ('process this', 'multimodal', { photos: ['data'], documents: [{ name: 'a.txt' }] });
    assert.ok(capturedPayload.photos);
    assert.ok(capturedPayload.documents);
  } finally {
    axios.post = origPost;
  }
});

// ═══════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════
console.log(`\n\x1b[1m── results ──\x1b[0m`);
console.log(`  \x1b[32m${passed} passed\x1b[0m  \x1b[${failed ? '31' : '90'}m${failed} failed\x1b[0m\n`);

if (failures.length > 0) {
  console.log('\x1b[31mFailures:\x1b[0m');
  failures.forEach(f => console.log(`  - ${f.name}: ${f.error}`));
  console.log('');
}

process.exit(failed > 0 ? 1 : 0);
