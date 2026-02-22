const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const User = require('../models/User');
const Business = require('../models/Business');
const TemplatePurchase = require('../models/TemplatePurchase');
const UserTemplateUnlock = require('../models/UserTemplateUnlock');
const templateCatalog = require('../data/templates');
const {
  PLAN_DEFINITIONS,
  TEMPLATE_BUNDLE_ID,
  TEMPLATE_BUNDLE_PRICE,
  FREE_TEMPLATE_IDS,
  normalizePlanId,
  normalizeTemplateCategory,
  getTemplatePrice,
  isTemplateIncludedInPlan
} = require('../utils/planConfig');
const {
  initializeTransaction,
  verifyTransaction,
  resolvePlanCode,
  resolveCurrency,
  verifySignature
} = require('../utils/paystack');
const {
  updateSubscriptionFromPayment,
  resolveBillingOwner,
  resolveEffectivePlan
} = require('../utils/subscriptionService');

const toMinorUnits = (amount) => Math.round(Number(amount) * 100);

const resolveTemplateById = (templateId) => templateCatalog.find((item) => item.id === templateId);

const getCallbackUrl = (req) =>
  `${process.env.FRONTEND_URL || process.env.REACT_APP_URL || `${req.protocol}://${req.get('host')}`}/payments/callback`;

const ensureBillingOwner = async (req) => {
  if (req.billingOwner) return req.billingOwner;
  const owner = await resolveBillingOwner(req.user);
  req.billingOwner = owner;
  return owner;
};

const handleTemplateUnlock = async ({ user, templateId, amount, currency, reference, unlockAllTemplates }) => {
  const existingUnlock = await UserTemplateUnlock.findOne({
    business: user.business,
    templateId: unlockAllTemplates ? TEMPLATE_BUNDLE_ID : templateId
  });

  if (existingUnlock) {
    return existingUnlock;
  }

  const unlock = await UserTemplateUnlock.create({
    business: user.business,
    user: user._id,
    templateId: unlockAllTemplates ? TEMPLATE_BUNDLE_ID : templateId,
    unlockAllTemplates: Boolean(unlockAllTemplates),
    amount,
    currency,
    transactionId: reference,
    isLifetime: true
  });

  await TemplatePurchase.create({
    business: user.business,
    user: user._id,
    templateId: unlockAllTemplates ? TEMPLATE_BUNDLE_ID : templateId,
    amount,
    currency,
    paymentMethod: 'paystack',
    transactionId: reference,
    status: 'completed',
    purchasedAt: new Date()
  });

  if (unlockAllTemplates) {
    user.hasLifetimeTemplates = true;
  } else if (templateId) {
    const existing = new Set(user.purchasedTemplates || []);
    existing.add(templateId);
    user.purchasedTemplates = Array.from(existing);
  }
  await user.save();

  return unlock;
};

const applyPaystackMetadata = async (payload, req) => {
  const metadata = payload?.metadata || {};
  const type = metadata.type;
  const userId = metadata.userId || metadata.user;
  const businessId = metadata.businessId || metadata.business;

  let user = null;
  if (userId) {
    user = await User.findById(userId);
  }
  if (!user && businessId) {
    const business = await Business.findById(businessId).lean();
    if (business?.owner) {
      user = await User.findById(business.owner);
    }
  }
  if (!user) {
    throw new Error('Unable to resolve user for payment');
  }

  const business = await Business.findById(user.business);
  if (!business) {
    throw new Error('Business not found for payment');
  }

  if (type === 'subscription') {
    const plan = normalizePlanId(metadata.plan || metadata.planId || payload?.plan);
    const billingCycle = metadata.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const customerCode = payload?.customer?.customer_code || payload?.customer?.id;
    const subscriptionCode = payload?.subscription?.subscription_code;
    const planCode = payload?.plan?.plan_code || metadata.planCode || resolvePlanCode(plan, billingCycle);

    await updateSubscriptionFromPayment({
      user,
      business,
      plan,
      billingCycle,
      paystackCustomerCode: customerCode,
      paystackSubscriptionCode: subscriptionCode,
      paystackPlanCode: planCode
    });

    return { type: 'subscription', plan, billingCycle };
  }

  if (type === 'template' || type === 'lifetime') {
    const templateId = metadata.templateId;
    const unlockAllTemplates = type === 'lifetime' || metadata.unlockAllTemplates;
    const amount = Number(payload?.amount) / 100;
    const currency = payload?.currency || resolveCurrency('USD');
    const reference = payload?.reference || metadata.reference || `paystack_${Date.now()}`;

    await handleTemplateUnlock({
      user,
      templateId,
      amount,
      currency,
      reference,
      unlockAllTemplates
    });

    return { type: 'template', templateId, unlockAllTemplates };
  }

  return { type: 'unknown' };
};

// @desc    Initialize subscription payment
// @route   POST /api/v1/payments/initialize-subscription
// @access  Private (Admin)
exports.initializeSubscriptionPayment = asyncHandler(async (req, res, next) => {
  const billingOwner = await ensureBillingOwner(req);
  const plan = normalizePlanId(req.body.plan);
  const billingCycle = req.body.billingCycle === 'yearly' ? 'yearly' : 'monthly';

  if (!PLAN_DEFINITIONS[plan]) {
    return next(new ErrorResponse('Invalid subscription plan', 400));
  }

  const planDef = PLAN_DEFINITIONS[plan];
  const amount = billingCycle === 'yearly' ? planDef.yearlyPrice : planDef.monthlyPrice;
  const currency = resolveCurrency('USD');
  const reference = `sub_${billingOwner._id}_${Date.now()}`;
  const planCode = resolvePlanCode(plan, billingCycle);

  const payload = {
    email: billingOwner.email,
    amount: toMinorUnits(amount),
    currency,
    reference,
    callback_url: getCallbackUrl(req),
    metadata: {
      type: 'subscription',
      plan,
      billingCycle,
      userId: billingOwner._id.toString(),
      businessId: billingOwner.business.toString(),
      planCode
    }
  };

  if (planCode) {
    payload.plan = planCode;
  }

  const response = await initializeTransaction(payload);

  res.status(200).json({
    success: true,
    data: {
      authorizationUrl: response?.data?.authorization_url,
      accessCode: response?.data?.access_code,
      reference: response?.data?.reference,
      amount,
      currency
    }
  });
});

// @desc    Initialize template purchase
// @route   POST /api/v1/payments/initialize-template
// @access  Private
exports.initializeTemplatePayment = asyncHandler(async (req, res, next) => {
  const billingOwner = await ensureBillingOwner(req);
  const { templateId, type } = req.body || {};

  let amount = TEMPLATE_BUNDLE_PRICE;
  let resolvedTemplateId = null;
  let paymentType = 'lifetime';

  if (type !== 'lifetime') {
    if (!templateId) {
      return next(new ErrorResponse('templateId is required', 400));
    }
    const template = resolveTemplateById(templateId);
    if (!template) {
      return next(new ErrorResponse('Template not found', 404));
    }
    const existingUnlock = await UserTemplateUnlock.findOne({
      business: billingOwner.business,
      templateId
    });
    if (existingUnlock || billingOwner?.purchasedTemplates?.includes(templateId)) {
      return next(new ErrorResponse('Template already purchased', 400));
    }
    const planId = resolveEffectivePlan(billingOwner);
    if (template.isFree || FREE_TEMPLATE_IDS.has(template.id) || isTemplateIncludedInPlan(template, planId)) {
      return next(new ErrorResponse('Template already included in your plan', 400));
    }
    if (normalizeTemplateCategory(template.category) === 'CUSTOM') {
      return next(new ErrorResponse('Custom templates cannot be purchased', 400));
    }
    amount = getTemplatePrice(template);
    resolvedTemplateId = template.id;
    paymentType = 'template';
  } else {
    const existingBundle = await UserTemplateUnlock.findOne({
      business: billingOwner.business,
      templateId: TEMPLATE_BUNDLE_ID
    });
    if (existingBundle || billingOwner?.hasLifetimeTemplates) {
      return next(new ErrorResponse('Lifetime templates already unlocked', 400));
    }
  }

  const currency = resolveCurrency('USD');
  const reference = `tmpl_${billingOwner._id}_${Date.now()}`;

  const response = await initializeTransaction({
    email: billingOwner.email,
    amount: toMinorUnits(amount),
    currency,
    reference,
    callback_url: getCallbackUrl(req),
    metadata: {
      type: paymentType,
      templateId: resolvedTemplateId,
      userId: billingOwner._id.toString(),
      businessId: billingOwner.business.toString(),
      unlockAllTemplates: paymentType === 'lifetime'
    }
  });

  res.status(200).json({
    success: true,
    data: {
      authorizationUrl: response?.data?.authorization_url,
      accessCode: response?.data?.access_code,
      reference: response?.data?.reference,
      amount,
      currency
    }
  });
});

// @desc    Verify Paystack transaction
// @route   GET /api/v1/payments/verify/:reference
// @access  Private
exports.verifyPayment = asyncHandler(async (req, res, next) => {
  const reference = req.params.reference;
  if (!reference) {
    return next(new ErrorResponse('Reference is required', 400));
  }

  const response = await verifyTransaction(reference);
  if (!response?.data) {
    return next(new ErrorResponse('Unable to verify payment', 400));
  }

  if (response.data.status !== 'success') {
    return next(new ErrorResponse('Payment not successful', 400));
  }

  const applied = await applyPaystackMetadata(response.data, req);

  res.status(200).json({
    success: true,
    data: {
      reference,
      status: response.data.status,
      applied
    }
  });
});

// @desc    Paystack webhook handler
// @route   POST /api/v1/payments/webhook
// @access  Public
exports.paystackWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  const isValid = verifySignature(req.rawBody, signature);

  if (!isValid) {
    return res.status(401).json({ success: false, error: 'Invalid signature' });
  }

  const event = req.body;
  const eventType = event?.event;
  const payload = event?.data;

  try {
    if (eventType === 'charge.success') {
      await applyPaystackMetadata(payload, req);
    }

    if (eventType === 'subscription.create' || eventType === 'subscription.disable') {
      const metadata = payload?.metadata || {};
      const userId = metadata.userId || metadata.user;
      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          const business = await Business.findById(user.business);
          if (eventType === 'subscription.disable') {
            user.subscriptionStatus = 'expired';
            await user.save();
            if (business) {
              business.subscription.status = 'expired';
              await business.save();
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Paystack webhook error:', error);
  }

  res.status(200).json({ success: true });
});
