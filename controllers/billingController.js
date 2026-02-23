const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const Business = require('../models/Business');
const Subscription = require('../models/Subscription');
const AddOns = require('../models/AddOns');
const { PLAN_DEFINITIONS, normalizePlanId, YEARLY_DISCOUNT } = require('../utils/planConfig');
const { resolveCurrency } = require('../utils/paystack');
const {
  resolveBillingOwner,
  resolveEffectivePlan,
  isTrialActive,
  isSubscriptionActive,
  resolveInvoiceLimit,
  updateSubscriptionFromPayment
} = require('../utils/subscriptionService');

const clampExtraSeats = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
};

// @desc    Get billing summary (subscription + add-ons)
// @route   GET /api/v1/billing/summary
// @access  Private (Admin/Super Admin)
exports.getBillingSummary = asyncHandler(async (req, res) => {
  const billingOwner = await resolveBillingOwner(req.user);
  const pricingCurrency = resolveCurrency('NGN');
  const business = await Business.findById(req.user.business)
    .select('subscription paymentMethods currency name')
    .lean();

  const subscription = await Subscription.findOne({ business: req.user.business })
    .sort({ createdAt: -1 })
    .lean();

  const addOns = await AddOns.findOne({ business: req.user.business }).lean();

  const fallbackPlan = business?.subscription?.plan || billingOwner?.plan || 'starter';
  const planId = billingOwner ? resolveEffectivePlan(billingOwner) : normalizePlanId(subscription?.plan || fallbackPlan);
  const billingCycle = subscription?.billingCycle || 'monthly';
  const status = billingOwner?.subscriptionStatus || subscription?.status || business?.subscription?.status || 'active';
  const subscriptionStart = subscription?.subscriptionStart || null;
  const subscriptionEnd = billingOwner?.subscriptionEndsAt || subscription?.subscriptionEnd || business?.subscription?.currentPeriodEnd || null;

  res.status(200).json({
    success: true,
    data: {
      planCatalog: PLAN_DEFINITIONS,
      yearlyDiscount: YEARLY_DISCOUNT,
      subscription: {
        plan: planId,
        billingCycle,
        status,
        subscriptionStart,
        subscriptionEnd,
        trialEndsAt: billingOwner?.trialEndsAt || business?.subscription?.trialEndsAt || null,
        isTrial: billingOwner ? isTrialActive(billingOwner) : false,
        isActive: billingOwner ? isSubscriptionActive(billingOwner) : status === 'active'
      },
      addOns: addOns || {
        whiteLabelEnabled: false,
        extraSeats: 0,
        analyticsEnabled: false
      },
      paymentMethods: business?.paymentMethods || [],
      currency: business?.currency || pricingCurrency,
      pricingCurrency,
      businessName: business?.name || '',
      invoiceLimit: billingOwner ? resolveInvoiceLimit(billingOwner) : undefined,
      invoiceCountThisMonth: billingOwner?.invoiceCountThisMonth ?? 0
    }
  });
});

// @desc    Update subscription plan/billing cycle
// @route   PUT /api/v1/billing/subscription
// @access  Private (Admin/Super Admin)
exports.updateSubscription = asyncHandler(async (req, res, next) => {
  const plan = normalizePlanId(req.body.plan);
  const billingCycle = req.body.billingCycle === 'yearly' ? 'yearly' : 'monthly';

  if (!PLAN_DEFINITIONS[plan]) {
    return next(new ErrorResponse('Invalid subscription plan', 400));
  }

  const billingOwner = await resolveBillingOwner(req.user);
  const business = await Business.findById(req.user.business);

  const updatedSubscription = await updateSubscriptionFromPayment({
    user: billingOwner || req.user,
    business,
    plan,
    billingCycle
  });

  if (!updatedSubscription) {
    return next(new ErrorResponse('Unable to update subscription', 500));
  }

  res.status(200).json({
    success: true,
    data: updatedSubscription
  });
});

// @desc    Update add-ons
// @route   PUT /api/v1/billing/addons
// @access  Private (Admin/Super Admin)
exports.updateAddOns = asyncHandler(async (req, res) => {
  const billingOwner = await resolveBillingOwner(req.user);
  const planId = billingOwner ? resolveEffectivePlan(billingOwner) : 'starter';
  const planDef = PLAN_DEFINITIONS[planId] || PLAN_DEFINITIONS.starter;

  const allowWhiteLabel = planDef.allowWhiteLabel || planId === 'professional';
  const allowExtraSeats = planDef.maxUsers > 1;

  const payload = {
    whiteLabelEnabled: allowWhiteLabel ? Boolean(req.body.whiteLabelEnabled) : false,
    analyticsEnabled: Boolean(req.body.analyticsEnabled),
    extraSeats: allowExtraSeats ? clampExtraSeats(req.body.extraSeats) : 0,
    user: req.user.id,
    business: req.user.business
  };

  const addOns = await AddOns.findOneAndUpdate(
    { business: req.user.business },
    payload,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({
    success: true,
    data: addOns
  });
});
