const mongoose = require('mongoose');

const toTitleCase = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase()
  .replace(/(^|[\s'-])[a-z]/g, (chunk) => chunk.toUpperCase());

const normalizeCustomerUpdatePayload = (payload = {}) => {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (typeof payload.name === 'string') {
    payload.name = toTitleCase(payload.name);
  }

  return payload;
};

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
  assignedTo: {
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
  if (this.isModified('name')) {
    this.name = toTitleCase(this.name);
  }

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

CustomerSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate() || {};
  normalizeCustomerUpdatePayload(update);
  normalizeCustomerUpdatePayload(update.$set);
  this.setUpdate(update);
  next();
});

// Update stats when invoice is created/updated/deleted
CustomerSchema.statics.updateCustomerStats = async function(customerId) {
  const Invoice = mongoose.model('Invoice');

  if (!customerId || !mongoose.isValidObjectId(customerId)) {
    return null;
  }

  const resolvedCustomerId = new mongoose.Types.ObjectId(String(customerId));
  const [summary] = await Invoice.aggregate([
    {
      $match: {
        customer: resolvedCustomerId
      }
    },
    {
      $group: {
        _id: '$customer',
        totalInvoiced: { $sum: '$total' },
        totalPaid: { $sum: '$amountPaid' },
        outstandingBalance: { $sum: '$balance' }
      }
    }
  ]);

  await this.findByIdAndUpdate(customerId, {
    totalInvoiced: summary?.totalInvoiced || 0,
    totalPaid: summary?.totalPaid || 0,
    outstandingBalance: summary?.outstandingBalance || 0,
    totalSpent: summary?.totalPaid || 0
  });
};

CustomerSchema.index({ business: 1, email: 1 }, { unique: true, sparse: true });
CustomerSchema.index({ business: 1, phone: 1 }, { unique: true, sparse: true });
CustomerSchema.index({ business: 1, customerId: 1 }, { unique: true });
CustomerSchema.index({ business: 1, name: 'text', email: 'text', phone: 'text' });

module.exports = mongoose.model('Customer', CustomerSchema);
