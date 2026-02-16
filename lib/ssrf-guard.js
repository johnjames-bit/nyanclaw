const { URL } = require('url');
const net = require('net');
const dns = require('dns');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.gke.internal',
  'instance-data',
]);

const PRIVATE_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  { start: '127.0.0.0', end: '127.255.255.255' },
  { start: '169.254.0.0', end: '169.254.255.255' },
  { start: '100.64.0.0', end: '100.127.255.255' },
  { start: '0.0.0.0', end: '0.255.255.255' },
];

function ipToLong(ip) {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIP(ip) {
  if (!net.isIPv4(ip)) {
    if (ip === '::1' || ip === '::' || ip.startsWith('fe80:') || ip.startsWith('fc00:') || ip.startsWith('fd')) {
      return true;
    }
    return false;
  }

  const ipLong = ipToLong(ip);
  for (const range of PRIVATE_RANGES) {
    const startLong = ipToLong(range.start);
    const endLong = ipToLong(range.end);
    if (ipLong >= startLong && ipLong <= endLong) return true;
  }
  return false;
}

function isBlockedHostname(hostname) {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (lower.endsWith('.internal') || lower.endsWith('.local')) return true;
  return false;
}

function validateURL(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { allowed: false, reason: 'invalid URL' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { allowed: false, reason: `blocked protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname;

  if (isBlockedHostname(hostname)) {
    return { allowed: false, reason: `blocked hostname: ${hostname}` };
  }

  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) {
      return { allowed: false, reason: `blocked private/reserved IP: ${hostname}` };
    }
  }

  return { allowed: true, url: parsed };
}

async function validateURLWithDNS(urlString) {
  const check = validateURL(urlString);
  if (!check.allowed) return check;

  const hostname = check.url.hostname;

  if (net.isIP(hostname)) return check;

  try {
    const addresses = await new Promise((resolve, reject) => {
      dns.resolve4(hostname, (err, addrs) => {
        if (err) reject(err);
        else resolve(addrs);
      });
    });

    for (const addr of addresses) {
      if (isPrivateIP(addr)) {
        return { allowed: false, reason: `DNS resolved to private IP: ${addr}` };
      }
    }
  } catch {
  }

  return check;
}

module.exports = {
  validateURL,
  validateURLWithDNS,
  isPrivateIP,
  isBlockedHostname,
};
