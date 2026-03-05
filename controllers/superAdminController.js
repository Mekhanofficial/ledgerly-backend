const User = require('../models/User');
const Business = require('../models/Business');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Receipt = require('../models/Receipt');
const PartnerIntegration = require('../models/PartnerIntegration');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const { normalizeRole, isRoleSupported } = require('../utils/rolePermissions');
const {
  createPartnerApiKey,
  hashApiKey,
  getApiKeyPrefix,
  getApiKeyLast4,
  normalizePartnerScopes,
  normalizeRateLimitPerMinute,
  normalizeTemplateIdList,
  sanitizePartner
} = require('../utils/partnerApi');
const {
  resolveCanonicalTemplateId,
  resolveBusinessTemplateContext
} = require('../utils/templateAccess');

const buildSearchFilter = (search, fields) => {
  if (!search) return null;
  const regex = { $regex: search, $options: 'i' };
  return { $or: fields.map((field) => ({ [field]: regex })) };
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
};

const mapPartnerResponse = (partnerDoc) => {
  const partner = sanitizePartner(partnerDoc);
  const keyPrefix = String(partner.keyPrefix || '');
  const keyLast4 = String(partner.keyLast4 || '');
  const maskedTailLength = Math.max(8, 16 - keyLast4.length);
  return {
    ...partner,
    apiKeyMasked: keyLast4 ? `${keyPrefix}${'*'.repeat(maskedTailLength)}${keyLast4}` : ''
  };
};

const resolvePartnerTemplateConfig = ({
  templateContext,
  allowAllTemplates,
  providedAllowedTemplateIds,
  providedDefaultTemplateId,
  fallbackAllowedTemplateIds = [],
  fallbackDefaultTemplateId = 'standard'
}) => {
  const accessibleTemplateIds = templateContext.accessibleTemplateIds;
  const normalizedAllowed = normalizeTemplateIdList(providedAllowedTemplateIds)
    .map((templateId) => resolveCanonicalTemplateId(templateId, templateContext.templateLookup))
    .filter((templateId) => accessibleTemplateIds.has(templateId));

  const fallbackAllowed = normalizeTemplateIdList(fallbackAllowedTemplateIds)
    .map((templateId) => resolveCanonicalTemplateId(templateId, templateContext.templateLookup))
    .filter((templateId) => accessibleTemplateIds.has(templateId));

  let allowedTemplateIds = allowAllTemplates
    ? []
    : Array.from(new Set(normalizedAllowed.length ? normalizedAllowed : fallbackAllowed));

  if (!allowAllTemplates && !allowedTemplateIds.length) {
    if (accessibleTemplateIds.has('standard')) {
      allowedTemplateIds = ['standard'];
    } else {
      const [firstAccessibleTemplate] = Array.from(accessibleTemplateIds);
      if (firstAccessibleTemplate) {
        allowedTemplateIds = [firstAccessibleTemplate];
      }
    }
  }

  const defaultTemplateId = resolveCanonicalTemplateId(
    providedDefaultTemplateId || fallbackDefaultTemplateId || allowedTemplateIds[0] || 'standard',
    templateContext.templateLookup
  );

  if (!accessibleTemplateIds.has(defaultTemplateId)) {
    throw new ErrorResponse('Default template is not available for this business', 400);
  }

  if (!allowAllTemplates && !allowedTemplateIds.includes(defaultTemplateId)) {
    allowedTemplateIds = [defaultTemplateId, ...allowedTemplateIds];
  }

  return {
    allowAllTemplates,
    allowedTemplateIds: Array.from(new Set(allowedTemplateIds)),
    defaultTemplateId
  };
};

// @desc    Super admin overview
// @route   GET /api/v1/super-admin/overview
// @access  Private (Super Admin)
exports.getOverview = asyncHandler(async (req, res) => {
  const [users, businesses, invoices, payments, customers, products, receipts, partners] = await Promise.all([
    User.countDocuments(),
    Business.countDocuments(),
    Invoice.countDocuments(),
    Payment.countDocuments(),
    Customer.countDocuments(),
    Product.countDocuments(),
    Receipt.countDocuments(),
    PartnerIntegration.countDocuments()
  ]);

  res.status(200).json({
    success: true,
    data: {
      users,
      businesses,
      invoices,
      payments,
      customers,
      products,
      receipts,
      partners
    }
  });
});

// @desc    Get all users
// @route   GET /api/v1/super-admin/users
// @access  Private (Super Admin)
exports.getUsers = asyncHandler(async (req, res) => {
  const { search, role, page = 1, limit = 50 } = req.query;
  const query = {};

  const searchFilter = buildSearchFilter(search, ['name', 'email']);
  if (searchFilter) {
    query.$and = query.$and || [];
    query.$and.push(searchFilter);
  }

  if (role) {
    query.role = normalizeRole(role);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const users = await User.find(query)
    .select('-password -resetPasswordToken -invitationToken -invitationExpire')
    .populate('business', 'name email')
    .populate('customer', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const total = await User.countDocuments(query);

  res.status(200).json({
    success: true,
    count: users.length,
    total,
    pages: Math.ceil(total / limit),
    data: users
  });
});

// @desc    Update user (super admin)
// @route   PUT /api/v1/super-admin/users/:id
// @access  Private (Super Admin)
exports.updateUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (req.body.role) {
    const normalizedRole = normalizeRole(req.body.role);
    if (!isRoleSupported(normalizedRole)) {
      return next(new ErrorResponse('Invalid role provided', 400));
    }
    user.role = normalizedRole;
  }

  if (req.body.isActive !== undefined) {
    user.isActive = req.body.isActive;
  }

  if (req.body.businessId) {
    user.business = req.body.businessId;
  }

  if (req.body.customerId !== undefined) {
    user.customer = req.body.customerId || undefined;
  }

  if (req.body.permissions) {
    user.permissions = {
      ...user.permissions,
      ...req.body.permissions
    };
  }

  await user.save();

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Get all businesses
// @route   GET /api/v1/super-admin/businesses
// @access  Private (Super Admin)
exports.getBusinesses = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const query = {};

  const searchFilter = buildSearchFilter(search, ['name', 'email', 'phone']);
  if (searchFilter) {
    query.$and = query.$and || [];
    query.$and.push(searchFilter);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const businesses = await Business.find(query)
    .populate('owner', 'name email role')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const total = await Business.countDocuments(query);

  res.status(200).json({
    success: true,
    count: businesses.length,
    total,
    pages: Math.ceil(total / limit),
    data: businesses
  });
});

// @desc    Update business (super admin)
// @route   PUT /api/v1/super-admin/businesses/:id
// @access  Private (Super Admin)
exports.updateBusiness = asyncHandler(async (req, res, next) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  if (req.body.isActive !== undefined) {
    business.isActive = req.body.isActive;
  }

  if (req.body.name) business.name = req.body.name;
  if (req.body.email) business.email = req.body.email;
  if (req.body.phone) business.phone = req.body.phone;

  if (req.body.subscription) {
    business.subscription = {
      ...business.subscription,
      ...req.body.subscription
    };
  }

  await business.save();

  res.status(200).json({
    success: true,
    data: business
  });
});

// @desc    Get all invoices
// @route   GET /api/v1/super-admin/invoices
// @access  Private (Super Admin)
exports.getInvoices = asyncHandler(async (req, res) => {
  const { search, status, page = 1, limit = 50 } = req.query;
  const query = {};

  const searchFilter = buildSearchFilter(search, ['invoiceNumber', 'status']);
  if (searchFilter) {
    query.$and = query.$and || [];
    query.$and.push(searchFilter);
  }

  if (status) {
    query.status = status;
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const invoices = await Invoice.find(query)
    .populate('business', 'name email')
    .populate('customer', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const total = await Invoice.countDocuments(query);

  res.status(200).json({
    success: true,
    count: invoices.length,
    total,
    pages: Math.ceil(total / limit),
    data: invoices
  });
});

// @desc    Get all payments
// @route   GET /api/v1/super-admin/payments
// @access  Private (Super Admin)
exports.getPayments = asyncHandler(async (req, res) => {
  const { search, status, page = 1, limit = 50 } = req.query;
  const query = {};

  const searchFilter = buildSearchFilter(search, ['paymentMethod', 'paymentReference', 'status']);
  if (searchFilter) {
    query.$and = query.$and || [];
    query.$and.push(searchFilter);
  }

  if (status) {
    query.status = status;
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const payments = await Payment.find(query)
    .populate('business', 'name email')
    .populate('customer', 'name email')
    .populate('invoice', 'invoiceNumber')
    .sort({ paymentDate: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const total = await Payment.countDocuments(query);

  res.status(200).json({
    success: true,
    count: payments.length,
    total,
    pages: Math.ceil(total / limit),
    data: payments
  });
});

// @desc    Get all customers
// @route   GET /api/v1/super-admin/customers
// @access  Private (Super Admin)
exports.getCustomers = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const query = {};

  const searchFilter = buildSearchFilter(search, ['name', 'email', 'phone', 'company']);
  if (searchFilter) {
    query.$and = query.$and || [];
    query.$and.push(searchFilter);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const customers = await Customer.find(query)
    .populate('business', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const total = await Customer.countDocuments(query);

  res.status(200).json({
    success: true,
    count: customers.length,
    total,
    pages: Math.ceil(total / limit),
    data: customers
  });
});

// @desc    Get all products
// @route   GET /api/v1/super-admin/products
// @access  Private (Super Admin)
exports.getProducts = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const query = {};

  const searchFilter = buildSearchFilter(search, ['name', 'sku', 'barcode']);
  if (searchFilter) {
    query.$and = query.$and || [];
    query.$and.push(searchFilter);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const products = await Product.find(query)
    .populate('business', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const total = await Product.countDocuments(query);

  res.status(200).json({
    success: true,
    count: products.length,
    total,
    pages: Math.ceil(total / limit),
    data: products
  });
});

// @desc    Get all receipts
// @route   GET /api/v1/super-admin/receipts
// @access  Private (Super Admin)
exports.getReceipts = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const query = {};

  const searchFilter = buildSearchFilter(search, ['receiptNumber', 'paymentMethod']);
  if (searchFilter) {
    query.$and = query.$and || [];
    query.$and.push(searchFilter);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const receipts = await Receipt.find(query)
    .populate('business', 'name email')
    .populate('customer', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const total = await Receipt.countDocuments(query);

  res.status(200).json({
    success: true,
    count: receipts.length,
    total,
    pages: Math.ceil(total / limit),
    data: receipts
  });
});

// @desc    Get partner template options for a business
// @route   GET /api/v1/super-admin/partner-template-options
// @access  Private (Super Admin)
exports.getPartnerTemplateOptions = asyncHandler(async (req, res, next) => {
  const businessId = String(req.query.businessId || '').trim();
  if (!businessId) {
    return next(new ErrorResponse('businessId query parameter is required', 400));
  }

  const business = await Business.findById(businessId).select('_id name email');
  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  const templateContext = await resolveBusinessTemplateContext({ businessId });
  const templates = templateContext.templates
    .filter((template) => template.hasAccess)
    .map((template) => ({
      id: template.id,
      name: template.name,
      category: template.category,
      templateStyle: template.templateStyle,
      isFree: template.isFree,
      previewColor: template.previewColor
    }));

  res.status(200).json({
    success: true,
    data: {
      business: {
        id: business._id,
        name: business.name,
        email: business.email
      },
      planId: templateContext.planId,
      templates
    }
  });
});

// @desc    Get partner integrations
// @route   GET /api/v1/super-admin/partners
// @access  Private (Super Admin)
exports.getPartners = asyncHandler(async (req, res) => {
  const { search, businessId, page = 1, limit = 50 } = req.query;
  const query = {};

  if (businessId) {
    query.business = businessId;
  }

  if (req.query.isActive !== undefined) {
    query.isActive = toBoolean(req.query.isActive, true);
  }

  const searchFilter = buildSearchFilter(search, ['name', 'description', 'keyPrefix']);
  if (searchFilter) {
    query.$and = query.$and || [];
    query.$and.push(searchFilter);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const [partners, total] = await Promise.all([
    PartnerIntegration.find(query)
      .populate('business', 'name email isActive')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10)),
    PartnerIntegration.countDocuments(query)
  ]);

  res.status(200).json({
    success: true,
    count: partners.length,
    total,
    pages: Math.ceil(total / limit),
    data: partners.map(mapPartnerResponse)
  });
});

// @desc    Create partner integration
// @route   POST /api/v1/super-admin/partners
// @access  Private (Super Admin)
exports.createPartner = asyncHandler(async (req, res, next) => {
  const businessId = String(req.body.businessId || '').trim();
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();

  if (!businessId) {
    return next(new ErrorResponse('businessId is required', 400));
  }
  if (!name) {
    return next(new ErrorResponse('Partner integration name is required', 400));
  }

  const business = await Business.findById(businessId).select('_id name isActive');
  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  const templateContext = await resolveBusinessTemplateContext({ businessId });
  if (!templateContext.accessibleTemplateIds.size) {
    return next(new ErrorResponse('No templates are available for this business', 403));
  }

  const allowAllTemplates = toBoolean(req.body.allowAllTemplates, false);
  const templateConfig = resolvePartnerTemplateConfig({
    templateContext,
    allowAllTemplates,
    providedAllowedTemplateIds: req.body.allowedTemplateIds,
    providedDefaultTemplateId: req.body.defaultTemplateId
  });

  const rawApiKey = createPartnerApiKey();
  const partner = await PartnerIntegration.create({
    business: businessId,
    name,
    description,
    apiKeyHash: hashApiKey(rawApiKey),
    keyPrefix: getApiKeyPrefix(rawApiKey),
    keyLast4: getApiKeyLast4(rawApiKey),
    scopes: normalizePartnerScopes(req.body.scopes),
    allowAllTemplates: templateConfig.allowAllTemplates,
    allowedTemplateIds: templateConfig.allowedTemplateIds,
    defaultTemplateId: templateConfig.defaultTemplateId,
    webhookUrl: String(req.body.webhookUrl || '').trim(),
    rateLimitPerMinute: normalizeRateLimitPerMinute(req.body.rateLimitPerMinute, 120),
    isActive: req.body.isActive === undefined ? true : toBoolean(req.body.isActive, true),
    createdBy: req.user.id,
    updatedBy: req.user.id
  });

  const mapped = mapPartnerResponse(
    await PartnerIntegration.findById(partner._id).populate('business', 'name email isActive')
  );

  res.status(201).json({
    success: true,
    data: mapped,
    apiKey: rawApiKey
  });
});

// @desc    Update partner integration
// @route   PUT /api/v1/super-admin/partners/:id
// @access  Private (Super Admin)
exports.updatePartner = asyncHandler(async (req, res, next) => {
  const partner = await PartnerIntegration.findById(req.params.id);
  if (!partner) {
    return next(new ErrorResponse('Partner integration not found', 404));
  }

  const targetBusinessId = String(req.body.businessId || partner.business).trim();
  const business = await Business.findById(targetBusinessId).select('_id');
  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  const templateContext = await resolveBusinessTemplateContext({ businessId: targetBusinessId });
  if (!templateContext.accessibleTemplateIds.size) {
    return next(new ErrorResponse('No templates are available for this business', 403));
  }

  const allowAllTemplates = req.body.allowAllTemplates === undefined
    ? partner.allowAllTemplates
    : toBoolean(req.body.allowAllTemplates, false);

  const templateConfig = resolvePartnerTemplateConfig({
    templateContext,
    allowAllTemplates,
    providedAllowedTemplateIds:
      req.body.allowedTemplateIds === undefined ? partner.allowedTemplateIds : req.body.allowedTemplateIds,
    providedDefaultTemplateId:
      req.body.defaultTemplateId === undefined ? partner.defaultTemplateId : req.body.defaultTemplateId,
    fallbackAllowedTemplateIds: partner.allowedTemplateIds,
    fallbackDefaultTemplateId: partner.defaultTemplateId
  });

  partner.business = targetBusinessId;
  if (req.body.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return next(new ErrorResponse('Partner integration name cannot be empty', 400));
    }
    partner.name = name;
  }
  if (req.body.description !== undefined) {
    partner.description = String(req.body.description || '').trim();
  }
  if (req.body.scopes !== undefined) {
    partner.scopes = normalizePartnerScopes(req.body.scopes, partner.scopes);
  }
  if (req.body.webhookUrl !== undefined) {
    partner.webhookUrl = String(req.body.webhookUrl || '').trim();
  }
  if (req.body.rateLimitPerMinute !== undefined) {
    partner.rateLimitPerMinute = normalizeRateLimitPerMinute(
      req.body.rateLimitPerMinute,
      partner.rateLimitPerMinute
    );
  }
  if (req.body.isActive !== undefined) {
    partner.isActive = toBoolean(req.body.isActive, true);
  }

  partner.allowAllTemplates = templateConfig.allowAllTemplates;
  partner.allowedTemplateIds = templateConfig.allowedTemplateIds;
  partner.defaultTemplateId = templateConfig.defaultTemplateId;
  partner.updatedBy = req.user.id;

  await partner.save();

  const mapped = mapPartnerResponse(
    await PartnerIntegration.findById(partner._id).populate('business', 'name email isActive')
  );

  res.status(200).json({
    success: true,
    data: mapped
  });
});

// @desc    Rotate partner API key
// @route   POST /api/v1/super-admin/partners/:id/rotate-key
// @access  Private (Super Admin)
exports.rotatePartnerKey = asyncHandler(async (req, res, next) => {
  const partner = await PartnerIntegration.findById(req.params.id);
  if (!partner) {
    return next(new ErrorResponse('Partner integration not found', 404));
  }

  const rawApiKey = createPartnerApiKey();
  partner.apiKeyHash = hashApiKey(rawApiKey);
  partner.keyPrefix = getApiKeyPrefix(rawApiKey);
  partner.keyLast4 = getApiKeyLast4(rawApiKey);
  partner.lastUsedAt = null;
  partner.updatedBy = req.user.id;
  await partner.save();

  const mapped = mapPartnerResponse(
    await PartnerIntegration.findById(partner._id).populate('business', 'name email isActive')
  );

  res.status(200).json({
    success: true,
    data: mapped,
    apiKey: rawApiKey
  });
});
