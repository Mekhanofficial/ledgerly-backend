const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get all suppliers
// @route   GET /api/v1/suppliers
// @access  Private
exports.getSuppliers = asyncHandler(async (req, res, next) => {
  const { search, page = 1, limit = 50, isActive } = req.query;
  const query = { business: req.user.business };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { contact: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }
  if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }

  const suppliers = await Supplier.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Supplier.countDocuments(query);

  res.status(200).json({
    success: true,
    total,
    pages: Math.ceil(total / limit),
    data: suppliers
  });
});

// @desc    Create supplier
// @route   POST /api/v1/suppliers
// @access  Private
exports.createSupplier = asyncHandler(async (req, res, next) => {
  req.body.business = req.user.business;
  req.body.createdBy = req.user.id;
  req.body.updatedBy = req.user.id;
  const supplier = await Supplier.create(req.body);
  res.status(201).json({ success: true, data: supplier });
});

// @desc    Update supplier
// @route   PUT /api/v1/suppliers/:id
// @access  Private
exports.updateSupplier = asyncHandler(async (req, res, next) => {
  let supplier = await Supplier.findOne({
    _id: req.params.id,
    business: req.user.business
  });

  if (!supplier) {
    return next(new ErrorResponse(`Supplier not found with id ${req.params.id}`, 404));
  }

  req.body.updatedBy = req.user.id;
  supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({ success: true, data: supplier });
});

// @desc    Delete supplier
// @route   DELETE /api/v1/suppliers/:id
// @access  Private
exports.deleteSupplier = asyncHandler(async (req, res, next) => {
  const supplier = await Supplier.findOne({
    _id: req.params.id,
    business: req.user.business
  });

  if (!supplier) {
    return next(new ErrorResponse(`Supplier not found with id ${req.params.id}`, 404));
  }

  const linkedProducts = await Product.countDocuments({
    business: req.user.business,
    supplier: req.params.id
  });

  if (linkedProducts > 0) {
    return next(new ErrorResponse('Cannot delete supplier with linked products', 400));
  }

  await supplier.remove();
  res.status(200).json({ success: true, data: {} });
});
