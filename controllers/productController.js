const Product = require('../models/Product');
const Category = require('../models/Category');
const Supplier = require('../models/Supplier');
const InventoryTransaction = require('../models/InventoryTransaction');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get all products
// @route   GET /api/v1/products
// @access  Private
exports.getProducts = asyncHandler(async (req, res, next) => {
  const {
    search,
    category,
    isActive,
    lowStock,
    page = 1,
    limit = 20
  } = req.query;
  
  const parsedLimit = parseInt(limit, 10) || 20;
  const parsedPage = parseInt(page, 10) || 1;
  const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  let query = { business: req.user.business };
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }
  
  if (category) query.category = category;
  if (isActive !== undefined) query.isActive = isActive === 'true';
  
  if (lowStock === 'true') {
    query.$expr = {
      $lte: [
        { $ifNull: ['$stock.available', { $ifNull: ['$stock.quantity', 0] }] },
        { $ifNull: ['$stock.lowStockThreshold', 10] }
      ]
    };
  }
  
  let products = await Product.find(query)
    .populate('category', 'name')
    .populate('supplier', 'name')
    // Use indexed _id sort to avoid Mongo in-memory sort failures on large product docs.
    .sort({ _id: -1 })
    .skip((parsedPage - 1) * parsedLimit)
    .limit(parsedLimit)
    .lean();
    
  let total = await Product.countDocuments(query);

  // Legacy safety net: older product records may be missing the `business` field.
  // If primary query returns nothing, attempt a scoped recovery for this user and
  // backfill `business` so future requests use the normal path.
  if (!products.length && req.user?.business) {
    const [businessCategories, businessSuppliers] = await Promise.all([
      Category.find({ business: req.user.business }).select('_id').lean(),
      Supplier.find({ business: req.user.business }).select('_id').lean()
    ]);

    const categoryIds = businessCategories.map((entry) => entry._id);
    const supplierIds = businessSuppliers.map((entry) => entry._id);
    const ownershipSelectors = [];

    if (req.user?.id) {
      ownershipSelectors.push({ createdBy: req.user.id });
    }
    if (categoryIds.length) {
      ownershipSelectors.push({ category: { $in: categoryIds } });
    }
    if (supplierIds.length) {
      ownershipSelectors.push({ supplier: { $in: supplierIds } });
    }

    if (ownershipSelectors.length) {
      const legacyBusinessScope = {
        $and: [
          { $or: [{ business: { $exists: false } }, { business: null }] },
          { $or: ownershipSelectors }
        ]
      };

      const legacyFilters = [legacyBusinessScope];
      if (search) {
        legacyFilters.push({
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { sku: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
          ]
        });
      }
      if (category) legacyFilters.push({ category });
      if (isActive !== undefined) legacyFilters.push({ isActive: isActive === 'true' });
      if (lowStock === 'true') {
        legacyFilters.push({
          $expr: {
            $lte: [
              { $ifNull: ['$stock.available', { $ifNull: ['$stock.quantity', 0] }] },
              { $ifNull: ['$stock.lowStockThreshold', 10] }
            ]
          }
        });
      }

      const legacyQuery = { $and: legacyFilters };
      const legacyCount = await Product.countDocuments(legacyQuery);

      if (legacyCount > 0) {
        // Backfill all scoped legacy rows, then re-run the standard business query.
        await Product.updateMany(legacyBusinessScope, { $set: { business: req.user.business } });

        products = await Product.find(query)
          .populate('category', 'name')
          .populate('supplier', 'name')
          .sort({ _id: -1 })
          .skip((parsedPage - 1) * parsedLimit)
          .limit(parsedLimit)
          .lean();

        total = await Product.countDocuments(query);
      }
    }
  }
  
  // Calculate total inventory value
  const inventoryValue = products.reduce((total, product) => {
    const stockQuantity = toNumber(product?.stock?.quantity ?? product?.quantity ?? 0);
    const unitCost = toNumber(product?.costPrice ?? product?.sellingPrice ?? product?.price ?? 0);
    return total + (stockQuantity * unitCost);
  }, 0);
  
  res.status(200).json({
    success: true,
    count: products.length,
    total,
    pages: Math.ceil(total / parsedLimit),
    inventoryValue,
    data: products
  });
});

// @desc    Get single product
// @route   GET /api/v1/products/:id
// @access  Private
exports.getProduct = asyncHandler(async (req, res, next) => {
  const product = await Product.findOne({
    _id: req.params.id,
    business: req.user.business
  })
    .populate('category', 'name')
    .populate('supplier', 'name');
  
  if (!product) {
    return next(new ErrorResponse(`Product not found with id ${req.params.id}`, 404));
  }
  
  // Get recent transactions
  const transactions = await InventoryTransaction.find({
    product: req.params.id,
    business: req.user.business
  })
    .sort({ createdAt: -1 })
    .limit(20);
    
  res.status(200).json({
    success: true,
    data: {
      product,
      transactions
    }
  });
});

// @desc    Create product
// @route   POST /api/v1/products
// @access  Private
exports.createProduct = asyncHandler(async (req, res, next) => {
  req.body.business = req.user.business;
  req.body.createdBy = req.user.id;
  
  // Generate SKU if not provided
  if (!req.body.sku) {
    const lastProduct = await Product.findOne({
      business: req.user.business
    }).sort({ createdAt: -1 });
    
    let lastNumber = 0;
    if (lastProduct && lastProduct.sku) {
      const matches = lastProduct.sku.match(/\d+/);
      if (matches) lastNumber = parseInt(matches[0]);
    }
    
    req.body.sku = `PROD-${String(lastNumber + 1).padStart(5, '0')}`;
  }
  
  const product = await Product.create(req.body);

  if (req.body.category) {
    await Category.findByIdAndUpdate(req.body.category, {
      $inc: { productCount: 1 },
      $set: { updatedBy: req.user.id }
    });
  }

  if (req.body.supplier) {
    await Supplier.findByIdAndUpdate(req.body.supplier, {
      $addToSet: { products: product._id },
      $set: { updatedBy: req.user.id }
    });
  }
  
  // Create initial inventory transaction
  if (req.body.stock && req.body.stock.quantity > 0) {
    await InventoryTransaction.create({
      business: req.user.business,
      product: product._id,
      type: 'purchase',
      quantity: req.body.stock.quantity,
      unitCost: req.body.costPrice,
      totalCost: req.body.stock.quantity * req.body.costPrice,
      reference: 'Initial Stock',
      notes: 'Initial product creation',
      reason: 'Initial inventory',
      previousStock: 0,
      newStock: req.body.stock.quantity,
      user: req.user.name || req.user.email || 'System',
      createdBy: req.user.id
    });
  }
  
  res.status(201).json({
    success: true,
    data: product
  });
});

// @desc    Update product
// @route   PUT /api/v1/products/:id
// @access  Private
exports.updateProduct = asyncHandler(async (req, res, next) => {
  let product = await Product.findOne({
    _id: req.params.id,
    business: req.user.business
  });
  
  if (!product) {
    return next(new ErrorResponse(`Product not found with id ${req.params.id}`, 404));
  }

  const previousCategory = product.category ? product.category.toString() : null;
  const previousSupplier = product.supplier ? product.supplier.toString() : null;

  req.body.updatedBy = req.user.id;

  product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  const updatedCategory = product.category ? product.category.toString() : null;
  const updatedSupplier = product.supplier ? product.supplier.toString() : null;

  if (updatedCategory && updatedCategory !== previousCategory) {
    await Category.findByIdAndUpdate(updatedCategory, {
      $inc: { productCount: 1 },
      $set: { updatedBy: req.user.id }
    });
  }

  if (previousCategory && previousCategory !== updatedCategory) {
    await Category.findByIdAndUpdate(previousCategory, {
      $inc: { productCount: -1 },
      $set: { updatedBy: req.user.id }
    });
  }

  if (updatedSupplier && updatedSupplier !== previousSupplier) {
    await Supplier.findByIdAndUpdate(updatedSupplier, {
      $addToSet: { products: product._id },
      $set: { updatedBy: req.user.id }
    });
  }

  if (previousSupplier && previousSupplier !== updatedSupplier) {
    await Supplier.findByIdAndUpdate(previousSupplier, {
      $pull: { products: product._id },
      $set: { updatedBy: req.user.id }
    });
  }

  res.status(200).json({
    success: true,
    data: product
  });
});

// @desc    Adjust product stock
// @route   POST /api/v1/products/:id/adjust-stock
// @access  Private
exports.adjustStock = asyncHandler(async (req, res, next) => {
  const { quantity, reason, notes, location } = req.body;
  
  const product = await Product.findOne({
    _id: req.params.id,
    business: req.user.business
  });
  
  if (!product) {
    return next(new ErrorResponse(`Product not found with id ${req.params.id}`, 404));
  }
  
  if (!product.trackInventory) {
    return next(new ErrorResponse('Inventory tracking is disabled for this product', 400));
  }

  const rawType = req.body.type;
  const typeMap = {
    Restock: 'purchase',
    Sale: 'sale',
    Return: 'return',
    Damage: 'damage',
    'Adjustment (Increase)': 'adjustment',
    'Adjustment (Decrease)': 'adjustment'
  };
  const allowedTypes = new Set([
    'purchase',
    'sale',
    'return',
    'adjustment',
    'damage',
    'transfer_in',
    'transfer_out',
    'sale_reserved',
    'sale_completed',
    'sale_cancelled'
  ]);
  let normalizedType = 'adjustment';
  if (rawType) {
    const mapped = typeMap[rawType] || (typeof rawType === 'string' ? rawType.toLowerCase() : null);
    if (mapped && allowedTypes.has(mapped)) {
      normalizedType = mapped;
    }
  }
  
  const previousStock = product.stock.quantity;
  const newQuantity = Math.max(0, previousStock + quantity);
  
  product.stock.quantity = newQuantity;
  product.stock.available = newQuantity - product.stock.reserved;
  product.updatedBy = req.user.id;
  await product.save();
  
  const transaction = await InventoryTransaction.create({
    business: req.user.business,
    product: product._id,
    type: normalizedType,
    quantity,
    reference: 'Manual Adjustment',
    notes: `${reason || 'Adjustment'}${notes ? ` | ${notes}` : ''}`,
    reason: reason || 'Inventory adjustment',
    previousStock,
    newStock: newQuantity,
    user: req.body.user || req.user.name || req.user.email || 'System',
    location,
    createdBy: req.user.id
  });
  
  res.status(200).json({
    success: true,
    message: `Stock adjusted by ${quantity}. New quantity: ${product.stock.quantity}`,
    data: {
      product,
      transaction
    }
  });
});

// @desc    Get low stock products
// @route   GET /api/v1/products/low-stock
// @access  Private
exports.getLowStockProducts = asyncHandler(async (req, res, next) => {
  const products = await Product.find({
    business: req.user.business,
    isActive: true,
    trackInventory: true,
    alertOnLowStock: true,
    $expr: {
      $lte: ['$stock.available', '$stock.lowStockThreshold']
    }
  })
    .populate('supplier', 'name email phone')
    .sort({ 'stock.available': 1 });
    
  res.status(200).json({
    success: true,
    count: products.length,
    data: products
  });
});
