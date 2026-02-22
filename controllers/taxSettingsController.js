const TaxSettings = require('../models/TaxSettings');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get global tax settings
// @route   GET /api/v1/tax-settings
// @access  Private
exports.getTaxSettings = asyncHandler(async (req, res) => {
  let settings = await TaxSettings.findOne();
  if (!settings) {
    settings = await TaxSettings.create({});
  }

  res.status(200).json({
    success: true,
    data: settings
  });
});

// @desc    Update global tax settings
// @route   PUT /api/v1/tax-settings
// @access  Private (Super Admin only)
exports.updateTaxSettings = asyncHandler(async (req, res, next) => {
  const payload = req.body || {};

  if (payload.taxRate !== undefined && Number(payload.taxRate) < 0) {
    return next(new ErrorResponse('Tax rate cannot be negative', 400));
  }

  let settings = await TaxSettings.findOne();
  if (!settings) {
    settings = await TaxSettings.create({});
  }

  const updates = {
    taxEnabled: payload.taxEnabled ?? settings.taxEnabled,
    taxName: payload.taxName ?? settings.taxName,
    taxRate: payload.taxRate ?? settings.taxRate,
    allowManualOverride: payload.allowManualOverride ?? settings.allowManualOverride
  };

  settings.set(updates);
  await settings.save();

  res.status(200).json({
    success: true,
    data: settings
  });
});
