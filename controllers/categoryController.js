const Category = require('../models/Category');
const Product = require('../models/Product');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get all categories
// @route   GET /api/v1/categories
// @access  Private
exports.getCategories = asyncHandler(async (req, res, next) => {
  const { search, page = 1, limit = 50, isActive } = req.query;
  const query = { business: req.user.business };

  if (search) {
    query.name = { $regex: search, $options: 'i' };
  }
  if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }

  const categories = await Category.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const total = await Category.countDocuments(query);

  res.status(200).json({
    success: true,
    total,
    pages: Math.ceil(total / limit),
    data: categories
  });
});

// @desc    Create category
// @route   POST /api/v1/categories
// @access  Private
exports.createCategory = asyncHandler(async (req, res, next) => {
  req.body.business = req.user.business;
  req.body.createdBy = req.user.id;
  req.body.updatedBy = req.user.id;
  const category = await Category.create(req.body);
  res.status(201).json({ success: true, data: category });
});

// @desc    Update category
// @route   PUT /api/v1/categories/:id
// @access  Private
exports.updateCategory = asyncHandler(async (req, res, next) => {
  let category = await Category.findOne({
    _id: req.params.id,
    business: req.user.business
  });

  if (!category) {
    return next(new ErrorResponse(`Category not found with id ${req.params.id}`, 404));
  }

  req.body.updatedBy = req.user.id;
  category = await Category.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({ success: true, data: category });
});

// @desc    Delete category
// @route   DELETE /api/v1/categories/:id
// @access  Private
exports.deleteCategory = asyncHandler(async (req, res, next) => {
  const category = await Category.findOne({
    _id: req.params.id,
    business: req.user.business
  });

  if (!category) {
    return next(new ErrorResponse(`Category not found with id ${req.params.id}`, 404));
  }

  const linkedProducts = await Product.countDocuments({
    business: req.user.business,
    category: req.params.id
  });

  if (linkedProducts > 0) {
    return next(new ErrorResponse('Cannot delete category linked to products', 400));
  }

  await category.remove();
  res.status(200).json({ success: true, data: {} });
});
