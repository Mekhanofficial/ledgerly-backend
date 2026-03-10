const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Supplier = require('../models/Supplier');
const InventoryTransaction = require('../models/InventoryTransaction');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const compressImage = require('../utils/compressImage');

const toStockNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeStockPayload = (incomingStock = {}, currentStock = {}) => {
  const normalizedCurrent = currentStock && typeof currentStock === 'object' ? currentStock : {};
  const normalizedIncoming = incomingStock && typeof incomingStock === 'object' ? incomingStock : {};

  const quantity = Math.max(
    0,
    toStockNumber(
      normalizedIncoming.quantity,
      toStockNumber(normalizedCurrent.quantity, 0)
    )
  );
  const reservedRaw = Math.max(
    0,
    toStockNumber(
      normalizedIncoming.reserved,
      toStockNumber(normalizedCurrent.reserved, 0)
    )
  );
  const reserved = Math.min(reservedRaw, quantity);

  return {
    ...normalizedCurrent,
    ...normalizedIncoming,
    quantity,
    reserved,
    available: Math.max(0, quantity - reserved)
  };
};

const parseJsonField = (value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return value;
  }
};

const parseBooleanField = (value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return value;
};

const normalizeProductPayload = (payload) => {
  const normalizedPayload = payload && typeof payload === 'object' ? { ...payload } : {};

  ['stock', 'variants', 'attributes', 'dimensions', 'images'].forEach((field) => {
    if (normalizedPayload[field] !== undefined) {
      normalizedPayload[field] = parseJsonField(normalizedPayload[field]);
    }
  });

  ['isActive', 'isTaxable', 'trackInventory', 'alertOnLowStock'].forEach((field) => {
    if (normalizedPayload[field] !== undefined) {
      normalizedPayload[field] = parseBooleanField(normalizedPayload[field]);
    }
  });

  return normalizedPayload;
};

const normalizeStoredUploadPath = (filePath) => {
  const raw = String(filePath || '').trim();
  if (!raw) return '';

  const normalized = raw
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^\/+/, '');

  const uploadsMatch = normalized.match(/(?:^|\/)(uploads\/.+)$/i);
  if (uploadsMatch?.[1]) {
    return uploadsMatch[1];
  }

  return normalized;
};

const isLocalUploadPath = (filePath) => /^uploads\//i.test(normalizeStoredUploadPath(filePath));

const resolveUploadAbsolutePath = (filePath) => {
  const normalized = normalizeStoredUploadPath(filePath);
  if (!normalized) return '';
  return path.join(__dirname, '..', normalized);
};

const removeFileFromDisk = (filePath) => {
  const absolutePath = resolveUploadAbsolutePath(filePath);
  if (!absolutePath) return;

  fs.promises.unlink(absolutePath).catch((error) => {
    if (error?.code === 'ENOENT') return;
    console.error('Failed to remove product image from disk:', error?.message || error);
  });
};

const getUploadedImage = (req) => {
  if (req.file) return req.file;

  if (req.files && typeof req.files === 'object') {
    if (Array.isArray(req.files.image) && req.files.image[0]) {
      return req.files.image[0];
    }
    if (Array.isArray(req.files.productImage) && req.files.productImage[0]) {
      return req.files.productImage[0];
    }
  }

  return null;
};

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
  req.body = normalizeProductPayload(req.body);
  req.body.business = req.user.business;
  req.body.createdBy = req.user.id;

  const uploadedImage = getUploadedImage(req);
  let uploadedImagePath = '';

  if (uploadedImage?.path) {
    try {
      const compressedPath = await compressImage(uploadedImage.path);
      uploadedImagePath = normalizeStoredUploadPath(compressedPath);
      req.body.images = [{
        url: uploadedImagePath,
        altText: req.body.name || '',
        isPrimary: true
      }];
    } catch (error) {
      removeFileFromDisk(uploadedImage.path);
      throw error;
    }
  }

  let shouldCleanupUploadedImage = Boolean(uploadedImagePath);
  try {
    // Generate SKU if not provided
    if (!req.body.sku) {
      const lastProduct = await Product.findOne({
        business: req.user.business
      }).sort({ createdAt: -1 });

      let lastNumber = 0;
      if (lastProduct && lastProduct.sku) {
        const matches = lastProduct.sku.match(/\d+/);
        if (matches) lastNumber = parseInt(matches[0], 10);
      }

      req.body.sku = `PROD-${String(lastNumber + 1).padStart(5, '0')}`;
    }

    const product = await Product.create(req.body);
    shouldCleanupUploadedImage = false;

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
  } catch (error) {
    if (shouldCleanupUploadedImage && uploadedImagePath) {
      removeFileFromDisk(uploadedImagePath);
    }
    throw error;
  }
});

// @desc    Update product
// @route   PUT /api/v1/products/:id
// @access  Private
exports.updateProduct = asyncHandler(async (req, res, next) => {
  req.body = normalizeProductPayload(req.body);

  let product = await Product.findOne({
    _id: req.params.id,
    business: req.user.business
  });
  
  if (!product) {
    return next(new ErrorResponse(`Product not found with id ${req.params.id}`, 404));
  }

  const previousCategory = product.category ? product.category.toString() : null;
  const previousSupplier = product.supplier ? product.supplier.toString() : null;
  const previousLocalImagePaths = Array.isArray(product.images)
    ? product.images
      .map((image) => image?.url)
      .filter((imagePath) => isLocalUploadPath(imagePath))
    : [];

  const uploadedImage = getUploadedImage(req);
  let uploadedImagePath = '';

  if (uploadedImage?.path) {
    try {
      const compressedPath = await compressImage(uploadedImage.path);
      uploadedImagePath = normalizeStoredUploadPath(compressedPath);
      req.body.images = [{
        url: uploadedImagePath,
        altText: req.body.name || product.name || '',
        isPrimary: true
      }];
    } catch (error) {
      removeFileFromDisk(uploadedImage.path);
      throw error;
    }
  }

  req.body.updatedBy = req.user.id;

  if (req.body.stock && typeof req.body.stock === 'object') {
    const currentStock = product?.stock?.toObject ? product.stock.toObject() : (product.stock || {});
    req.body.stock = normalizeStockPayload(req.body.stock, currentStock);
  }

  let shouldCleanupUploadedImage = Boolean(uploadedImagePath);
  try {
    product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    shouldCleanupUploadedImage = false;

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

    if (uploadedImagePath) {
      previousLocalImagePaths
        .filter((imagePath) => imagePath && imagePath !== uploadedImagePath)
        .forEach((imagePath) => removeFileFromDisk(imagePath));
    }

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    if (shouldCleanupUploadedImage && uploadedImagePath) {
      removeFileFromDisk(uploadedImagePath);
    }
    throw error;
  }
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
