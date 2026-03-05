const PartnerIntegration = require('../models/PartnerIntegration');
const Business = require('../models/Business');
const ErrorResponse = require('../utils/errorResponse');
const { hashApiKey } = require('../utils/partnerApi');
const { getPlanDefinition } = require('../utils/planConfig');
const {
  resolveBillingOwner,
  resolveEffectivePlan,
  isTrialActive
} = require('../utils/subscriptionService');

const requestWindows = new Map();

const extractApiKeyFromRequest = (req) => {
  const authorization = String(req.headers.authorization || '').trim();
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  const apiKeyHeader = String(req.headers['x-api-key'] || '').trim();
  if (apiKeyHeader) {
    return apiKeyHeader;
  }

  return '';
};

const cleanupRateLimitWindows = () => {
  if (requestWindows.size < 1000) return;
  const cutoff = Date.now() - (5 * 60 * 1000);
  for (const [key, value] of requestWindows.entries()) {
    if (!value || value.windowStart < cutoff) {
      requestWindows.delete(key);
    }
  }
};

exports.protectPartner = async (req, res, next) => {
  const apiKey = extractApiKeyFromRequest(req);
  if (!apiKey) {
    return next(new ErrorResponse('API key is required', 401));
  }

  const apiKeyHash = hashApiKey(apiKey);
  const partner = await PartnerIntegration.findOne({
    apiKeyHash,
    isActive: true
  }).select('+apiKeyHash');

  if (!partner) {
    return next(new ErrorResponse('Invalid API key', 401));
  }

  const business = await Business.findById(partner.business).select('_id isActive');
  if (!business || business.isActive === false) {
    return next(new ErrorResponse('Business is inactive', 403));
  }

  const billingOwner = await resolveBillingOwner({ business: partner.business });
  const planId = resolveEffectivePlan(billingOwner);
  const planDef = getPlanDefinition(planId);

  if (isTrialActive(billingOwner)) {
    return next(new ErrorResponse('API access is unavailable during trial period', 403));
  }

  if (!planDef.allowApi) {
    return next(new ErrorResponse('API access is not enabled for this plan', 403));
  }

  partner.apiKeyHash = undefined;
  req.partner = partner;
  req.partnerBusiness = business;
  req.partnerBillingOwner = billingOwner || null;

  PartnerIntegration.updateOne(
    { _id: partner._id },
    { $set: { lastUsedAt: new Date() } }
  ).catch(() => {});

  return next();
};

exports.authorizePartnerScopes = (...requiredScopes) => (req, res, next) => {
  const normalizedRequired = requiredScopes
    .map((scope) => String(scope || '').trim().toLowerCase())
    .filter(Boolean);

  if (!normalizedRequired.length) {
    return next();
  }

  const currentScopes = new Set(
    (Array.isArray(req.partner?.scopes) ? req.partner.scopes : [])
      .map((scope) => String(scope || '').trim().toLowerCase())
      .filter(Boolean)
  );

  const hasAccess = normalizedRequired.every((scope) => currentScopes.has(scope));
  if (!hasAccess) {
    return next(new ErrorResponse('API key is missing required scope', 403));
  }

  return next();
};

exports.partnerRateLimit = (req, res, next) => {
  const partnerId = req.partner?._id?.toString?.();
  if (!partnerId) {
    return next(new ErrorResponse('Partner context missing', 401));
  }

  cleanupRateLimitWindows();

  const maxPerMinute = Number(req.partner.rateLimitPerMinute || 120);
  const now = Date.now();
  const existing = requestWindows.get(partnerId);

  if (!existing || now - existing.windowStart >= 60 * 1000) {
    requestWindows.set(partnerId, {
      windowStart: now,
      count: 1
    });
    return next();
  }

  if (existing.count >= maxPerMinute) {
    return next(new ErrorResponse('Rate limit exceeded for this API key', 429));
  }

  existing.count += 1;
  requestWindows.set(partnerId, existing);
  return next();
};
