const Business = require('../models/Business');
const AuditLog = require('../models/AuditLog');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');

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
  const business = await Business.findById(req.user.business)
    .populate('owner', 'name email phone profileImage');

  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
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

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      changes[field] = req.body[field];
      business[field] = req.body[field];
    }
  });

  if (req.body.address) {
    business.address = {
      ...business.address,
      ...req.body.address
    };

    changes.address = req.body.address;
  }

  if (req.body.settings) {
    business.settings = {
      ...business.settings,
      ...req.body.settings
    };
    changes.settings = req.body.settings;
  }

  await business.save();
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
