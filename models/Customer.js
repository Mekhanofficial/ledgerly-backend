const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  customerId: {
    type: String,
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Please add customer name'],
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  phone: {
    type: String,
    trim: true
  },
  mobile: {
    type: String,
    trim: true
  },
  company: String,
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String
  },
  shippingAddress: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String
  },
  taxId: String,
  customerType: {
    type: String,
    enum: ['individual', 'business', 'government'],
    default: 'individual'
  },
  currency: {
    type: String,
    default: 'USD'
  },
  paymentTerms: {
    type: Number,
    default: 30
  },
  creditLimit: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },
  totalInvoiced: {
    type: Number,
    default: 0
  },
  totalPaid: {
    type: Number,
    default: 0
  },
  outstandingBalance: {
    type: Number,
    default: 0
  },
  lastPurchaseDate: Date,
  firstPurchaseDate: Date,
  notes: String,
  tags: [String],
  isActive: {
    type: Boolean,
    default: true
  },
  customFields: {
    type: Map,
    of: String
  },
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

// Generate customer ID before save
CustomerSchema.pre('save', async function(next) {
  if (!this.customerId) {
    const business = await mongoose.model('Business').findById(this.business);
    const lastCustomer = await this.constructor.findOne({
      business: this.business
    }).sort({ createdAt: -1 });
    
    let lastNumber = 0;
    if (lastCustomer && lastCustomer.customerId) {
      const matches = lastCustomer.customerId.match(/\d+/);
      if (matches) lastNumber = parseInt(matches[0]);
    }
    
    this.customerId = `CUST-${String(lastNumber + 1).padStart(5, '0')}`;
  }
  next();
});

// Update stats when invoice is created/updated/deleted
CustomerSchema.statics.updateCustomerStats = async function(customerId) {
  const Invoice = mongoose.model('Invoice');
  
  const invoices = await Invoice.find({ customer: customerId });
  
  let totalInvoiced = 0;
  let totalPaid = 0;
  let outstandingBalance = 0;
  
  invoices.forEach(invoice => {
    totalInvoiced += invoice.total;
    totalPaid += invoice.amountPaid;
    outstandingBalance += invoice.balance;
  });
  
  await this.findByIdAndUpdate(customerId, {
    totalInvoiced,
    totalPaid,
    outstandingBalance,
    totalSpent: totalPaid
  });
};

CustomerSchema.index({ business: 1, email: 1 }, { unique: true, sparse: true });
CustomerSchema.index({ business: 1, phone: 1 }, { unique: true, sparse: true });
CustomerSchema.index({ business: 1, customerId: 1 }, { unique: true });
CustomerSchema.index({ business: 1, name: 'text', email: 'text', phone: 'text' });

module.exports = mongoose.model('Customer', CustomerSchema);
