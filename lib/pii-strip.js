/**
 * Shared PII Stripping Utility
 * Used across pipeline and hooks
 */

const PII_PATTERNS = [
  { re: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, label: '[email]' },
  { re: /(?:\+\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,5}/g, label: '[phone]' }
];

function stripPII(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  for (const { re, label } of PII_PATTERNS) {
    result = result.replace(re, label);
  }
  return result;
}

module.exports = { stripPII, PII_PATTERNS };
