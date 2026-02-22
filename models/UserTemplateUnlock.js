const mongoose = require('mongoose');

const UserTemplateUnlockSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  templateId: {
    type: String,
    required: true,
    trim: true
  },
  purchasedAt: {
    type: Date,
    default: Date.now
  },
  isLifetime: {
    type: Boolean,
    default: true
  },
  unlockAllTemplates: {
    type: Boolean,
    default: false
  },
  amount: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  transactionId: String
}, {
  timestamps: true
});

UserTemplateUnlockSchema.index({ business: 1, templateId: 1 }, { unique: true });
UserTemplateUnlockSchema.index({ business: 1, unlockAllTemplates: 1 });

module.exports = mongoose.model('UserTemplateUnlock', UserTemplateUnlockSchema);
