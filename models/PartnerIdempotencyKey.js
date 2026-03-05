const mongoose = require('mongoose');

const PartnerIdempotencyKeySchema = new mongoose.Schema({
  partner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PartnerIntegration',
    required: true
  },
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  endpoint: {
    type: String,
    required: true,
    trim: true
  },
  idempotencyKey: {
    type: String,
    required: true,
    trim: true
  },
  requestHash: {
    type: String,
    required: true
  },
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
}, {
  timestamps: true
});

PartnerIdempotencyKeySchema.index(
  { partner: 1, endpoint: 1, idempotencyKey: 1 },
  { unique: true }
);
PartnerIdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PartnerIdempotencyKey', PartnerIdempotencyKeySchema);
