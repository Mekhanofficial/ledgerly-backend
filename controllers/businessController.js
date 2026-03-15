const Business = require('../models/Business');
const Subscription = require('../models/Subscription');
const AuditLog = require('../models/AuditLog');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const { getPlanDefinition } = require('../utils/planConfig');
const {
  resolveBillingOwner,
  resolveEffectivePlan,
  expireSubscriptionIfNeeded,
  syncBusinessFromUser
} = require('../utils/subscriptionService');
const {
  removeStoredAsset,
  uploadCloudinaryImage
} = require('../utils/assetStorage');

const resolveObjectField = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    return null;
  }

  return null;
};

const logAuditEntry = async (req, action, resource, details = {}) => {
  await AuditLog.create({
    business: req.user.business,
    user: req.user.id,
    action,
    resource,
    details
  });
};

// @desc    Get business profile
// @route   GET /api/v1/business
// @access  Private
exports.getBusinessProfile = asyncHandler(async (req, res, next) => {
  const billingOwner = await resolveBillingOwner(req.user);
  if (billingOwner) {
    await expireSubscriptionIfNeeded(billingOwner);
    await syncBusinessFromUser(billingOwner);
  }

  const business = await Business.findById(req.user.business)
    .populate('owner', 'name email phone profileImage');

  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  if (!business.subscription?.billingCycle) {
    const latestSubscription = await Subscription.findOne({ business: business._id })
      .sort({ createdAt: -1 })
      .select('billingCycle')
      .lean();
    const inferredCycle = latestSubscription?.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    business.subscription = {
      ...(business.subscription || {}),
      billingCycle: inferredCycle
    };
    await business.save();
  }

  res.status(200).json({
    success: true,
    data: business
  });
});

// @desc    Update business profile
// @route   PUT /api/v1/business
// @access  Private (Admin/Accountant)
exports.updateBusinessProfile = asyncHandler(async (req, res, next) => {
  const business = await Business.findById(req.user.business);

  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  const allowedFields = ['name', 'email', 'phone', 'website', 'industry', 'logo', 'currency', 'timezone', 'taxId', 'registrationNumber'];
  const changes = {};
  const previousLogo = business.logo || '';
  const previousLogoPublicId = business.logoPublicId || '';
  const parsedAddress = resolveObjectField(req.body.address);
  const parsedSettings = resolveObjectField(req.body.settings);
  const removeLogoRequested = (() => {
    if (typeof req.body.removeLogo === 'boolean') {
      return req.body.removeLogo;
    }
    const normalized = String(req.body.removeLogo || '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  })();
  const requestedLogoValue = req.body.logo === undefined
    ? (removeLogoRequested ? '' : undefined)
    : String(req.body.logo || '').trim();
  const wantsUploadedLogo = Boolean(req.file?.buffer);
  const wantsRemoteLogo = requestedLogoValue !== undefined
    && requestedLogoValue !== ''
    && requestedLogoValue !== previousLogo;

  if (wantsUploadedLogo || wantsRemoteLogo) {
    const billingOwner = await resolveBillingOwner(req.user);
    const effectivePlan = resolveEffectivePlan(billingOwner);
    const planDefinition = getPlanDefinition(effectivePlan);

    if (!planDefinition.allowCustomLogo) {
      return next(new ErrorResponse(
        'Business logos are available on Professional and Enterprise plans.',
        403
      ));
    }
  }

  let shouldCleanupPreviousLogo = false;
  let uploadedLogo = null;

  allowedFields.forEach(field => {
    const hasFieldUpdate = field === 'logo'
      ? (req.body.logo !== undefined || removeLogoRequested)
      : req.body[field] !== undefined;
    if (!hasFieldUpdate) return;

    const nextValue = field === 'logo' ? requestedLogoValue : req.body[field];
    changes[field] = nextValue;
    business[field] = nextValue;

    if (field === 'logo') {
      business.logoPublicId = '';
      shouldCleanupPreviousLogo = nextValue !== previousLogo;
    }
  });

  if (req.file?.buffer) {
    uploadedLogo = await uploadCloudinaryImage(req.file, {
      assetType: 'logo',
      fileName: business.name || 'business-logo'
    });

    business.logo = uploadedLogo?.url || business.logo;
    business.logoPublicId = uploadedLogo?.publicId || '';
    changes.logo = business.logo;
    shouldCleanupPreviousLogo = previousLogo !== business.logo;
  }

  if (parsedAddress) {
    business.address = {
      ...business.address,
      ...parsedAddress
    };

    changes.address = parsedAddress;
  }

  if (parsedSettings) {
    business.settings = {
      ...business.settings,
      ...parsedSettings
    };
    changes.settings = parsedSettings;
  }

  try {
    await business.save();
  } catch (error) {
    if (uploadedLogo?.url) {
      await removeStoredAsset({
        url: uploadedLogo.url,
        publicId: uploadedLogo.publicId
      });
    }
    throw error;
  }

  if (shouldCleanupPreviousLogo && previousLogo && previousLogo !== business.logo) {
    await removeStoredAsset({
      url: previousLogo,
      publicId: previousLogoPublicId
    });
  }

  await logAuditEntry(req, 'update-business-profile', 'Business', changes);

  res.status(200).json({
    success: true,
    data: business
  });
});

// @desc    Get payment methods
// @route   GET /api/v1/business/payment-methods
// @access  Private
exports.getPaymentMethods = asyncHandler(async (req, res, next) => {
  const business = await Business.findById(req.user.business).select('paymentMethods');

  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  res.status(200).json({
    success: true,
    data: business.paymentMethods || []
  });
});

// @desc    Add payment method
// @route   POST /api/v1/business/payment-methods
// @access  Private (Admin/Accountant)
exports.addPaymentMethod = asyncHandler(async (req, res, next) => {
  const { name, accountDetails, providerId } = req.body;

  if (!name) {
    return next(new ErrorResponse('Payment method name is required', 400));
  }

  const business = await Business.findById(req.user.business);

  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  const method = {
    name,
    accountDetails: accountDetails || '',
    providerId,
    isActive: true
  };

  business.paymentMethods.push(method);
  await business.save();

  await logAuditEntry(req, 'add-payment-method', 'PaymentMethod', { method });

  res.status(201).json({
    success: true,
    data: business.paymentMethods[business.paymentMethods.length - 1]
  });
});

// @desc    Update payment method
// @route   PUT /api/v1/business/payment-methods/:methodId
// @access  Private (Admin/Accountant)
exports.updatePaymentMethod = asyncHandler(async (req, res, next) => {
  const business = await Business.findById(req.user.business);

  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  const method = business.paymentMethods.id(req.params.methodId);

  if (!method) {
    return next(new ErrorResponse('Payment method not found', 404));
  }

  const updates = ['name', 'accountDetails', 'isActive', 'providerId'];
  updates.forEach(field => {
    if (req.body[field] !== undefined) {
      method[field] = req.body[field];
    }
  });

  await business.save();
  await logAuditEntry(req, 'update-payment-method', 'PaymentMethod', { methodId: method._id, updates: req.body });

  res.status(200).json({
    success: true,
    data: method
  });
});

// @desc    Remove payment method
// @route   DELETE /api/v1/business/payment-methods/:methodId
// @access  Private (Admin/Accountant)
exports.removePaymentMethod = asyncHandler(async (req, res, next) => {
  const business = await Business.findById(req.user.business);

  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  const method = business.paymentMethods.id(req.params.methodId);

  if (!method) {
    return next(new ErrorResponse('Payment method not found', 404));
  }

  method.remove();
  await business.save();
  await logAuditEntry(req, 'remove-payment-method', 'PaymentMethod', { methodId: req.params.methodId });

  res.status(200).json({
    success: true,
    message: 'Payment method removed'
  });
});

// @desc    Update tax settings
// @route   PUT /api/v1/business/tax-settings
// @access  Private (Admin/Accountant)
exports.updateTaxSettings = asyncHandler(async (req, res, next) => {
  const business = await Business.findById(req.user.business);

  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  business.taxSettings = {
    ...business.taxSettings,
    ...req.body
  };

  await business.save();
  await logAuditEntry(req, 'update-tax-settings', 'Business', { taxSettings: req.body });

  res.status(200).json({
    success: true,
    data: business.taxSettings
  });
});

// @desc    Update invoice settings
// @route   PUT /api/v1/business/invoice-settings
// @access  Private (Admin/Accountant)
exports.updateInvoiceSettings = asyncHandler(async (req, res, next) => {
  const business = await Business.findById(req.user.business);

  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  business.invoiceSettings = {
    ...business.invoiceSettings,
    ...req.body
  };

  await business.save();
  await logAuditEntry(req, 'update-invoice-settings', 'Business', { invoiceSettings: req.body });

  res.status(200).json({
    success: true,
    data: business.invoiceSettings
  });
});

// @desc    Get business Paystack settings summary
// @route   GET /api/v1/business/paystack
// @access  Private (Admin/Accountant)
exports.getPaystackSettings = asyncHandler(async (req, res, next) => {
  const business = await Business.findById(req.user.business).select('+paystack.secretKeyEncrypted');

  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  res.status(200).json({
    success: true,
    data: business.getPaystackSummary()
  });
});

// @desc    Connect/update business Paystack keys for invoice payments
// @route   PUT /api/v1/business/paystack
// @access  Private (Admin/Accountant)
exports.updatePaystackSettings = asyncHandler(async (req, res, next) => {
  const business = await Business.findById(req.user.business).select('+paystack.secretKeyEncrypted');

  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  const {
    publicKey,
    secretKey,
    enabled,
    webhookEnabled
  } = req.body || {};

  if (publicKey !== undefined) {
    const normalizedPublicKey = String(publicKey || '').trim();
    if (!normalizedPublicKey) {
      return next(new ErrorResponse('Paystack public key cannot be empty', 400));
    }
    business.paystack.publicKey = normalizedPublicKey;
  }

  if (secretKey !== undefined) {
    const normalizedSecretKey = String(secretKey || '').trim();
    if (!normalizedSecretKey) {
      return next(new ErrorResponse('Paystack secret key cannot be empty', 400));
    }
    try {
      business.setPaystackSecretKey(normalizedSecretKey);
    } catch (error) {
      return next(new ErrorResponse(
        'Unable to encrypt Paystack secret key. Configure BUSINESS_KEYS_ENCRYPTION_KEY or APP_ENCRYPTION_KEY on the server.',
        500
      ));
    }
  }

  if (enabled !== undefined) {
    business.paystack.enabled = Boolean(enabled);
  }

  if (webhookEnabled !== undefined) {
    business.paystack.webhookEnabled = Boolean(webhookEnabled);
  }

  const hasPublicKey = Boolean(String(business.paystack?.publicKey || '').trim());
  const hasSecretKey = Boolean(business.paystack?.secretKeyEncrypted);

  if ((publicKey !== undefined || secretKey !== undefined) && (!hasPublicKey || !hasSecretKey)) {
    business.paystack.enabled = false;
  }

  if (hasPublicKey && hasSecretKey && enabled === undefined) {
    business.paystack.enabled = true;
  }

  if (!business.paystack.connectedAt && hasPublicKey && hasSecretKey) {
    business.paystack.connectedAt = new Date();
  }
  business.paystack.updatedAt = new Date();

  await business.save();
  await logAuditEntry(req, 'update-business-paystack', 'Business', {
    enabled: business.paystack.enabled,
    webhookEnabled: business.paystack.webhookEnabled,
    hasPublicKey,
    hasSecretKey
  });

  res.status(200).json({
    success: true,
    message: 'Paystack settings saved',
    data: business.getPaystackSummary()
  });
});

// @desc    Disconnect business Paystack keys for invoice payments
// @route   DELETE /api/v1/business/paystack
// @access  Private (Admin/Accountant)
exports.removePaystackSettings = asyncHandler(async (req, res, next) => {
  const business = await Business.findById(req.user.business).select('+paystack.secretKeyEncrypted');

  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  business.paystack = {
    ...(business.paystack || {}),
    enabled: false,
    publicKey: '',
    secretKeyEncrypted: '',
    secretKeyLast4: '',
    updatedAt: new Date()
  };

  await business.save();
  await logAuditEntry(req, 'remove-business-paystack', 'Business', {});

  res.status(200).json({
    success: true,
    message: 'Paystack disconnected',
    data: business.getPaystackSummary()
  });
});
