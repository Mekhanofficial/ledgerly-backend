const Customer = require('../models/Customer');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Business = require('../models/Business');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const sendEmail = require('../utils/email');
const {
  normalizeRole,
  isStaff,
  isClient,
  isSuperAdmin,
  isAdmin
} = require('../utils/rolePermissions');

const getEffectiveRole = (req) => req.user?.effectiveRole || normalizeRole(req.user?.role);

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatCurrency = (value, currency = 'USD') => {
  const amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency || 'USD').toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch (error) {
    return `${String(currency || 'USD').toUpperCase()} ${amount.toFixed(2)}`;
  }
};

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const normalizeInvoiceStatus = (status) => String(status || '').trim().toLowerCase();

// @desc    Get all customers
// @route   GET /api/v1/customers
// @access  Private
exports.getCustomers = asyncHandler(async (req, res, next) => {
  const { search, type, isActive, page = 1, limit = 20 } = req.query;
  const parsedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
  
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
    .skip((parsedPage - 1) * parsedLimit)
    .limit(parsedLimit);
    
  const total = await Customer.countDocuments(query);
  
  res.status(200).json({
    success: true,
    count: customers.length,
    total,
    pages: Math.ceil(total / parsedLimit),
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
  
  await customer.deleteOne();
  
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

// @desc    Send customer statement email
// @route   POST /api/v1/customers/:id/send-statement
// @access  Private
exports.sendCustomerStatement = asyncHandler(async (req, res, next) => {
  const customer = await Customer.findOne({
    _id: req.params.id,
    business: req.user.business
  });

  if (!customer) {
    return next(new ErrorResponse(`Customer not found with id ${req.params.id}`, 404));
  }

  const effectiveRole = getEffectiveRole(req);
  if (isClient(effectiveRole)) {
    return next(new ErrorResponse('Not authorized to send customer statements', 403));
  }
  if (
    isStaff(effectiveRole) &&
    customer.assignedTo?.toString() !== req.user.id &&
    customer.createdBy?.toString() !== req.user.id
  ) {
    return next(new ErrorResponse('Not authorized to send statement for this customer', 403));
  }

  if (!customer.email) {
    return next(new ErrorResponse('Customer does not have an email address', 400));
  }

  const business = await Business.findById(req.user.business)
    .select('name currency email phone')
    .lean();

  const invoices = await Invoice.find({
    business: req.user.business,
    customer: customer._id,
    status: { $nin: ['void', 'cancelled'] }
  })
    .select('invoiceNumber date dueDate total amountPaid balance status currency')
    .sort({ date: -1 })
    .lean();

  const currency = String(
    customer.currency
    || invoices.find((invoice) => invoice.currency)?.currency
    || business?.currency
    || 'USD'
  ).toUpperCase();

  const openStatuses = new Set(['sent', 'viewed', 'partial', 'overdue']);
  const now = new Date();

  const openInvoices = invoices.filter((invoice) => {
    const status = normalizeInvoiceStatus(invoice.status);
    const balance = Number(invoice.balance) || 0;
    return openStatuses.has(status) && balance > 0;
  });

  const overdueInvoices = openInvoices.filter((invoice) => {
    const status = normalizeInvoiceStatus(invoice.status);
    if (status === 'overdue') return true;
    const dueDate = new Date(invoice.dueDate);
    return !Number.isNaN(dueDate.getTime()) && dueDate < now;
  });

  const totalInvoiced = invoices.reduce((sum, invoice) => sum + (Number(invoice.total) || 0), 0);
  const totalPaid = invoices.reduce((sum, invoice) => sum + (Number(invoice.amountPaid) || 0), 0);
  const outstandingAmount = openInvoices.reduce((sum, invoice) => sum + (Number(invoice.balance) || 0), 0);

  const statementLines = openInvoices
    .slice()
    .sort((a, b) => {
      const dueA = new Date(a.dueDate).getTime() || 0;
      const dueB = new Date(b.dueDate).getTime() || 0;
      return dueA - dueB;
    })
    .slice(0, 20);

  const businessName = escapeHtml(business?.name || 'Ledgerly');
  const customerName = escapeHtml(customer.name || 'Customer');
  const generatedAt = formatDate(new Date());

  const summaryRowsHtml = `
    <tr><td style="padding:8px;border:1px solid #e5e7eb;">Total Invoiced</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">${escapeHtml(formatCurrency(totalInvoiced, currency))}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;">Total Paid</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:600;">${escapeHtml(formatCurrency(totalPaid, currency))}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;">Outstanding Amount</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700;color:#b91c1c;">${escapeHtml(formatCurrency(outstandingAmount, currency))}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;">Open Invoices</td><td style="padding:8px;border:1px solid #e5e7eb;">${openInvoices.length}</td></tr>
    <tr><td style="padding:8px;border:1px solid #e5e7eb;">Overdue Invoices</td><td style="padding:8px;border:1px solid #e5e7eb;color:${overdueInvoices.length > 0 ? '#b91c1c' : '#166534'};font-weight:600;">${overdueInvoices.length}</td></tr>
  `;

  const statementTableHtml = statementLines.length
    ? `
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;">Invoice #</th>
            <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;">Date</th>
            <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;">Due Date</th>
            <th style="text-align:left;padding:8px;border:1px solid #e5e7eb;">Status</th>
            <th style="text-align:right;padding:8px;border:1px solid #e5e7eb;">Balance</th>
          </tr>
        </thead>
        <tbody>
          ${statementLines.map((invoice) => {
            const status = normalizeInvoiceStatus(invoice.status);
            const isOverdue = status === 'overdue' || (new Date(invoice.dueDate).getTime() < now.getTime());
            return `
              <tr>
                <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(invoice.invoiceNumber || '-')}</td>
                <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(formatDate(invoice.date))}</td>
                <td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(formatDate(invoice.dueDate))}</td>
                <td style="padding:8px;border:1px solid #e5e7eb;color:${isOverdue ? '#b91c1c' : '#334155'};text-transform:capitalize;">${escapeHtml(status || '-')}</td>
                <td style="padding:8px;border:1px solid #e5e7eb;text-align:right;font-weight:600;">${escapeHtml(formatCurrency(invoice.balance, currency))}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `
    : '<p style="margin-top:16px;">There are no open invoices at this time.</p>';

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
      <h2 style="margin-bottom:8px;">Statement of Account</h2>
      <p>Hi ${customerName},</p>
      <p>Please find your account statement from <strong>${businessName}</strong> as of <strong>${escapeHtml(generatedAt)}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;">
        ${summaryRowsHtml}
      </table>
      ${statementTableHtml}
      <p style="margin-top:18px;">If you've already made payment, please disregard this email.</p>
      <p>Regards,<br/>${businessName}</p>
    </div>
  `;

  const text = [
    `Statement of Account - ${business?.name || 'Ledgerly'}`,
    `Customer: ${customer.name || 'Customer'}`,
    `Date: ${generatedAt}`,
    '',
    `Total Invoiced: ${formatCurrency(totalInvoiced, currency)}`,
    `Total Paid: ${formatCurrency(totalPaid, currency)}`,
    `Outstanding Amount: ${formatCurrency(outstandingAmount, currency)}`,
    `Open Invoices: ${openInvoices.length}`,
    `Overdue Invoices: ${overdueInvoices.length}`,
    '',
    statementLines.length
      ? 'Open Invoices:'
      : 'There are no open invoices at this time.',
    ...statementLines.map((invoice) =>
      `- ${invoice.invoiceNumber || '-'} | Due ${formatDate(invoice.dueDate)} | ${formatCurrency(invoice.balance, currency)} | ${normalizeInvoiceStatus(invoice.status) || '-'}`
    )
  ].join('\n');

  await sendEmail({
    to: customer.email,
    subject: `Statement of Account - ${business?.name || 'Ledgerly'}`,
    text,
    html,
    businessId: req.user.business
  });

  res.status(200).json({
    success: true,
    message: 'Customer statement sent successfully',
    data: {
      customerId: customer._id,
      customerName: customer.name,
      email: customer.email,
      summary: {
        totalInvoiced,
        totalPaid,
        outstandingAmount,
        openInvoices: openInvoices.length,
        overdueInvoices: overdueInvoices.length,
        currency
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
