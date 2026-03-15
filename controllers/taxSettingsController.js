const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const { getTaxSettings } = require('../utils/taxSettings');

// @desc    Get business tax settings
// @route   GET /api/v1/tax-settings
// @access  Private
exports.getTaxSettings = asyncHandler(async (req, res) => {
  const settings = await getTaxSettings({ businessId: req.user?.business });

  res.status(200).json({
    success: true,
    data: settings
  });
});

// @desc    Update business tax settings
// @route   PUT /api/v1/tax-settings
// @access  Private (Admin/Accountant based on RBAC)
exports.updateTaxSettings = asyncHandler(async (req, res, next) => {
  const payload = req.body || {};

  if (payload.taxRate !== undefined && Number(payload.taxRate) < 0) {
    return next(new ErrorResponse('Tax rate cannot be negative', 400));
  }

  const settings = await getTaxSettings({ businessId: req.user?.business });

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
