const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const CustomTemplate = require('../models/CustomTemplate');
const TemplatePurchase = require('../models/TemplatePurchase');
const UserTemplateUnlock = require('../models/UserTemplateUnlock');
const templateCatalog = require('../data/templates');
const {
  TEMPLATE_BUNDLE_ID,
  TEMPLATE_BUNDLE_PRICE,
  FREE_TEMPLATE_IDS,
  normalizePlanId,
  normalizeTemplateCategory,
  getTemplatePrice,
  isTemplateIncludedInPlan,
  resolveRequiredPlanForTemplate
} = require('../utils/planConfig');
const {
  resolveBillingOwner,
  resolveEffectivePlan,
  isTrialActive,
  isSubscriptionActive,
  expireSubscriptionIfNeeded,
  syncBusinessFromUser
} = require('../utils/subscriptionService');

const RESERVED_TEMPLATE_NAMES = new Set(['consultant', 'retail']);

const resolvePlanContext = async (req) => {
  const billingOwner = await resolveBillingOwner(req.user);
  await expireSubscriptionIfNeeded(billingOwner);
  await syncBusinessFromUser(billingOwner);

  const planId = resolveEffectivePlan(billingOwner);
  const status = billingOwner?.subscriptionStatus || 'active';
  const expiresAt = billingOwner?.subscriptionEndsAt || null;
  const isActive = isTrialActive(billingOwner) || isSubscriptionActive(billingOwner);

  return {
    planId,
    status,
    expiresAt,
    isActive,
    userId: billingOwner?._id?.toString() || req.user.id
  };
};

const normalizeTemplate = (template, accessContext) => {
  const category = normalizeTemplateCategory(template.category);
  const isCustom = category === 'CUSTOM' || template.category === 'custom';
  const isFree = Boolean(template.isFree) || FREE_TEMPLATE_IDS.has(template.id);
  const includedInPlan = isTemplateIncludedInPlan(template, accessContext.planId);
  const hasPurchase = accessContext.purchaseMap.has(template.id);

  let hasAccess = false;
  let accessSource = null;

  if (isCustom) {
    hasAccess = true;
    accessSource = 'custom';
  } else if (isFree) {
    hasAccess = true;
    accessSource = 'free';
  } else if (accessContext.hasBundle) {
    hasAccess = true;
    accessSource = 'bundle';
  } else if (includedInPlan) {
    hasAccess = true;
    accessSource = 'plan';
  } else if (hasPurchase) {
    hasAccess = true;
    accessSource = 'purchase';
  }

  const requiredPlan = hasAccess ? accessContext.planId : resolveRequiredPlanForTemplate(template);
  const price = getTemplatePrice({ ...template, category });

  return {
    ...template,
    category,
    price,
    isPremium: category !== 'STANDARD',
    isFree,
    hasAccess,
    accessSource,
    requiredPlan,
    canPurchase: !hasAccess
  };
};

// @desc    Get templates (built-in + custom)
// @route   GET /api/v1/templates
// @access  Private
exports.getTemplates = asyncHandler(async (req, res) => {
  const planContext = await resolvePlanContext(req);

  const [legacyPurchases, unlocks] = await Promise.all([
    TemplatePurchase.find({
      business: req.user.business,
      status: 'completed'
    }).select('templateId'),
    UserTemplateUnlock.find({
      business: req.user.business
    }).select('templateId unlockAllTemplates')
  ]);

  const purchaseMap = new Set([
    ...legacyPurchases.map((purchase) => purchase.templateId),
    ...unlocks.filter((unlock) => unlock.templateId).map((unlock) => unlock.templateId)
  ]);
  const billingOwner = await resolveBillingOwner(req.user);
  const hasBundle = unlocks.some((unlock) => unlock.unlockAllTemplates || unlock.templateId === TEMPLATE_BUNDLE_ID)
    || Boolean(billingOwner?.hasLifetimeTemplates);
  if (billingOwner?.purchasedTemplates?.length) {
    billingOwner.purchasedTemplates.forEach((templateId) => purchaseMap.add(templateId));
  }

  const builtInTemplates = templateCatalog.map((template) => normalizeTemplate(template, {
    ...planContext,
    purchaseMap,
    hasBundle
  }));

  const customTemplates = await CustomTemplate.find({
    business: req.user.business
  }).lean();

  const filteredCustomTemplates = customTemplates.filter((template) => {
    const name = (template.name || '').trim().toLowerCase();
    const style = (template.templateStyle || '').trim().toLowerCase();
    if (RESERVED_TEMPLATE_NAMES.has(name) || RESERVED_TEMPLATE_NAMES.has(style)) {
      return false;
    }
    return true;
  });

  const mappedCustomTemplates = filteredCustomTemplates.map((template) => ({
    id: template._id.toString(),
    name: template.name,
    description: template.description,
    category: 'CUSTOM',
    isPremium: false,
    isDefault: template.isDefault || false,
    isFavorite: template.isFavorite || false,
    price: 0,
    isActive: true,
    previewImage: template.previewImage || '',
    isIncludedInStarter: true,
    isIncludedInProfessional: true,
    isIncludedInEnterprise: true,
    previewColor: template.previewColor || 'bg-gradient-to-br from-primary-500 to-primary-600',
    templateStyle: template.templateStyle || 'standard',
    lineItems: template.lineItems || [],
    notes: template.notes || '',
    terms: template.terms || '',
    emailSubject: template.emailSubject || '',
    emailMessage: template.emailMessage || '',
    currency: template.currency || 'USD',
    paymentTerms: template.paymentTerms || 'net-30',
    hasAccess: true,
    accessSource: 'custom',
    requiredPlan: planContext.planId,
    canPurchase: false,
    createdAt: template.createdAt
  }));

  const data = [...builtInTemplates, ...mappedCustomTemplates];

  res.status(200).json({
    success: true,
    count: data.length,
    data
  });
});

// @desc    Create custom template
// @route   POST /api/v1/templates/custom
// @access  Private
exports.createCustomTemplate = asyncHandler(async (req, res, next) => {
  const { name, description, previewColor } = req.body;

  if (!name || !name.trim()) {
    return next(new ErrorResponse('Template name is required', 400));
  }

  const customTemplate = await CustomTemplate.create({
    business: req.user.business,
    createdBy: req.user.id,
    name: name.trim(),
    description: description?.trim() || 'Custom invoice template',
    previewColor: previewColor || 'bg-gradient-to-br from-primary-500 to-primary-600'
  });

  res.status(201).json({
    success: true,
    data: customTemplate
  });
});

// @desc    Purchase template
// @route   POST /api/v1/templates/:id/purchase
// @access  Private
exports.purchaseTemplate = asyncHandler(async (req, res, next) => {
  const templateId = req.params.id;
  const template = templateCatalog.find((item) => item.id === templateId);

  if (!template) {
    return next(new ErrorResponse('Template not found', 404));
  }

  const planContext = await resolvePlanContext(req);
  if (template.isFree || FREE_TEMPLATE_IDS.has(template.id)) {
    return next(new ErrorResponse('Template is already free to use', 400));
  }
  if (isTemplateIncludedInPlan(template, planContext.planId)) {
    return next(new ErrorResponse('Template already included in your plan', 400));
  }

  const existingUnlock = await UserTemplateUnlock.findOne({
    business: req.user.business,
    templateId
  });

  if (existingUnlock) {
    return res.status(200).json({
      success: true,
      data: existingUnlock,
      message: 'Template already purchased'
    });
  }

  const existingLegacy = await TemplatePurchase.findOne({
    business: req.user.business,
    templateId,
    status: 'completed'
  });

  if (existingLegacy) {
    return res.status(200).json({
      success: true,
      data: existingLegacy,
      message: 'Template already purchased'
    });
  }

  const amount = getTemplatePrice(template);
  const transactionId = req.body.transactionId || `tmpl_${Date.now()}`;
  const currency = req.body.currency || 'USD';

  const unlock = await UserTemplateUnlock.create({
    business: req.user.business,
    user: req.user.id,
    templateId,
    amount,
    currency,
    transactionId,
    isLifetime: true
  });

  await TemplatePurchase.create({
    business: req.user.business,
    user: req.user.id,
    templateId,
    amount,
    currency,
    paymentMethod: req.body.paymentMethod || 'manual',
    transactionId
  });

  const billingOwner = await resolveBillingOwner(req.user);
  if (billingOwner) {
    const existing = new Set(billingOwner.purchasedTemplates || []);
    existing.add(templateId);
    billingOwner.purchasedTemplates = Array.from(existing);
    await billingOwner.save();
  }

  res.status(201).json({
    success: true,
    data: unlock
  });
});

// @desc    Purchase all templates bundle
// @route   POST /api/v1/templates/bundle/purchase
// @access  Private
exports.purchaseTemplateBundle = asyncHandler(async (req, res, next) => {
  const existing = await UserTemplateUnlock.findOne({
    business: req.user.business,
    templateId: TEMPLATE_BUNDLE_ID
  });

  if (existing) {
    return res.status(200).json({
      success: true,
      data: existing,
      message: 'Template bundle already purchased'
    });
  }

  const transactionId = req.body.transactionId || `bundle_${Date.now()}`;
  const currency = req.body.currency || 'USD';

  const unlock = await UserTemplateUnlock.create({
    business: req.user.business,
    user: req.user.id,
    templateId: TEMPLATE_BUNDLE_ID,
    unlockAllTemplates: true,
    amount: TEMPLATE_BUNDLE_PRICE,
    currency,
    transactionId,
    isLifetime: true
  });

  const billingOwner = await resolveBillingOwner(req.user);
  if (billingOwner) {
    billingOwner.hasLifetimeTemplates = true;
    await billingOwner.save();
  }

  res.status(201).json({
    success: true,
    data: unlock
  });
});

// @desc    Get template purchases
// @route   GET /api/v1/templates/purchases
// @access  Private
exports.getTemplatePurchases = asyncHandler(async (req, res) => {
  const [legacyPurchases, unlocks] = await Promise.all([
    TemplatePurchase.find({
      business: req.user.business,
      status: 'completed'
    }).sort({ purchasedAt: -1 }),
    UserTemplateUnlock.find({
      business: req.user.business
    }).sort({ purchasedAt: -1 })
  ]);

  res.status(200).json({
    success: true,
    count: legacyPurchases.length + unlocks.length,
    data: {
      legacyPurchases,
      unlocks
    }
  });
});
