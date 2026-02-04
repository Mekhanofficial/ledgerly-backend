const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  sku: {
    type: String,
    required: [true, 'Please add a SKU'],
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Please add product name'],
    trim: true
  },
  description: String,
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  },
  type: {
    type: String,
    enum: ['product', 'service', 'digital'],
    default: 'product'
  },
  barcode: String,
  unit: {
    type: String,
    default: 'pcs'
  },
  costPrice: {
    type: Number,
    default: 0,
    min: 0
  },
  sellingPrice: {
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
  images: [{
    url: String,
    altText: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  stock: {
    quantity: {
      type: Number,
      default: 0,
      min: 0
    },
    reserved: {
      type: Number,
      default: 0,
      min: 0
    },
    available: {
      type: Number,
      default: 0,
      min: 0
    },
    lowStockThreshold: {
      type: Number,
      default: 10
    },
    reorderPoint: {
      type: Number,
      default: 5
    },
    location: String
  },
  variants: [{
    name: String,
    options: [String],
    priceAdjustment: Number
  }],
  attributes: {
    type: Map,
    of: String
  },
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
    weight: Number,
    unit: {
      type: String,
      default: 'cm'
    }
  },
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier'
  },
  supplierCode: String,
  minOrderQuantity: {
    type: Number,
    default: 1
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isTaxable: {
    type: Boolean,
    default: true
  },
  trackInventory: {
    type: Boolean,
    default: true
  },
  alertOnLowStock: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
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

// Calculate available stock before save
ProductSchema.pre('save', function(next) {
  this.stock.available = this.stock.quantity - this.stock.reserved;
  this.updatedAt = Date.now();
  next();
});

// Check low stock
ProductSchema.methods.isLowStock = function() {
  return this.trackInventory && 
         this.alertOnLowStock && 
         this.stock.available <= this.stock.lowStockThreshold;
};

ProductSchema.index({ business: 1, sku: 1 }, { unique: true });
ProductSchema.index({ business: 1, name: 'text', description: 'text', sku: 'text' });
ProductSchema.index({ business: 1, category: 1 });
ProductSchema.index({ business: 1, isActive: 1 });

module.exports = mongoose.model('Product', ProductSchema);
