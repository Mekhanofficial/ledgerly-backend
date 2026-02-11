const mongoose = require('mongoose');

const ReceiptSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  receiptNumber: {
    type: String,
    required: true
  },
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  items: [{
    description: String,
    quantity: Number,
    unitPrice: Number,
    total: Number,
    taxRate: Number,
    taxAmount: Number
  }],
  subtotal: Number,
  tax: {
    amount: Number,
    percentage: Number
  },
  discount: {
    amount: Number,
    percentage: Number
  },
  total: {
    type: Number,
    required: true
  },
  amountPaid: {
    type: Number,
    required: true
  },
  change: {
    type: Number,
    default: 0
  },
  paymentMethod: {
    type: String,
    required: true
  },
  paymentReference: String,
  templateStyle: {
    type: String,
    default: 'standard'
  },
  cashier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isVoid: {
    type: Boolean,
    default: false
  },
  voidReason: String,
  voidedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  voidedAt: Date,
  notes: String,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

ReceiptSchema.pre('save', async function(next) {
  if (!this.receiptNumber) {
    const business = await mongoose.model('Business').findById(this.business);
    this.receiptNumber = await business.getNextReceiptNumber();
  }
  next();
});

ReceiptSchema.index({ business: 1, receiptNumber: 1 }, { unique: true });

module.exports = mongoose.model('Receipt', ReceiptSchema);
