const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const {
  normalizeRole,
  isStaff,
  isClient,
  isSuperAdmin,
  isAdmin
} = require('../utils/rolePermissions');

const getEffectiveRole = (req) => req.user?.effectiveRole || normalizeRole(req.user?.role);

// @desc    Get all customers
// @route   GET /api/v1/customers
// @access  Private
exports.getCustomers = asyncHandler(async (req, res, next) => {
  const { search, type, isActive, page = 1, limit = 20 } = req.query;
  
  const effectiveRole = getEffectiveRole(req);
  let query = { business: req.user.business };
  const andFilters = [];

  if (search) {
    andFilters.push({
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { company: { $regex: search, $options: 'i' } }
      ]
    });
  }

  if (isStaff(effectiveRole)) {
    andFilters.push({
      $or: [
        { assignedTo: req.user.id },
        { createdBy: req.user.id }
      ]
    });
  }

  if (andFilters.length > 0) {
    query.$and = andFilters;
  }
  
  if (type) query.customerType = type;
  if (isActive !== undefined) query.isActive = isActive === 'true';
  
  const customers = await Customer.find(query)
    .sort({ name: 1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));
    
  const total = await Customer.countDocuments(query);
  
  res.status(200).json({
    success: true,
    count: customers.length,
    total,
    pages: Math.ceil(total / limit),
    data: customers
  });
});

// @desc    Get single customer
// @route   GET /api/v1/customers/:id
// @access  Private
exports.getCustomer = asyncHandler(async (req, res, next) => {
  const customer = await Customer.findOne({
    _id: req.params.id,
    business: req.user.business
  });
  
  if (!customer) {
    return next(new ErrorResponse(`Customer not found with id ${req.params.id}`, 404));
  }

  const effectiveRole = getEffectiveRole(req);
  if (isClient(effectiveRole)) {
    return next(new ErrorResponse('Not authorized to access customers', 403));
  }
  if (
    isStaff(effectiveRole) &&
    customer.assignedTo?.toString() !== req.user.id &&
    customer.createdBy?.toString() !== req.user.id
  ) {
    return next(new ErrorResponse('Not authorized to access this customer', 403));
  }
  
  res.status(200).json({
    success: true,
    data: customer
  });
});

// @desc    Create customer
// @route   POST /api/v1/customers
// @access  Private
exports.createCustomer = asyncHandler(async (req, res, next) => {
  const effectiveRole = getEffectiveRole(req);
  if (isClient(effectiveRole)) {
    return next(new ErrorResponse('Not authorized to create customers', 403));
  }

  req.body.business = req.user.business;
  req.body.createdBy = req.user.id;

  if (isStaff(effectiveRole)) {
    req.body.assignedTo = req.user.id;
  } else if (req.body.assignedTo && !(isSuperAdmin(effectiveRole) || isAdmin(effectiveRole))) {
    delete req.body.assignedTo;
  }
  
  const customer = await Customer.create(req.body);
  
  res.status(201).json({
    success: true,
    data: customer
  });
});

// @desc    Update customer
// @route   PUT /api/v1/customers/:id
// @access  Private
exports.updateCustomer = asyncHandler(async (req, res, next) => {
  let customer = await Customer.findOne({
    _id: req.params.id,
    business: req.user.business
  });
  
  if (!customer) {
    return next(new ErrorResponse(`Customer not found with id ${req.params.id}`, 404));
  }

  const effectiveRole = getEffectiveRole(req);
  if (isClient(effectiveRole)) {
    return next(new ErrorResponse('Not authorized to update customers', 403));
  }
  if (
    isStaff(effectiveRole) &&
    customer.assignedTo?.toString() !== req.user.id &&
    customer.createdBy?.toString() !== req.user.id
  ) {
    return next(new ErrorResponse('Not authorized to update this customer', 403));
  }

  if (req.body.assignedTo !== undefined && !(isSuperAdmin(effectiveRole) || isAdmin(effectiveRole))) {
    return next(new ErrorResponse('Only admins can reassign customers', 403));
  }
  
  req.body.updatedBy = req.user.id;
  
  customer = await Customer.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  
  res.status(200).json({
    success: true,
    data: customer
  });
});

// @desc    Delete customer
// @route   DELETE /api/v1/customers/:id
// @access  Private
exports.deleteCustomer = asyncHandler(async (req, res, next) => {
  const customer = await Customer.findOne({
    _id: req.params.id,
    business: req.user.business
  });
  
  if (!customer) {
    return next(new ErrorResponse(`Customer not found with id ${req.params.id}`, 404));
  }

  const effectiveRole = getEffectiveRole(req);
  if (!(isSuperAdmin(effectiveRole) || isAdmin(effectiveRole))) {
    return next(new ErrorResponse('Only admins can delete customers', 403));
  }
  
  // Check if customer has invoices
  const invoiceCount = await Invoice.countDocuments({
    customer: req.params.id,
    business: req.user.business
  });
  
  if (invoiceCount > 0) {
    return next(new ErrorResponse(
      'Cannot delete customer with existing invoices. Mark as inactive instead.',
      400
    ));
  }
  
  await customer.remove();
  
  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get customer history
// @route   GET /api/v1/customers/:id/history
// @access  Private
exports.getCustomerHistory = asyncHandler(async (req, res, next) => {
  const customer = await Customer.findOne({
    _id: req.params.id,
    business: req.user.business
  });
  
  if (!customer) {
    return next(new ErrorResponse(`Customer not found with id ${req.params.id}`, 404));
  }
  
  const invoices = await Invoice.find({
    customer: req.params.id,
    business: req.user.business
  })
    .sort({ date: -1 })
    .limit(50);
    
  const payments = await Payment.find({
    customer: req.params.id,
    business: req.user.business
  })
    .sort({ paymentDate: -1 })
    .limit(50);
    
  res.status(200).json({
    success: true,
    data: {
      customer,
      invoices,
      payments,
      summary: {
        totalInvoiced: customer.totalInvoiced,
        totalPaid: customer.totalPaid,
        outstandingBalance: customer.outstandingBalance,
        totalInvoices: invoices.length,
        totalPayments: payments.length
      }
    }
  });
});

// @desc    Import customers from CSV
// @route   POST /api/v1/customers/import
// @access  Private
exports.importCustomers = asyncHandler(async (req, res, next) => {
  const { customers } = req.body;
  
  if (!customers || !Array.isArray(customers)) {
    return next(new ErrorResponse('Please provide an array of customers', 400));
  }
  
  const importedCustomers = [];
  const errors = [];
  
  for (let i = 0; i < customers.length; i++) {
    try {
      const customerData = customers[i];
      customerData.business = req.user.business;
      customerData.createdBy = req.user.id;
      
      const customer = await Customer.create(customerData);
      importedCustomers.push(customer);
    } catch (error) {
      errors.push({
        row: i + 1,
        data: customers[i],
        error: error.message
      });
    }
  }
  
  res.status(200).json({
    success: true,
    imported: importedCustomers.length,
    errors: errors.length,
    data: {
      imported: importedCustomers,
      errors
    }
  });
});
