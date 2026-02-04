const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  paymentMethod: {
    type: String,
    required: true
  },
  paymentReference: String,
  paymentGateway: String,
  gatewayTransactionId: String,
  gatewayStatus: String,
  currency: {
    type: String,
    default: 'USD'
  },
  exchangeRate: {
    type: Number,
    default: 1
  },
  notes: String,
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'completed'
  },
  refundAmount: {
    type: Number,
    default: 0
  },
  refundDate: Date,
  refundReason: String,
  refundedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Payment', PaymentSchema);