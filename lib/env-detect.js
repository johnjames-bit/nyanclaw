// env-detect.js - Environment detection for void nyan

const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '..', '.env');

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return {};
  
  const content = fs.readFileSync(ENV_PATH, 'utf-8');
  const env = {};
  
  content.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const [key, ...vals] = line.split('=');
    if (key) env[key] = vals.join('=').trim();
  });
  
  return env;
}

function detect() {
  const env = loadEnv();
  const workspace = path.join(__dirname, '..');
  const openclawPath = path.join(workspace, '..');
  
  return {
    hasNyanToken: !!env.NYAN_API_TOKEN,
    hasOpenClaw: fs.existsSync(path.join(openclawPath, 'node_modules', 'openclaw')),
    workspacePath: workspace,
    envPath: ENV_PATH,
    nodeVersion: process.version,
    platform: process.platform,
  };
}

module.exports = { loadEnv, detect };
