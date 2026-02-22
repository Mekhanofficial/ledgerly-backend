const User = require('../models/User');
const Business = require('../models/Business');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Receipt = require('../models/Receipt');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const { normalizeRole, isRoleSupported } = require('../utils/rolePermissions');

const buildSearchFilter = (search, fields) => {
  if (!search) return null;
  const regex = { $regex: search, $options: 'i' };
  return { $or: fields.map((field) => ({ [field]: regex })) };
};

// @desc    Super admin overview
// @route   GET /api/v1/super-admin/overview
// @access  Private (Super Admin)
exports.getOverview = asyncHandler(async (req, res) => {
  const [users, businesses, invoices, payments, customers, products, receipts] = await Promise.all([
    User.countDocuments(),
    Business.countDocuments(),
    Invoice.countDocuments(),
    Payment.countDocuments(),
    Customer.countDocuments(),
    Product.countDocuments(),
    Receipt.countDocuments()
  ]);

  res.status(200).json({
    success: true,
    data: {
      users,
      businesses,
      invoices,
      payments,
      customers,
      products,
      receipts
    }
  });
});

// @desc    Get all users
// @route   GET /api/v1/super-admin/users
// @access  Private (Super Admin)
exports.getUsers = asyncHandler(async (req, res) => {
  const { search, role, page = 1, limit = 50 } = req.query;
  const query = {};

  const searchFilter = buildSearchFilter(search, ['name', 'email']);
  if (searchFilter) {
    query.$and = query.$and || [];
    query.$and.push(searchFilter);
  }

  if (role) {
    query.role = normalizeRole(role);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const users = await User.find(query)
    .select('-password -resetPasswordToken -invitationToken -invitationExpire')
    .populate('business', 'name email')
    .populate('customer', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const total = await User.countDocuments(query);

  res.status(200).json({
    success: true,
    count: users.length,
    total,
    pages: Math.ceil(total / limit),
    data: users
  });
});

// @desc    Update user (super admin)
// @route   PUT /api/v1/super-admin/users/:id
// @access  Private (Super Admin)
exports.updateUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (req.body.role) {
    const normalizedRole = normalizeRole(req.body.role);
    if (!isRoleSupported(normalizedRole)) {
      return next(new ErrorResponse('Invalid role provided', 400));
    }
    user.role = normalizedRole;
  }

  if (req.body.isActive !== undefined) {
    user.isActive = req.body.isActive;
  }

  if (req.body.businessId) {
    user.business = req.body.businessId;
  }

  if (req.body.customerId !== undefined) {
    user.customer = req.body.customerId || undefined;
  }

  if (req.body.permissions) {
    user.permissions = {
      ...user.permissions,
      ...req.body.permissions
    };
  }

  await user.save();

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Get all businesses
// @route   GET /api/v1/super-admin/businesses
// @access  Private (Super Admin)
exports.getBusinesses = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const query = {};

  const searchFilter = buildSearchFilter(search, ['name', 'email', 'phone']);
  if (searchFilter) {
    query.$and = query.$and || [];
    query.$and.push(searchFilter);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const businesses = await Business.find(query)
    .populate('owner', 'name email role')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const total = await Business.countDocuments(query);

  res.status(200).json({
    success: true,
    count: businesses.length,
    total,
    pages: Math.ceil(total / limit),
    data: businesses
  });
});

// @desc    Update business (super admin)
// @route   PUT /api/v1/super-admin/businesses/:id
// @access  Private (Super Admin)
exports.updateBusiness = asyncHandler(async (req, res, next) => {
  const business = await Business.findById(req.params.id);

  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  if (req.body.isActive !== undefined) {
    business.isActive = req.body.isActive;
  }

  if (req.body.name) business.name = req.body.name;
  if (req.body.email) business.email = req.body.email;
  if (req.body.phone) business.phone = req.body.phone;

  if (req.body.subscription) {
    business.subscription = {
      ...business.subscription,
      ...req.body.subscription
    };
  }

  await business.save();

  res.status(200).json({
    success: true,
    data: business
  });
});

// @desc    Get all invoices
// @route   GET /api/v1/super-admin/invoices
// @access  Private (Super Admin)
exports.getInvoices = asyncHandler(async (req, res) => {
  const { search, status, page = 1, limit = 50 } = req.query;
  const query = {};

  const searchFilter = buildSearchFilter(search, ['invoiceNumber', 'status']);
  if (searchFilter) {
    query.$and = query.$and || [];
    query.$and.push(searchFilter);
  }

  if (status) {
    query.status = status;
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const invoices = await Invoice.find(query)
    .populate('business', 'name email')
    .populate('customer', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const total = await Invoice.countDocuments(query);

  res.status(200).json({
    success: true,
    count: invoices.length,
    total,
    pages: Math.ceil(total / limit),
    data: invoices
  });
});

// @desc    Get all payments
// @route   GET /api/v1/super-admin/payments
// @access  Private (Super Admin)
exports.getPayments = asyncHandler(async (req, res) => {
  const { search, status, page = 1, limit = 50 } = req.query;
  const query = {};

  const searchFilter = buildSearchFilter(search, ['paymentMethod', 'paymentReference', 'status']);
  if (searchFilter) {
    query.$and = query.$and || [];
    query.$and.push(searchFilter);
  }

  if (status) {
    query.status = status;
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const payments = await Payment.find(query)
    .populate('business', 'name email')
    .populate('customer', 'name email')
    .populate('invoice', 'invoiceNumber')
    .sort({ paymentDate: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const total = await Payment.countDocuments(query);

  res.status(200).json({
    success: true,
    count: payments.length,
    total,
    pages: Math.ceil(total / limit),
    data: payments
  });
});

// @desc    Get all customers
// @route   GET /api/v1/super-admin/customers
// @access  Private (Super Admin)
exports.getCustomers = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const query = {};

  const searchFilter = buildSearchFilter(search, ['name', 'email', 'phone', 'company']);
  if (searchFilter) {
    query.$and = query.$and || [];
    query.$and.push(searchFilter);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const customers = await Customer.find(query)
    .populate('business', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const total = await Customer.countDocuments(query);

  res.status(200).json({
    success: true,
    count: customers.length,
    total,
    pages: Math.ceil(total / limit),
    data: customers
  });
});

// @desc    Get all products
// @route   GET /api/v1/super-admin/products
// @access  Private (Super Admin)
exports.getProducts = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const query = {};

  const searchFilter = buildSearchFilter(search, ['name', 'sku', 'barcode']);
  if (searchFilter) {
    query.$and = query.$and || [];
    query.$and.push(searchFilter);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const products = await Product.find(query)
    .populate('business', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const total = await Product.countDocuments(query);

  res.status(200).json({
    success: true,
    count: products.length,
    total,
    pages: Math.ceil(total / limit),
    data: products
  });
});

// @desc    Get all receipts
// @route   GET /api/v1/super-admin/receipts
// @access  Private (Super Admin)
exports.getReceipts = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 50 } = req.query;
  const query = {};

  const searchFilter = buildSearchFilter(search, ['receiptNumber', 'paymentMethod']);
  if (searchFilter) {
    query.$and = query.$and || [];
    query.$and.push(searchFilter);
  }

  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const receipts = await Receipt.find(query)
    .populate('business', 'name email')
    .populate('customer', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit, 10));

  const total = await Receipt.countDocuments(query);

  res.status(200).json({
    success: true,
    count: receipts.length,
    total,
    pages: Math.ceil(total / limit),
    data: receipts
  });
});
