const mongoose = require('mongoose');

const InventoryTransactionSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  type: {
    type: String,
    enum: [
      'purchase', 'sale', 'return', 'adjustment', 
      'damage', 'transfer_in', 'transfer_out',
      'sale_reserved', 'sale_completed', 'sale_cancelled'
    ],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  unitCost: Number,
  totalCost: Number,
  reference: String, // Invoice/Receipt number
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'referenceModel'
  },
  referenceModel: {
    type: String,
    enum: ['Invoice', 'Receipt', 'PurchaseOrder', 'Adjustment']
  },
  location: String,
  notes: String,
  reason: String,
  previousStock: {
    type: Number,
    default: 0
  },
  newStock: {
    type: Number,
    default: 0
  },
  user: {
    type: String,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('InventoryTransaction', InventoryTransactionSchema);
