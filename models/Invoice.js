const crypto = require('crypto');
const mongoose = require('mongoose');
const { calculateInvoiceTotals, toNumber } = require('../utils/invoiceCalculator');

const InvoiceSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  invoiceNumber: {
    type: String,
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  clientEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  dueDate: {
    type: Date,
    required: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    sku: String,
    description: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.01
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    taxRate: {
      type: Number,
      default: 0
    },
    discount: {
      type: Number,
      default: 0
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'fixed'
    },
    taxAmount: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      required: true
    }
  }],
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  discount: {
    amount: {
      type: Number,
      default: 0
    },
    percentage: {
      type: Number,
      default: 0
    },
    type: {
      type: String,
      enum: ['percentage', 'fixed'],
      default: 'fixed'
    },
    description: String
  },
  tax: {
    amount: {
      type: Number,
      default: 0
    },
    percentage: {
      type: Number,
      default: 0
    },
    description: String
  },
  taxName: {
    type: String,
    default: 'VAT'
  },
  taxRateUsed: {
    type: Number,
    default: 0
  },
  taxAmount: {
    type: Number,
    default: 0
  },
  isTaxOverridden: {
    type: Boolean,
    default: false
  },
  shipping: {
    amount: {
      type: Number,
      default: 0
    },
    description: String
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  amountPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  balance: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'cancelled', 'void'],
    default: 'draft'
  },
  paymentTerms: String,
  notes: String,
  terms: String,
  templateStyle: {
    type: String,
    trim: true,
    default: 'standard'
  },
  emailSubject: {
    type: String,
    trim: true
  },
  emailMessage: {
    type: String,
    trim: true
  },
  footerNotes: String,
  sentDate: Date,
  viewedDate: Date,
  paidDate: Date,
  currency: {
    type: String,
    default: 'USD',
    uppercase: true
  },
  exchangeRate: {
    type: Number,
    default: 1
  },
  recurring: {
    isRecurring: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'completed'],
      default: 'active'
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']
    },
    interval: {
      type: Number,
      default: 1
    },
    startDate: Date,
    endDate: Date,
    nextInvoiceDate: Date,
    totalCycles: Number,
    completedCycles: {
      type: Number,
      default: 0
    },
    parentInvoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice'
    }
  },
  paymentMethod: String,
  paymentReference: String,
  paymentGateway: String,
  paymentGatewayId: String,
  paymentGatewayStatus: String,
  lateFeeApplied: {
    type: Boolean,
    default: false
  },
  lateFeeAmount: {
    type: Number,
    default: 0
  },
  remindersSent: {
    type: Number,
    default: 0
  },
  lastReminderSent: Date,
  publicSlug: {
    type: String,
    sparse: true
  },
  publicAccessEnabled: {
    type: Boolean,
    default: true
  },
  paymentLinkSentAt: Date,
  transactionReference: String,
  transactionAmount: Number,
  transactionCurrency: String,
  paymentInitializedAt: Date,
  paymentVerifiedAt: Date,
  paymentVerificationSource: String,
  paymentConfirmationEmailsSentAt: Date,
  lastPaymentEventType: String,
  isEstimate: {
    type: Boolean,
    default: false
  },
  estimateNumber: String,
  convertedFromEstimate: {
    type: Boolean,
    default: false
  },
  parentEstimate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  },
  attachments: [{
    name: String,
    url: String,
    type: String
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Generate invoice number before save
InvoiceSchema.pre('save', async function(next) {
  if (!this.publicSlug) {
    this.publicSlug = `inv_${crypto.randomBytes(8).toString('hex')}`;
  }

  if (!this.invoiceNumber && !this.isEstimate) {
    const business = await mongoose.model('Business').findById(this.business);
    const invoiceNumber = await business.getNextInvoiceNumber();
    this.invoiceNumber = invoiceNumber;
  }
  
  if (this.isEstimate && !this.estimateNumber) {
    const business = await mongoose.model('Business').findById(this.business);
    const lastEstimate = await this.constructor.findOne({
      business: this.business,
      isEstimate: true
    }).sort({ createdAt: -1 });
    
    let lastNumber = 0;
    if (lastEstimate && lastEstimate.estimateNumber) {
      const matches = lastEstimate.estimateNumber.match(/\d+/);
      if (matches) lastNumber = parseInt(matches[0]);
    }
    
    this.estimateNumber = `EST-${String(lastNumber + 1).padStart(5, '0')}`;
  }
  
  const computed = calculateInvoiceTotals({
    items: this.items,
    discount: this.discount,
    shipping: this.shipping,
    taxRateUsed: this.taxRateUsed ?? this.tax?.percentage ?? 0,
    taxAmountOverride: this.isTaxOverridden ? this.taxAmount ?? this.tax?.amount : null,
    isTaxOverridden: Boolean(this.isTaxOverridden),
    amountPaid: this.amountPaid
  });

  this.items = computed.items;
  this.subtotal = computed.subtotal;
  this.taxRateUsed = toNumber(this.taxRateUsed ?? computed.taxRateUsed, computed.taxRateUsed);
  this.taxAmount = computed.taxAmount;
  this.tax = {
    ...(this.tax || {}),
    amount: computed.taxAmount,
    percentage: this.taxRateUsed,
    description: this.taxName || this.tax?.description
  };
  this.total = computed.total;
  this.balance = computed.balance;
  
  // Update status
  if (this.status !== 'cancelled' && this.status !== 'void') {
    if (this.balance <= 0 && this.amountPaid > 0) {
      this.status = 'paid';
      this.paidDate = new Date();
    } else if (this.balance > 0 && this.balance < this.total) {
      this.status = 'partial';
    } else if (this.balance === this.total) {
      if (this.sentDate) {
        this.status = 'sent';
      } else {
        this.status = 'draft';
      }
    }
    
    // Check if overdue
    if (this.status === 'sent' || this.status === 'partial') {
      if (new Date() > this.dueDate) {
        this.status = 'overdue';
      }
    }
  }
  
  next();
});

// Virtual for aging
InvoiceSchema.virtual('aging').get(function() {
  if (this.status === 'paid' || this.status === 'cancelled' || this.status === 'void') {
    return 0;
  }
  
  const now = new Date();
  const dueDate = new Date(this.dueDate);
  const diffTime = Math.abs(now - dueDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
});

// Method to send invoice
InvoiceSchema.methods.send = async function() {
  this.status = 'sent';
  this.sentDate = new Date();
  return this.save();
};

// Method to record payment
InvoiceSchema.methods.recordPayment = async function(amount, paymentData = {}) {
  this.amountPaid += amount;
  this.balance = this.total - this.amountPaid;
  
  if (this.balance <= 0) {
    this.status = 'paid';
    this.paidDate = new Date();
  } else if (this.balance < this.total) {
    this.status = 'partial';
  }
  
  // Update payment data if provided
  if (paymentData.paymentMethod) {
    this.paymentMethod = paymentData.paymentMethod;
  }
  if (paymentData.paymentReference) {
    this.paymentReference = paymentData.paymentReference;
  }
  if (paymentData.paymentGateway) {
    this.paymentGateway = paymentData.paymentGateway;
  }
  
  return this.save();
};

InvoiceSchema.index({ business: 1, invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ business: 1, customer: 1 });
InvoiceSchema.index({ business: 1, status: 1 });
InvoiceSchema.index({ business: 1, date: -1 });
InvoiceSchema.index({ business: 1, dueDate: 1 });
InvoiceSchema.index({ business: 1, 'recurring.nextInvoiceDate': 1 });
InvoiceSchema.index({ publicSlug: 1 }, { unique: true, sparse: true });
InvoiceSchema.index({ business: 1, transactionReference: 1 });

module.exports = mongoose.model('Invoice', InvoiceSchema);
