// startup-tui.js - Terminal UI for void nyan startup

const envDetect = require('./env-detect');

function clear() {
  process.stdout.write('\x1b[2J\x1b[3J');
}

function header() {
  console.log('\x1b[36m╔════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║\x1b[0m     \x1b[1;35mVOID NYAN\x1b[0m — φ² Genesis           \x1b[36m║\x1b[0m');
  console.log('\x1b[36m╚════════════════════════════════════════╝\x1b[0m');
  console.log();
}

function status(label, ok, detail = '') {
  const icon = ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  const text = ok ? '\x1b[32m' : '\x1b[31m';
  console.log(`  ${icon} ${text}${label}\x1b[0m${detail ? ' — ' + detail : ''}`);
}

function run() {
  clear();
  header();
  
  const env = envDetect.detect();
  
  status('Nyan API Token', env.hasNyanToken, env.hasNyanToken ? 'configured' : 'missing .env');
  status('OpenClaw', env.hasOpenClaw, env.hasOpenClaw ? 'installed' : 'not found');
  status('Node', true, env.nodeVersion);
  status('Platform', true, env.platform);
  
  console.log();
  console.log('\x1b[90m  Ready for φ² progression...\x1b[0m');
  console.log();
}

module.exports = { run, header, status, clear };

if (require.main === module) {
  run();
}
