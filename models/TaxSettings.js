const mongoose = require('mongoose');

const TaxSettingsSchema = new mongoose.Schema({
  taxEnabled: {
    type: Boolean,
    default: true
  },
  taxName: {
    type: String,
    default: 'VAT',
    trim: true
  },
  taxRate: {
    type: Number,
    default: 7.5,
    min: 0
  },
  allowManualOverride: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('TaxSettings', TaxSettingsSchema);
