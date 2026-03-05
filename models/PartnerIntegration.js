const mongoose = require('mongoose');

const PARTNER_SCOPE_VALUES = [
  'templates:read',
  'invoices:create',
  'invoices:read',
  'invoices:pdf',
  'invoices:send'
];

const PartnerIntegrationSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Partner integration name is required'],
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  apiKeyHash: {
    type: String,
    required: true,
    select: false
  },
  keyPrefix: {
    type: String,
    required: true
  },
  keyLast4: {
    type: String,
    required: true
  },
  scopes: [{
    type: String,
    enum: PARTNER_SCOPE_VALUES
  }],
  allowAllTemplates: {
    type: Boolean,
    default: false
  },
  allowedTemplateIds: [{
    type: String,
    trim: true
  }],
  defaultTemplateId: {
    type: String,
    default: 'standard',
    trim: true
  },
  webhookUrl: {
    type: String,
    trim: true,
    default: ''
  },
  rateLimitPerMinute: {
    type: Number,
    default: 120,
    min: 1,
    max: 5000
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUsedAt: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

PartnerIntegrationSchema.index({ business: 1, name: 1 });
PartnerIntegrationSchema.index({ business: 1, isActive: 1 });
PartnerIntegrationSchema.index({ apiKeyHash: 1 }, { unique: true });

module.exports = mongoose.model('PartnerIntegration', PartnerIntegrationSchema);
