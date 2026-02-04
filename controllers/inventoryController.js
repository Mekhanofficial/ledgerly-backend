const InventoryTransaction = require('../models/InventoryTransaction');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get stock adjustments
// @route   GET /api/v1/inventory/stock-adjustments
// @access  Private
exports.getStockAdjustments = asyncHandler(async (req, res, next) => {
  const { productId, type, page = 1, limit = 50 } = req.query;
  const query = { business: req.user.business };

  if (productId) {
    query.product = productId;
  }
  if (type) {
    query.type = type;
  }

  const adjustments = await InventoryTransaction.find(query)
    .populate('product', 'name sku')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await InventoryTransaction.countDocuments(query);

  res.status(200).json({
    success: true,
    total,
    pages: Math.ceil(total / limit),
    data: adjustments
  });
});
