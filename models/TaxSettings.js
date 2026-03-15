const mongoose = require('mongoose');

const TaxSettingsSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    default: null
  },
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

TaxSettingsSchema.index(
  { business: 1 },
  {
    unique: true,
    partialFilterExpression: { business: { $type: 'objectId' } }
  }
);

module.exports = mongoose.model('TaxSettings', TaxSettingsSchema);
