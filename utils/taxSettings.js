const TaxSettings = require('../models/TaxSettings');
const mongoose = require('mongoose');

const DEFAULT_TAX_SETTINGS = Object.freeze({
  taxEnabled: true,
  taxName: 'VAT',
  taxRate: 7.5,
  allowManualOverride: true
});

const toBusinessObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  const normalized = String(value).trim();
  return mongoose.Types.ObjectId.isValid(normalized)
    ? new mongoose.Types.ObjectId(normalized)
    : null;
};

const getGlobalTaxSettings = async () =>
  TaxSettings.findOne({
    $or: [
      { business: null },
      { business: { $exists: false } }
    ]
  }).sort({ updatedAt: -1 });

const buildInitialTaxPayload = (fallback = null) => ({
  taxEnabled: fallback?.taxEnabled ?? DEFAULT_TAX_SETTINGS.taxEnabled,
  taxName: fallback?.taxName ?? DEFAULT_TAX_SETTINGS.taxName,
  taxRate: fallback?.taxRate ?? DEFAULT_TAX_SETTINGS.taxRate,
  allowManualOverride: fallback?.allowManualOverride ?? DEFAULT_TAX_SETTINGS.allowManualOverride
});

const getTaxSettings = async ({ businessId } = {}) => {
  const scopedBusinessId = toBusinessObjectId(businessId);

  if (!scopedBusinessId) {
    let settings = await getGlobalTaxSettings();
    if (!settings) {
      settings = await TaxSettings.create(buildInitialTaxPayload());
    }
    return settings;
  }

  let settings = await TaxSettings.findOne({ business: scopedBusinessId });
  if (settings) return settings;

  const fallback = await getGlobalTaxSettings();
  try {
    settings = await TaxSettings.create({
      business: scopedBusinessId,
      ...buildInitialTaxPayload(fallback)
    });
  } catch (error) {
    if (error?.code !== 11000) {
      throw error;
    }
    settings = await TaxSettings.findOne({ business: scopedBusinessId });
  }
  return settings;
};

module.exports = {
  DEFAULT_TAX_SETTINGS,
  getTaxSettings
};
