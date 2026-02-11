const asyncHandler = require('../utils/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const CustomTemplate = require('../models/CustomTemplate');
const TemplatePurchase = require('../models/TemplatePurchase');
const templateCatalog = require('../data/templates');

const RESERVED_TEMPLATE_NAMES = new Set(['consultant', 'retail']);

const normalizeTemplate = (template, accessMap) => {
  const hasAccess = !template.isPremium || accessMap.has(template.id);
  return {
    ...template,
    hasAccess
  };
};

// @desc    Get templates (built-in + custom)
// @route   GET /api/v1/templates
// @access  Private
exports.getTemplates = asyncHandler(async (req, res) => {
  const purchases = await TemplatePurchase.find({
    business: req.user.business,
    status: 'completed'
  }).select('templateId');

  const accessMap = new Set(purchases.map((purchase) => purchase.templateId));
  const builtInTemplates = templateCatalog.map((template) => normalizeTemplate(template, accessMap));

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
    category: template.category || 'custom',
    isPremium: false,
    isDefault: template.isDefault || false,
    isFavorite: template.isFavorite || false,
    price: 0,
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

  if (!template.isPremium) {
    return next(new ErrorResponse('Template is already free', 400));
  }

  const existing = await TemplatePurchase.findOne({
    business: req.user.business,
    templateId,
    status: 'completed'
  });

  if (existing) {
    return res.status(200).json({
      success: true,
      data: existing,
      message: 'Template already purchased'
    });
  }

  const purchase = await TemplatePurchase.create({
    business: req.user.business,
    user: req.user.id,
    templateId,
    amount: template.price || 0,
    currency: req.body.currency || 'USD',
    paymentMethod: req.body.paymentMethod || 'manual',
    transactionId: req.body.transactionId || `tmpl_${Date.now()}`
  });

  res.status(201).json({
    success: true,
    data: purchase
  });
});

// @desc    Get template purchases
// @route   GET /api/v1/templates/purchases
// @access  Private
exports.getTemplatePurchases = asyncHandler(async (req, res) => {
  const purchases = await TemplatePurchase.find({
    business: req.user.business,
    status: 'completed'
  }).sort({ purchasedAt: -1 });

  res.status(200).json({
    success: true,
    count: purchases.length,
    data: purchases
  });
});
