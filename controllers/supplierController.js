const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get all suppliers
// @route   GET /api/v1/suppliers
// @access  Private
exports.getSuppliers = asyncHandler(async (req, res, next) => {
  const { search, page = 1, limit = 50, isActive } = req.query;
  const query = { business: req.user.business };
  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.max(parseInt(limit, 10) || 50, 1);

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
    .skip((parsedPage - 1) * parsedLimit)
    .limit(parsedLimit)
    .lean();

  const total = await Supplier.countDocuments(query);
  const supplierIds = suppliers.map((supplier) => supplier._id).filter(Boolean);

  let enrichedSuppliers = suppliers;

  if (supplierIds.length > 0) {
    const [productStats, orderStats] = await Promise.all([
      Product.aggregate([
        {
          $match: {
            business: req.user.business,
            supplier: { $in: supplierIds },
            isActive: { $ne: false }
          }
        },
        {
          $group: {
            _id: '$supplier',
            productCount: { $sum: 1 }
          }
        }
      ]),
      Invoice.aggregate([
        {
          $match: {
            business: req.user.business,
            isEstimate: { $ne: true },
            status: { $nin: ['draft', 'cancelled', 'void'] }
          }
        },
        { $unwind: '$items' },
        {
          $match: {
            'items.product': { $exists: true, $ne: null }
          }
        },
        {
          $lookup: {
            from: 'products',
            localField: 'items.product',
            foreignField: '_id',
            as: 'product'
          }
        },
        { $unwind: '$product' },
        {
          $match: {
            'product.supplier': { $in: supplierIds }
          }
        },
        {
          $group: {
            _id: {
              supplier: '$product.supplier',
              invoice: '$_id'
            },
            orderDate: {
              $max: {
                $ifNull: ['$date', '$createdAt']
              }
            }
          }
        },
        {
          $group: {
            _id: '$_id.supplier',
            orderCount: { $sum: 1 },
            lastOrderDate: { $max: '$orderDate' }
          }
        }
      ])
    ]);

    const productStatsBySupplier = new Map(
      productStats.map((entry) => [String(entry._id), entry])
    );
    const orderStatsBySupplier = new Map(
      orderStats.map((entry) => [String(entry._id), entry])
    );

    enrichedSuppliers = suppliers.map((supplier) => {
      const supplierId = String(supplier._id);
      const productStat = productStatsBySupplier.get(supplierId);
      const orderStat = orderStatsBySupplier.get(supplierId);

      return {
        ...supplier,
        productCount: productStat?.productCount ?? 0,
        orderCount: orderStat?.orderCount ?? supplier.orderCount ?? 0,
        lastOrderDate: orderStat?.lastOrderDate ?? supplier.lastOrderDate ?? null
      };
    });
  }

  res.status(200).json({
    success: true,
    total,
    pages: Math.ceil(total / parsedLimit),
    data: enrichedSuppliers
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
