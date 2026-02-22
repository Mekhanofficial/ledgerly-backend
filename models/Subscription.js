const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
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
  plan: {
    type: String,
    enum: ['starter', 'professional', 'enterprise'],
    required: true
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: 'monthly'
  },
  status: {
    type: String,
    enum: ['trial', 'active', 'expired', 'past_due', 'canceled', 'incomplete'],
    default: 'active'
  },
  subscriptionStart: {
    type: Date,
    default: Date.now
  },
  subscriptionEnd: Date,
  expiresAt: Date,
  paystackCustomerCode: String,
  paystackSubscriptionCode: String,
  paystackPlanCode: String
}, {
  timestamps: true
});

SubscriptionSchema.pre('save', function(next) {
  if (this.subscriptionEnd && !this.expiresAt) {
    this.expiresAt = this.subscriptionEnd;
  }
  next();
});

SubscriptionSchema.index({ business: 1, status: 1 });
SubscriptionSchema.index({ user: 1, status: 1 });

module.exports = mongoose.model('Subscription', SubscriptionSchema);
