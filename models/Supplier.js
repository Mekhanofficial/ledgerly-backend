const mongoose = require('mongoose');

const SupplierSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Please add supplier name'],
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  contact: String,
  phone: {
    type: String,
    trim: true
  },
  website: String,
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  paymentTerms: {
    type: Number,
    default: 30
  },
  currency: {
    type: String,
    default: 'USD'
  },
  notes: String,
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  orderCount: {
    type: Number,
    default: 0
  },
  lastOrderDate: Date,
  isActive: {
    type: Boolean,
    default: true
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

SupplierSchema.index({ business: 1, name: 1 }, { unique: true });
SupplierSchema.index({ business: 1, email: 1 });

module.exports = mongoose.model('Supplier', SupplierSchema);
