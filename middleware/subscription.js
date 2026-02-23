const ErrorResponse = require('../utils/errorResponse');
const AddOns = require('../models/AddOns');
const User = require('../models/User');
const { getPlanDefinition } = require('../utils/planConfig');
const {
  resolveBillingOwner,
  resolveEffectivePlan,
  isTrialActive,
  isSubscriptionActive,
  expireSubscriptionIfNeeded,
  syncBusinessFromUser,
  resetInvoiceCountIfNeeded,
  resolveInvoiceLimit
} = require('../utils/subscriptionService');

const ensureBillingOwner = async (req) => {
  if (req.billingOwner) return req.billingOwner;
  const owner = await resolveBillingOwner(req.user);
  req.billingOwner = owner;
  return owner;
};

const checkSubscription = (options = {}) => async (req, res, next) => {
  const billingOwner = await ensureBillingOwner(req);
  await expireSubscriptionIfNeeded(billingOwner);
  await syncBusinessFromUser(billingOwner);

  const allowTrial = options.allowTrial !== false;
  const isActive = isSubscriptionActive(billingOwner);
  const inTrial = isTrialActive(billingOwner);

  if (isActive || (allowTrial && inTrial)) {
    return next();
  }

  return next(new ErrorResponse('Subscription required. Please upgrade to continue.', 402));
};

const checkInvoiceLimit = async (req, res, next) => {
  const billingOwner = await ensureBillingOwner(req);
  await resetInvoiceCountIfNeeded(billingOwner);
  const limit = resolveInvoiceLimit(billingOwner);

  if (Number.isFinite(limit) && billingOwner.invoiceCountThisMonth >= limit) {
    return next(new ErrorResponse('Invoice limit reached for this billing period.', 402));
  }
  return next();
};

const checkFeatureAccess = (featureName) => async (req, res, next) => {
  const billingOwner = await ensureBillingOwner(req);
  await expireSubscriptionIfNeeded(billingOwner);
  await syncBusinessFromUser(billingOwner);

  const planId = resolveEffectivePlan(billingOwner);
  const planDef = getPlanDefinition(planId);
  const inTrial = isTrialActive(billingOwner);

  const trialBlocks = new Set(['api', 'whiteLabel', 'team']);

  if (inTrial && trialBlocks.has(featureName)) {
    return next(new ErrorResponse('This feature is unavailable during the trial period.', 403));
  }

  const addOns = featureName === 'whiteLabel' ? await AddOns.findOne({ business: billingOwner.business }).lean() : null;
  const featureFlags = {
    multiCurrency: planDef.allowMultiCurrency,
    inventory: planDef.allowInventory,
    api: planDef.allowApi,
    whiteLabel: planDef.allowWhiteLabel || Boolean(addOns?.whiteLabelEnabled),
    advancedReporting: planDef.allowAdvancedReporting,
    recurring: planDef.allowRecurring
  };

  if (featureName in featureFlags) {
    if (!featureFlags[featureName]) {
      return next(new ErrorResponse('Upgrade required to access this feature.', 403));
    }
    return next();
  }

  return next();
};

const checkTeamLimit = async (req, res, next) => {
  const billingOwner = await ensureBillingOwner(req);
  await expireSubscriptionIfNeeded(billingOwner);
  await syncBusinessFromUser(billingOwner);

  const planId = resolveEffectivePlan(billingOwner);
  const planDef = getPlanDefinition(planId);
  const inTrial = isTrialActive(billingOwner);

  if (inTrial && planDef.maxUsers > 1) {
    return next(new ErrorResponse('Team members are disabled during the trial period.', 403));
  }

  const addOns = await AddOns.findOne({ business: billingOwner.business }).lean();
  const maxUsers = planDef.maxUsers + (Number(addOns?.extraSeats) || 0);
  const activeUserCount = await User.countDocuments({
    business: billingOwner.business,
    isActive: true
  });

  if (activeUserCount >= maxUsers) {
    return next(new ErrorResponse('Team member limit reached for your plan.', 403));
  }

  return next();
};

module.exports = {
  checkSubscription,
  checkInvoiceLimit,
  checkFeatureAccess,
  checkTeamLimit
};
