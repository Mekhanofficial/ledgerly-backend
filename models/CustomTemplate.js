const mongoose = require('mongoose');

const CustomTemplateSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Please add a template name'],
    trim: true
  },
  description: {
    type: String,
    default: 'Custom invoice template'
  },
  category: {
    type: String,
    default: 'custom'
  },
  previewColor: {
    type: String,
    default: 'bg-gradient-to-br from-primary-500 to-primary-600'
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isFavorite: {
    type: Boolean,
    default: false
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  price: {
    type: Number,
    default: 0
  },
  templateStyle: {
    type: String,
    default: 'standard'
  },
  lineItems: [
    {
      description: String,
      quantity: Number,
      rate: Number,
      tax: Number
    }
  ],
  notes: String,
  terms: String,
  emailSubject: String,
  emailMessage: String,
  currency: String,
  paymentTerms: String
}, {
  timestamps: true
});

CustomTemplateSchema.index({ business: 1, name: 1 });

module.exports = mongoose.model('CustomTemplate', CustomTemplateSchema);
