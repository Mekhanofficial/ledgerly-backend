const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Please add a category name'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  color: {
    type: String,
    default: '#3B82F6'
  },
  icon: {
    type: String,
    default: '??'
  },
  productCount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalValue: {
    type: Number,
    default: 0,
    min: 0
  },
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

CategorySchema.index({ business: 1, name: 1 }, { unique: true });
CategorySchema.index({ business: 1, isActive: 1 });

module.exports = mongoose.model('Category', CategorySchema);
