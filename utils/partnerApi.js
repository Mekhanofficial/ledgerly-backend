const crypto = require('crypto');

const PARTNER_SCOPE_VALUES = [
  'templates:read',
  'invoices:create',
  'invoices:read',
  'invoices:pdf',
  'invoices:send'
];

const DEFAULT_PARTNER_SCOPES = [
  'templates:read',
  'invoices:create',
  'invoices:read'
];

const SCOPE_ALIASES = {
  'templates:all': ['templates:read'],
  'invoices:all': ['invoices:create', 'invoices:read', 'invoices:pdf', 'invoices:send']
};

const normalizeScopeValue = (value) => String(value || '').trim().toLowerCase();

const normalizePartnerScopes = (input, fallback = DEFAULT_PARTNER_SCOPES) => {
  const rawScopes = Array.isArray(input) ? input : [];
  const expanded = rawScopes.flatMap((scope) => {
    const normalized = normalizeScopeValue(scope);
    if (!normalized) return [];
    if (SCOPE_ALIASES[normalized]) return SCOPE_ALIASES[normalized];
    return [normalized];
  });

  const validScopes = Array.from(new Set(expanded.filter((scope) => PARTNER_SCOPE_VALUES.includes(scope))));
  if (validScopes.length) {
    return validScopes;
  }

  return [...fallback];
};

const normalizeRateLimitPerMinute = (value, fallback = 120) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, 5000);
};

const normalizeTemplateIdList = (input) => {
  if (!Array.isArray(input)) {
    return [];
  }
  return Array.from(
    new Set(
      input
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
};

const createPartnerApiKey = () => {
  const randomPart = crypto.randomBytes(32).toString('hex');
  return `ledg_live_${randomPart}`;
};

const hashApiKey = (value) => crypto
  .createHash('sha256')
  .update(String(value || '').trim())
  .digest('hex');

const getApiKeyPrefix = (apiKey) => String(apiKey || '').slice(0, 18);
const getApiKeyLast4 = (apiKey) => String(apiKey || '').slice(-4);

const sanitizePartner = (partnerDoc) => {
  const partner = partnerDoc?.toObject ? partnerDoc.toObject() : { ...(partnerDoc || {}) };
  delete partner.apiKeyHash;
  return partner;
};

module.exports = {
  PARTNER_SCOPE_VALUES,
  DEFAULT_PARTNER_SCOPES,
  normalizePartnerScopes,
  normalizeRateLimitPerMinute,
  normalizeTemplateIdList,
  createPartnerApiKey,
  hashApiKey,
  getApiKeyPrefix,
  getApiKeyLast4,
  sanitizePartner
};
