const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Business = require('../models/Business');
const InventoryTransaction = require('../models/InventoryTransaction');
const Payment = require('../models/Payment');
const Receipt = require('../models/Receipt');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const sendEmail = require('../utils/email');
const generatePDF = require('../utils/generatePDF');
const { calculateInvoiceTotals, toNumber, roundMoney } = require('../utils/invoiceCalculator');
const { getTaxSettings } = require('../utils/taxSettings');
const { normalizePlanId } = require('../utils/planConfig');
const { resolveBillingOwner, resetInvoiceCountIfNeeded, resolveEffectivePlan } = require('../utils/subscriptionService');
const User = require('../models/User');
const {
  normalizeRole,
  isSuperAdmin,
  isStaff,
  isClient,
  isAccountant
} = require('../utils/rolePermissions');

const isMultiCurrencyAllowed = (plan) =>
  ['professional', 'enterprise'].includes(normalizePlanId(plan));

const resolveInvoiceCurrency = (business, requestedCurrency) => {
  const businessCurrency = (business?.currency || 'USD').toString().trim().toUpperCase();
  const requested = requestedCurrency ? String(requestedCurrency).trim().toUpperCase() : '';
  return requested || businessCurrency;
};

const getEffectiveRole = (req) => req.user?.effectiveRole || normalizeRole(req.user?.role);

const hasValue = (value) => value !== undefined && value !== null;

const resolveOverrideInput = (payload = {}) => {
  const overrideRate = hasValue(payload.taxRateUsed)
    ? payload.taxRateUsed
    : hasValue(payload.taxRate)
      ? payload.taxRate
      : hasValue(payload.tax?.percentage)
        ? payload.tax.percentage
        : undefined;
  const overrideAmount = hasValue(payload.taxAmount)
    ? payload.taxAmount
    : hasValue(payload.tax?.amount)
      ? payload.tax.amount
      : undefined;
  const overrideName = hasValue(payload.taxName)
    ? payload.taxName
    : hasValue(payload.tax?.description)
      ? payload.tax.description
      : undefined;
  const overrideFlag = hasValue(payload.isTaxOverridden) ? payload.isTaxOverridden : false;

  return {
    overrideRate,
    overrideAmount,
    overrideName,
    overrideFlag,
    overrideRequested: hasValue(overrideRate) || hasValue(overrideAmount) || Boolean(overrideFlag)
  };
};

const RECURRING_FREQUENCIES = new Set(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']);
const RECURRING_STATUSES = new Set(['active', 'paused', 'completed']);

const normalizeRecurringFrequency = (value) => {
  const normalized = String(value || 'monthly').toLowerCase();
  return RECURRING_FREQUENCIES.has(normalized) ? normalized : 'monthly';
};

const normalizeRecurringStatus = (value) => {
  const normalized = String(value || 'active').toLowerCase();
  return RECURRING_STATUSES.has(normalized) ? normalized : 'active';
};

const parseDateValue = (value, fallbackDate) => {
  if (!hasValue(value)) return fallbackDate ? new Date(fallbackDate) : undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? (fallbackDate ? new Date(fallbackDate) : undefined) : parsed;
};

const resolveRecurringInput = (payload = {}, fallbackDate) => {
  if (!payload || typeof payload !== 'object') {
    return { isRecurring: false };
  }

  const isRecurring = Boolean(payload.isRecurring);
  if (!isRecurring) {
    return { isRecurring: false };
  }

  const frequency = normalizeRecurringFrequency(payload.frequency);
  const parsedInterval = parseInt(payload.interval, 10);
  const interval = Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : 1;

  const startDate = parseDateValue(payload.startDate, fallbackDate || new Date());
  const nextInvoiceDate = parseDateValue(payload.nextInvoiceDate, startDate || fallbackDate || new Date());
  const endDate = parseDateValue(payload.endDate);

  const parsedTotalCycles = parseInt(payload.totalCycles, 10);
  const totalCycles = Number.isFinite(parsedTotalCycles) && parsedTotalCycles > 0 ? parsedTotalCycles : undefined;

  const parsedCompletedCycles = parseInt(payload.completedCycles, 10);
  const completedCycles = Number.isFinite(parsedCompletedCycles) && parsedCompletedCycles >= 0
    ? parsedCompletedCycles
    : 0;

  const status = normalizeRecurringStatus(payload.status);

  return {
    isRecurring: true,
    status,
    frequency,
    interval,
    startDate,
    endDate,
    nextInvoiceDate,
    totalCycles,
    completedCycles
  };
};

// @desc    Get all invoices
// @route   GET /api/v1/invoices
// @access  Private
exports.getInvoices = asyncHandler(async (req, res, next) => {
  const {
    status,
    customer,
    startDate,
    endDate,
    search,
    page = 1,
    limit = 20,
    sort = '-date'
  } = req.query;

  // Build query
  let query = { business: req.user.business };
  const effectiveRole = getEffectiveRole(req);

  if (isStaff(effectiveRole)) {
    query.createdBy = req.user.id;
  }

  if (isClient(effectiveRole)) {
    if (!req.user.customer) {
      return next(new ErrorResponse('Client account is not linked to a customer', 403));
    }
    query.customer = req.user.customer;
  }

  // Apply filters
  if (status) query.status = status;
  if (customer) query.customer = customer;
  
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }

  // Search
  if (search) {
    query.$or = [
      { invoiceNumber: { $regex: search, $options: 'i' } },
      { 'customer.name': { $regex: search, $options: 'i' } }
    ];
  }

  // Execute query with pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const invoices = await Invoice.find(query)
    .populate('customer', 'name email phone company')
    .populate('createdBy', 'name email')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Invoice.countDocuments(query);

  // Calculate summary
  const summary = await Invoice.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$total' },
        totalPaid: { $sum: '$amountPaid' },
        totalOutstanding: { $sum: '$balance' },
        count: { $sum: 1 }
      }
    }
  ]);

  res.status(200).json({
    success: true,
    count: invoices.length,
    total,
    pages: Math.ceil(total / limit),
    summary: summary[0] || {
      totalAmount: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      count: 0
    },
    data: invoices
  });
});

// @desc    Get single invoice
// @route   GET /api/v1/invoices/:id
// @access  Private
exports.getInvoice = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('customer')
    .populate('items.product')
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name email');

  if (!invoice) {
    return next(new ErrorResponse(`Invoice not found with id ${req.params.id}`, 404));
  }

  // Check if user has access to this business
  if (invoice.business.toString() !== req.user.business.toString()) {
    return next(new ErrorResponse('Not authorized to access this invoice', 403));
  }

  const effectiveRole = getEffectiveRole(req);
  if (isStaff(effectiveRole) && invoice.createdBy?.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to access this invoice', 403));
  }
  if (isClient(effectiveRole)) {
    if (!req.user.customer) {
      return next(new ErrorResponse('Client account is not linked to a customer', 403));
    }
    if (invoice.customer?.toString() !== req.user.customer.toString()) {
      return next(new ErrorResponse('Not authorized to access this invoice', 403));
    }
  }

  res.status(200).json({
    success: true,
    data: invoice
  });
});

// @desc    Create new invoice
// @route   POST /api/v1/invoices
// @access  Private
exports.createInvoice = asyncHandler(async (req, res, next) => {
  const business = await Business.findById(req.user.business);
  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  const currency = resolveInvoiceCurrency(business, req.body.currency);
  const billingOwner = req.billingOwner || await resolveBillingOwner(req.user);
  const effectivePlan = resolveEffectivePlan(billingOwner);
  if (!isMultiCurrencyAllowed(effectivePlan) && currency !== business.currency) {
    return next(new ErrorResponse('Multi-currency is available on Professional and Enterprise plans.', 403));
  }

  // Add business to req.body
  req.body.business = req.user.business;
  req.body.createdBy = req.user.id;
  req.body.currency = currency;

  // Validate customer
  const customer = await Customer.findOne({
    _id: req.body.customer,
    business: req.user.business
  });

  if (!customer) {
    return next(new ErrorResponse('Customer not found', 404));
  }

  // Process items and update inventory
  if (req.body.items && req.body.items.length > 0) {
    for (const item of req.body.items) {
      if (item.product) {
        const product = await Product.findById(item.product);
        
        if (product && product.trackInventory) {
          // Check stock availability
          if (product.stock.available < item.quantity) {
            return next(new ErrorResponse(
              `Insufficient stock for ${product.name}. Available: ${product.stock.available}`,
              400
            ));
          }
        }
      }
    }
  }

  // Set due date if not provided
  if (!req.body.dueDate) {
    const dueDays = business.invoiceSettings.dueDays || 30;
    req.body.dueDate = new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000);
  }

  const recurringInput = resolveRecurringInput(
    req.body.recurring,
    req.body.date || req.body.dueDate || new Date()
  );
  req.body.recurring = recurringInput;

  const taxSettings = await getTaxSettings();
  const {
    overrideRate,
    overrideAmount,
    overrideName,
    overrideRequested
  } = resolveOverrideInput(req.body);

  if (overrideRequested && !taxSettings.allowManualOverride) {
    return next(new ErrorResponse('Manual tax override is not enabled', 403));
  }

  let taxRateUsed = taxSettings.taxEnabled ? toNumber(taxSettings.taxRate, 0) : 0;
  let taxAmountOverride = null;
  let isTaxOverridden = false;
  let taxName = taxSettings.taxName || 'VAT';

  if (taxSettings.taxEnabled && overrideRequested) {
    isTaxOverridden = true;
    if (hasValue(overrideRate)) {
      taxRateUsed = toNumber(overrideRate, taxRateUsed);
    }
    if (hasValue(overrideAmount)) {
      taxAmountOverride = overrideAmount;
    }
    if (overrideName) {
      taxName = overrideName;
    }
  }

  if (!taxSettings.taxEnabled) {
    taxRateUsed = 0;
    taxAmountOverride = 0;
    isTaxOverridden = false;
  }

  let computedTotals;
  try {
    computedTotals = calculateInvoiceTotals({
      items: req.body.items,
      discount: req.body.discount,
      shipping: req.body.shipping,
      taxRateUsed,
      taxAmountOverride,
      isTaxOverridden,
      amountPaid: req.body.amountPaid
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }

  req.body.items = computedTotals.items;
  req.body.subtotal = computedTotals.subtotal;
  req.body.taxRateUsed = taxRateUsed;
  req.body.taxAmount = computedTotals.taxAmount;
  req.body.isTaxOverridden = isTaxOverridden;
  req.body.taxName = taxName;
  req.body.tax = {
    ...(req.body.tax || {}),
    amount: computedTotals.taxAmount,
    percentage: taxRateUsed,
    description: taxName
  };
  req.body.total = computedTotals.total;
  req.body.amountPaid = computedTotals.amountPaid;
  req.body.balance = computedTotals.balance;

  const invoice = await Invoice.create(req.body);

  // Track invoice count for billing limits
  try {
    const billingOwner = req.billingOwner || await resolveBillingOwner(req.user);
    if (billingOwner?._id) {
      await resetInvoiceCountIfNeeded(billingOwner);
      await User.findByIdAndUpdate(billingOwner._id, { $inc: { invoiceCountThisMonth: 1 } });
    }
  } catch (error) {
    console.warn('Unable to update invoice count:', error?.message || error);
  }

  // Update inventory for products
  if (req.body.items && req.body.items.length > 0) {
    for (const item of req.body.items) {
      if (item.product) {
        const product = await Product.findById(item.product);
        
        if (product && product.trackInventory) {
          // Reserve stock
          product.stock.reserved += item.quantity;
          product.stock.available = product.stock.quantity - product.stock.reserved;
          await product.save();

          // Create inventory transaction
          await InventoryTransaction.create({
            business: req.user.business,
            product: item.product,
            type: 'sale_reserved',
            quantity: -item.quantity,
            reference: `Invoice: ${invoice.invoiceNumber}`,
            createdBy: req.user.id
          });
        }
      }
    }
  }

  // Update customer stats
  await Customer.updateCustomerStats(customer._id);

  res.status(201).json({
    success: true,
    data: invoice
  });
});

// @desc    Update invoice
// @route   PUT /api/v1/invoices/:id
// @access  Private
exports.updateInvoice = asyncHandler(async (req, res, next) => {
  let invoice = await Invoice.findById(req.params.id);

  if (!invoice) {
    return next(new ErrorResponse(`Invoice not found with id ${req.params.id}`, 404));
  }

  // Check if user has access
  if (invoice.business.toString() !== req.user.business.toString()) {
    return next(new ErrorResponse('Not authorized to update this invoice', 403));
  }

  const effectiveRole = getEffectiveRole(req);

  if (isClient(effectiveRole)) {
    return next(new ErrorResponse('Not authorized to update invoices', 403));
  }

  if (!isSuperAdmin(effectiveRole) && ['paid', 'cancelled', 'void'].includes(invoice.status)) {
    return next(new ErrorResponse('Cannot modify a paid, cancelled or void invoice', 400));
  }

  if ((isStaff(effectiveRole) || isAccountant(effectiveRole)) && invoice.status !== 'draft') {
    return next(new ErrorResponse('Only draft invoices can be edited', 400));
  }

  if (isStaff(effectiveRole) && invoice.createdBy?.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to update this invoice', 403));
  }

  if (req.body.currency !== undefined) {
    const business = await Business.findById(req.user.business);
    if (!business) {
      return next(new ErrorResponse('Business not found', 404));
    }
    const currency = resolveInvoiceCurrency(business, req.body.currency);
    const billingOwner = req.billingOwner || await resolveBillingOwner(req.user);
    const effectivePlan = resolveEffectivePlan(billingOwner);
    if (!isMultiCurrencyAllowed(effectivePlan) && currency !== business.currency) {
      return next(new ErrorResponse('Multi-currency is available on Professional and Enterprise plans.', 403));
    }
    req.body.currency = currency;
  }

  // Add updatedBy
  req.body.updatedBy = req.user.id;

  if (hasValue(req.body.recurring)) {
    req.body.recurring = resolveRecurringInput(
      req.body.recurring,
      req.body.date || invoice.date || new Date()
    );
  }

  // Handle inventory adjustments if items changed
  if (req.body.items) {
    // TODO: Implement inventory adjustment logic
  }

  const shouldRecalculate = Boolean(req.body.items)
    || hasValue(req.body.taxRateUsed)
    || hasValue(req.body.taxRate)
    || hasValue(req.body.taxAmount)
    || hasValue(req.body.taxName)
    || hasValue(req.body.isTaxOverridden)
    || hasValue(req.body.discount)
    || hasValue(req.body.shipping)
    || hasValue(req.body.amountPaid);

  if (shouldRecalculate) {
    const taxSettings = await getTaxSettings();
    const {
      overrideRate,
      overrideAmount,
      overrideName,
      overrideRequested
    } = resolveOverrideInput(req.body);

    if (overrideRequested && !taxSettings.allowManualOverride) {
      return next(new ErrorResponse('Manual tax override is not enabled', 403));
    }

    const baseRate = toNumber(invoice.taxRateUsed ?? invoice.tax?.percentage ?? 0, 0);
    const baseAmount = toNumber(invoice.taxAmount ?? invoice.tax?.amount ?? 0, 0);
    const baseName = invoice.taxName || invoice.tax?.description || taxSettings.taxName || 'VAT';
    const baseOverride = Boolean(invoice.isTaxOverridden);

    let taxRateUsed = baseRate;
    let taxAmountOverride = null;
    let taxName = baseName;
    let isTaxOverridden = baseOverride;

    if (overrideRequested) {
      isTaxOverridden = true;
      if (hasValue(overrideRate)) {
        taxRateUsed = toNumber(overrideRate, baseRate);
      }
      if (hasValue(overrideAmount)) {
        taxAmountOverride = overrideAmount;
      }
      if (overrideName) {
        taxName = overrideName;
      }
    } else if (baseOverride) {
      try {
        const expected = calculateInvoiceTotals({
          items: req.body.items ?? invoice.items,
          discount: req.body.discount ?? invoice.discount,
          shipping: req.body.shipping ?? invoice.shipping,
          taxRateUsed: baseRate,
          isTaxOverridden: false,
          amountPaid: hasValue(req.body.amountPaid) ? req.body.amountPaid : invoice.amountPaid
        });
        if (Math.abs(roundMoney(expected.taxAmount) - roundMoney(baseAmount)) > 0.01) {
          taxAmountOverride = baseAmount;
        }
      } catch (error) {
        return next(new ErrorResponse(error.message, 400));
      }
    }

    let computedTotals;
    try {
      computedTotals = calculateInvoiceTotals({
        items: req.body.items ?? invoice.items,
        discount: req.body.discount ?? invoice.discount,
        shipping: req.body.shipping ?? invoice.shipping,
        taxRateUsed,
        taxAmountOverride,
        isTaxOverridden,
        amountPaid: hasValue(req.body.amountPaid) ? req.body.amountPaid : invoice.amountPaid
      });
    } catch (error) {
      return next(new ErrorResponse(error.message, 400));
    }

    req.body.items = computedTotals.items;
    req.body.subtotal = computedTotals.subtotal;
    req.body.taxRateUsed = taxRateUsed;
    req.body.taxAmount = computedTotals.taxAmount;
    req.body.isTaxOverridden = isTaxOverridden;
    req.body.taxName = taxName;
    req.body.tax = {
      ...(req.body.tax || invoice.tax || {}),
      amount: computedTotals.taxAmount,
      percentage: taxRateUsed,
      description: taxName
    };
    req.body.total = computedTotals.total;
    req.body.amountPaid = computedTotals.amountPaid;
    req.body.balance = computedTotals.balance;
  }

  invoice = await Invoice.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  // Update customer stats
  await Customer.updateCustomerStats(invoice.customer);

  res.status(200).json({
    success: true,
    data: invoice
  });
});

// @desc    Delete invoice
// @route   DELETE /api/v1/invoices/:id
// @access  Private (Admin, Accountant)
exports.deleteInvoice = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id);

  if (!invoice) {
    return next(new ErrorResponse(`Invoice not found with id ${req.params.id}`, 404));
  }

  // Check if user has access
  if (invoice.business.toString() !== req.user.business.toString()) {
    return next(new ErrorResponse('Not authorized to delete this invoice', 403));
  }

  const effectiveRole = getEffectiveRole(req);

  if (!isSuperAdmin(effectiveRole)) {
    return next(new ErrorResponse('Only super admins can delete invoices', 403));
  }

  const shouldRestock = invoice.status === 'paid';

  // Adjust inventory
  if (invoice.items && invoice.items.length > 0) {
    for (const item of invoice.items) {
      if (item.product) {
        const product = await Product.findById(item.product);
        
        if (product && product.trackInventory) {
          if (shouldRestock) {
            product.stock.quantity += item.quantity;
          } else {
            product.stock.reserved = Math.max(0, product.stock.reserved - item.quantity);
          }
          product.stock.available = product.stock.quantity - product.stock.reserved;
          await product.save();

          // Create inventory transaction
          await InventoryTransaction.create({
            business: invoice.business,
            product: item.product,
            type: shouldRestock ? 'sale_reversed' : 'sale_cancelled',
            quantity: item.quantity,
            reference: `Invoice Deleted: ${invoice.invoiceNumber}`,
            createdBy: req.user.id
          });
        }
      }
    }
  }

  await invoice.remove();

  // Update customer stats
  await Customer.updateCustomerStats(invoice.customer);

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Send invoice via email
// @route   POST /api/v1/invoices/:id/send
// @access  Private
exports.sendInvoice = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('customer')
    .populate('business');

  if (!invoice) {
    return next(new ErrorResponse(`Invoice not found with id ${req.params.id}`, 404));
  }

  // Check if user has access
  if (invoice.business._id.toString() !== req.user.business.toString()) {
    return next(new ErrorResponse('Not authorized to send this invoice', 403));
  }

  const effectiveRole = getEffectiveRole(req);
  if (isClient(effectiveRole)) {
    return next(new ErrorResponse('Not authorized to send invoices', 403));
  }
  if (isStaff(effectiveRole) && invoice.createdBy?.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to send this invoice', 403));
  }

  // Generate PDF
  const pdfBuffer = await generatePDF.invoice(invoice);

  // Send email
  await sendEmail({
    to: invoice.customer.email,
    subject: `Invoice ${invoice.invoiceNumber} from ${invoice.business.name}`,
    template: 'invoice',
    context: {
      customerName: invoice.customer.name,
      businessName: invoice.business.name,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.date.toLocaleDateString(),
      dueDate: invoice.dueDate.toLocaleDateString(),
      totalAmount: invoice.total.toFixed(2),
      currency: invoice.currency,
      invoiceUrl: `${process.env.FRONTEND_URL || process.env.REACT_APP_URL || `${req.protocol}://${req.get('host')}`}/invoices/${invoice._id}`,
      payNowUrl: `${process.env.FRONTEND_URL || process.env.REACT_APP_URL || `${req.protocol}://${req.get('host')}`}/pay/${invoice._id}`
    },
    attachments: [{
      filename: `invoice-${invoice.invoiceNumber}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }]
  });

  // Update invoice status
  invoice.status = 'sent';
  invoice.sentDate = new Date();
  await invoice.save();

  res.status(200).json({
    success: true,
    message: 'Invoice sent successfully',
    data: invoice
  });
});

// @desc    Get invoice PDF
// @route   GET /api/v1/invoices/:id/pdf
// @access  Private
exports.getInvoicePDF = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('customer')
    .populate('business')
    .populate('items.product');

  if (!invoice) {
    return next(new ErrorResponse(`Invoice not found with id ${req.params.id}`, 404));
  }

  // Check if user has access
  if (invoice.business._id.toString() !== req.user.business.toString()) {
    return next(new ErrorResponse('Not authorized to access this invoice', 403));
  }

  const effectiveRole = getEffectiveRole(req);
  if (isStaff(effectiveRole) && invoice.createdBy?.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to access this invoice', 403));
  }
  if (isClient(effectiveRole)) {
    if (!req.user.customer) {
      return next(new ErrorResponse('Client account is not linked to a customer', 403));
    }
    if (invoice.customer?._id?.toString() !== req.user.customer.toString()) {
      return next(new ErrorResponse('Not authorized to access this invoice', 403));
    }
  }

  const pdfBuffer = await generatePDF.invoice(invoice);

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`,
    'Content-Length': pdfBuffer.length
  });

  res.send(pdfBuffer);
});

// @desc    Record payment
// @route   POST /api/v1/invoices/:id/payment
// @access  Private
exports.recordPayment = asyncHandler(async (req, res, next) => {
  const { amount, paymentMethod, paymentReference, paymentGateway, notes, templateStyle } = req.body;

  const invoice = await Invoice.findById(req.params.id)
    .populate('customer', 'name email')
    .populate('business', 'name');

  if (!invoice) {
    return next(new ErrorResponse(`Invoice not found with id ${req.params.id}`, 404));
  }

  const invoiceBusinessId = invoice.business?._id || invoice.business;
  const invoiceCustomerId = invoice.customer?._id || invoice.customer;

  // Check if user has access
  if (!invoiceBusinessId || invoiceBusinessId.toString() !== req.user.business.toString()) {
    return next(new ErrorResponse('Not authorized to record payment for this invoice', 403));
  }

  const effectiveRole = getEffectiveRole(req);
  if (isStaff(effectiveRole)) {
    return next(new ErrorResponse('Not authorized to record payments', 403));
  }
  if (isClient(effectiveRole)) {
    if (!req.user.customer) {
      return next(new ErrorResponse('Client account is not linked to a customer', 403));
    }
    if (!invoiceCustomerId || invoiceCustomerId.toString() !== req.user.customer.toString()) {
      return next(new ErrorResponse('Not authorized to pay this invoice', 403));
    }
  }

  // Validate payment amount
  if (amount <= 0) {
    return next(new ErrorResponse('Payment amount must be greater than 0', 400));
  }

  if (amount > invoice.balance) {
    return next(new ErrorResponse(
      `Payment amount cannot exceed balance. Balance: ${invoice.balance}`,
      400
    ));
  }

  // Record payment
  await invoice.recordPayment(amount, {
    paymentMethod,
    paymentReference,
    paymentGateway
  });

  // Create payment record
  const payment = await Payment.create({
    business: req.user.business,
    invoice: invoice._id,
    customer: invoiceCustomerId,
    amount,
    paymentMethod,
    paymentReference,
    paymentGateway,
    notes,
    createdBy: req.user.id
  });

  // If fully paid, generate receipt
  if (invoice.status === 'paid') {
    // Generate receipt
    const business = await Business.findById(req.user.business);
    if (!business) {
      return next(new ErrorResponse('Business not found for receipt generation', 404));
    }

    const receipt = await Receipt.create({
      business: req.user.business,
      invoice: invoice._id,
      customer: invoiceCustomerId,
      receiptNumber: await business.getNextReceiptNumber(),
      items: invoice.items,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      taxName: invoice.taxName || invoice.tax?.description,
      taxRateUsed: invoice.taxRateUsed ?? invoice.tax?.percentage,
      taxAmount: invoice.taxAmount ?? invoice.tax?.amount,
      isTaxOverridden: invoice.isTaxOverridden,
      total: invoice.total,
      amountPaid: invoice.amountPaid,
      paymentMethod,
      templateStyle: templateStyle || req.body.templateId || req.body.template,
      createdBy: req.user.id
    });

    // Update inventory (release reserved, reduce actual stock)
    if (invoice.items && invoice.items.length > 0) {
      for (const item of invoice.items) {
        if (item.product) {
          const product = await Product.findById(item.product);
          
          if (product && product.trackInventory) {
            // Release reserved stock and reduce actual stock
            product.stock.reserved -= item.quantity;
            product.stock.quantity -= item.quantity;
            product.stock.available = product.stock.quantity - product.stock.reserved;
            await product.save();

            // Create inventory transaction
            await InventoryTransaction.create({
              business: req.user.business,
              product: item.product,
              type: 'sale_completed',
              quantity: -item.quantity,
              reference: `Invoice Paid: ${invoice.invoiceNumber}`,
              createdBy: req.user.id
            });
          }
        }
      }
    }

    // Send receipt email
    const receiptCustomer = invoice.customer && typeof invoice.customer === 'object'
      ? invoice.customer
      : { name: 'Customer' };
    const receiptForPdf = {
      ...receipt.toObject(),
      business,
      customer: receiptCustomer,
      invoice: {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        currency: invoice.currency
      }
    };
    const receiptPDF = await generatePDF.receipt(receiptForPdf);
    
    if (invoice.customer?.email) {
      await sendEmail({
        to: invoice.customer.email,
        subject: `Receipt for Invoice ${invoice.invoiceNumber}`,
        template: 'receipt',
        context: {
          customerName: invoice.customer?.name || 'Customer',
          businessName: invoice.business?.name || 'Business',
          receiptNumber: receipt.receiptNumber,
          invoiceNumber: invoice.invoiceNumber,
          paymentDate: new Date().toLocaleDateString(),
          amountPaid: amount.toFixed(2),
          paymentMethod
        },
        attachments: [{
          filename: `receipt-${receipt.receiptNumber}.pdf`,
          content: receiptPDF,
          contentType: 'application/pdf'
        }]
      });
    } else {
      console.warn('Skipping receipt email because customer email is missing', {
        invoiceId: invoice._id?.toString?.() || invoice._id
      });
    }

    await Customer.updateCustomerStats(invoiceCustomerId);

    res.status(200).json({
      success: true,
      message: 'Payment recorded and receipt generated',
      data: {
        invoice,
        payment,
        receipt
      }
    });
  } else {
    await Customer.updateCustomerStats(invoiceCustomerId);

    res.status(200).json({
      success: true,
      message: 'Partial payment recorded',
      data: {
        invoice,
        payment
      }
    });
  }
});

// @desc    Send payment reminder
// @route   POST /api/v1/invoices/:id/reminder
// @access  Private
exports.sendReminder = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id)
    .populate('customer')
    .populate('business');

  if (!invoice) {
    return next(new ErrorResponse(`Invoice not found with id ${req.params.id}`, 404));
  }

  // Check if user has access
  if (invoice.business._id.toString() !== req.user.business.toString()) {
    return next(new ErrorResponse('Not authorized to send reminder for this invoice', 403));
  }

  // Check if reminder should be sent
  if (invoice.status !== 'overdue' && invoice.status !== 'sent') {
    return next(new ErrorResponse(
      'Reminders can only be sent for overdue or sent invoices',
      400
    ));
  }

  // Calculate late fee if applicable
  let lateFee = 0;
  let lateFeeMessage = '';
  
  if (invoice.status === 'overdue' && !invoice.lateFeeApplied) {
    const business = await Business.findById(req.user.business);
    
    if (business.invoiceSettings.lateFeePercentage > 0) {
      lateFee = invoice.balance * (business.invoiceSettings.lateFeePercentage / 100);
      lateFeeMessage = `A late fee of ${business.invoiceSettings.lateFeePercentage}% has been applied.`;
    } else if (business.invoiceSettings.lateFeeFixed > 0) {
      lateFee = business.invoiceSettings.lateFeeFixed;
      lateFeeMessage = `A late fee of ${lateFee} has been applied.`;
    }
    
    if (lateFee > 0) {
      invoice.lateFeeApplied = true;
      invoice.lateFeeAmount = lateFee;
      invoice.total += lateFee;
      invoice.balance += lateFee;
      await invoice.save();
    }
  }

  // Send reminder email
  await sendEmail({
    to: invoice.customer.email,
    subject: `Reminder: Invoice ${invoice.invoiceNumber} from ${invoice.business.name}`,
    template: 'payment-reminder',
    context: {
      customerName: invoice.customer.name,
      businessName: invoice.business.name,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.date.toLocaleDateString(),
      dueDate: invoice.dueDate.toLocaleDateString(),
      overdueDays: invoice.aging,
      amountDue: invoice.balance.toFixed(2),
      totalAmount: invoice.total.toFixed(2),
      currency: invoice.currency,
      lateFeeMessage,
      invoiceUrl: `${process.env.FRONTEND_URL || process.env.REACT_APP_URL || `${req.protocol}://${req.get('host')}`}/invoices/${invoice._id}`,
      payNowUrl: `${process.env.FRONTEND_URL || process.env.REACT_APP_URL || `${req.protocol}://${req.get('host')}`}/pay/${invoice._id}`
    }
  });

  // Update reminder count
  invoice.remindersSent += 1;
  invoice.lastReminderSent = new Date();
  await invoice.save();

  res.status(200).json({
    success: true,
    message: 'Payment reminder sent successfully',
    data: invoice
  });
});

// @desc    Get outstanding invoices
// @route   GET /api/v1/invoices/outstanding
// @access  Private
exports.getOutstanding = asyncHandler(async (req, res, next) => {
  const { customer, minAmount, maxAmount } = req.query;

  let query = {
    business: req.user.business,
    status: { $in: ['sent', 'partial', 'overdue'] },
    balance: { $gt: 0 }
  };

  if (customer) query.customer = customer;
  if (minAmount) query.balance = { ...query.balance, $gte: parseFloat(minAmount) };
  if (maxAmount) query.balance = { ...query.balance, $lte: parseFloat(maxAmount) };

  const invoices = await Invoice.find(query)
    .populate('customer', 'name email phone')
    .sort({ dueDate: 1 });

  // Calculate aging buckets
  const agingReport = {
    current: { amount: 0, count: 0, invoices: [] },
    overdue1_30: { amount: 0, count: 0, invoices: [] },
    overdue31_60: { amount: 0, count: 0, invoices: [] },
    overdue61_90: { amount: 0, count: 0, invoices: [] },
    overdue90_plus: { amount: 0, count: 0, invoices: [] }
  };

  const now = new Date();
  
  invoices.forEach(invoice => {
    const dueDate = new Date(invoice.dueDate);
    const diffDays = Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) {
      agingReport.current.amount += invoice.balance;
      agingReport.current.count += 1;
      agingReport.current.invoices.push(invoice);
    } else if (diffDays <= 30) {
      agingReport.overdue1_30.amount += invoice.balance;
      agingReport.overdue1_30.count += 1;
      agingReport.overdue1_30.invoices.push(invoice);
    } else if (diffDays <= 60) {
      agingReport.overdue31_60.amount += invoice.balance;
      agingReport.overdue31_60.count += 1;
      agingReport.overdue31_60.invoices.push(invoice);
    } else if (diffDays <= 90) {
      agingReport.overdue61_90.amount += invoice.balance;
      agingReport.overdue61_90.count += 1;
      agingReport.overdue61_90.invoices.push(invoice);
    } else {
      agingReport.overdue90_plus.amount += invoice.balance;
      agingReport.overdue90_plus.count += 1;
      agingReport.overdue90_plus.invoices.push(invoice);
    }
  });

  // Calculate totals
  const totalOutstanding = invoices.reduce((sum, invoice) => sum + invoice.balance, 0);
  const totalInvoices = invoices.length;

  res.status(200).json({
    success: true,
    totalOutstanding,
    totalInvoices,
    agingReport,
    data: invoices
  });
});

// @desc    Duplicate invoice
// @route   POST /api/v1/invoices/duplicate/:id
// @access  Private
exports.duplicateInvoice = asyncHandler(async (req, res, next) => {
  const originalInvoice = await Invoice.findById(req.params.id);

  if (!originalInvoice) {
    return next(new ErrorResponse(`Invoice not found with id ${req.params.id}`, 404));
  }

  // Check if user has access
  if (originalInvoice.business.toString() !== req.user.business.toString()) {
    return next(new ErrorResponse('Not authorized to duplicate this invoice', 403));
  }

  const effectiveRole = getEffectiveRole(req);
  if (isClient(effectiveRole)) {
    return next(new ErrorResponse('Not authorized to duplicate invoices', 403));
  }
  if (isStaff(effectiveRole) && originalInvoice.createdBy?.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to duplicate this invoice', 403));
  }

  // Create new invoice from original
  const invoiceData = originalInvoice.toObject();
  delete invoiceData._id;
  delete invoiceData.invoiceNumber;
  delete invoiceData.status;
  delete invoiceData.sentDate;
  delete invoiceData.viewedDate;
  delete invoiceData.paidDate;
  delete invoiceData.createdAt;
  delete invoiceData.updatedAt;
  
  invoiceData.date = new Date();
  invoiceData.dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
  invoiceData.createdBy = req.user.id;
  invoiceData.status = 'draft';

  const newInvoice = await Invoice.create(invoiceData);

  res.status(201).json({
    success: true,
    message: 'Invoice duplicated successfully',
    data: newInvoice
  });
});

// @desc    Get recurring invoices
// @route   GET /api/v1/invoices/recurring
// @access  Private
exports.getRecurringInvoices = asyncHandler(async (req, res, next) => {
  const {
    status = 'all',
    search,
    page = 1,
    limit = 20
  } = req.query;

  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const query = {
    business: req.user.business,
    'recurring.isRecurring': true
  };

  const effectiveRole = getEffectiveRole(req);
  if (isStaff(effectiveRole)) {
    query.createdBy = req.user.id;
  }

  if (status && status !== 'all') {
    query['recurring.status'] = normalizeRecurringStatus(status);
  }

  if (search) {
    const pattern = new RegExp(search, 'i');
    const matchedCustomers = await Customer.find({
      business: req.user.business,
      name: pattern
    }).select('_id');
    const customerIds = matchedCustomers.map((customer) => customer._id);

    query.$or = [{ invoiceNumber: pattern }];
    if (customerIds.length > 0) {
      query.$or.push({ customer: { $in: customerIds } });
    }
  }

  const skip = (parsedPage - 1) * parsedLimit;

  const [invoices, total] = await Promise.all([
    Invoice.find(query)
      .populate('customer', 'name email phone company')
      .populate('createdBy', 'name email')
      .sort({ 'recurring.nextInvoiceDate': 1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit),
    Invoice.countDocuments(query)
  ]);

  res.status(200).json({
    success: true,
    count: invoices.length,
    total,
    pages: Math.ceil(total / parsedLimit),
    data: invoices
  });
});

// @desc    Convert an invoice to recurring
// @route   POST /api/v1/invoices/:id/recurring
// @access  Private
exports.setInvoiceRecurring = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id);

  if (!invoice) {
    return next(new ErrorResponse(`Invoice not found with id ${req.params.id}`, 404));
  }

  if (invoice.business.toString() !== req.user.business.toString()) {
    return next(new ErrorResponse('Not authorized to update this invoice', 403));
  }

  const effectiveRole = getEffectiveRole(req);
  if (isClient(effectiveRole)) {
    return next(new ErrorResponse('Not authorized to update recurring invoices', 403));
  }
  if (isStaff(effectiveRole) && invoice.createdBy?.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to update this invoice', 403));
  }

  const recurringPayload =
    req.body?.recurring && typeof req.body.recurring === 'object'
      ? req.body.recurring
      : req.body;

  const recurringConfig = resolveRecurringInput(
    { ...recurringPayload, isRecurring: true, status: recurringPayload?.status || 'active' },
    recurringPayload?.startDate || invoice.date || new Date()
  );

  invoice.recurring = {
    ...(invoice.recurring?.toObject?.() || {}),
    ...recurringConfig,
    isRecurring: true,
    status: normalizeRecurringStatus(recurringConfig.status || 'active')
  };

  await invoice.save();

  res.status(200).json({
    success: true,
    message: 'Recurring schedule saved',
    data: invoice
  });
});

// @desc    Pause recurring invoice
// @route   PUT /api/v1/invoices/recurring/:id/pause
// @access  Private
exports.pauseRecurringInvoice = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id);

  if (!invoice) {
    return next(new ErrorResponse(`Invoice not found with id ${req.params.id}`, 404));
  }

  if (invoice.business.toString() !== req.user.business.toString()) {
    return next(new ErrorResponse('Not authorized to update this invoice', 403));
  }

  const effectiveRole = getEffectiveRole(req);
  if (isStaff(effectiveRole) && invoice.createdBy?.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to update this invoice', 403));
  }

  if (!invoice.recurring?.isRecurring) {
    return next(new ErrorResponse('Invoice is not set as recurring', 400));
  }

  invoice.recurring.status = 'paused';
  await invoice.save();

  res.status(200).json({
    success: true,
    message: 'Recurring invoice paused',
    data: invoice
  });
});

// @desc    Resume recurring invoice
// @route   PUT /api/v1/invoices/recurring/:id/resume
// @access  Private
exports.resumeRecurringInvoice = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findById(req.params.id);

  if (!invoice) {
    return next(new ErrorResponse(`Invoice not found with id ${req.params.id}`, 404));
  }

  if (invoice.business.toString() !== req.user.business.toString()) {
    return next(new ErrorResponse('Not authorized to update this invoice', 403));
  }

  const effectiveRole = getEffectiveRole(req);
  if (isStaff(effectiveRole) && invoice.createdBy?.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to update this invoice', 403));
  }

  if (!invoice.recurring) {
    return next(new ErrorResponse('Recurring settings not found for this invoice', 400));
  }

  invoice.recurring.isRecurring = true;
  invoice.recurring.status = 'active';
  if (!invoice.recurring.nextInvoiceDate) {
    invoice.recurring.nextInvoiceDate = invoice.recurring.startDate || new Date();
  }
  await invoice.save();

  res.status(200).json({
    success: true,
    message: 'Recurring invoice resumed',
    data: invoice
  });
});

// @desc    Get invoice aging report
// @route   GET /api/v1/invoices/aging-report
// @access  Private (Admin, Accountant)
exports.getAgingReport = asyncHandler(async (req, res, next) => {
  const { customer, asOfDate } = req.query;
  const reportDate = asOfDate ? new Date(asOfDate) : new Date();

  let matchQuery = {
    business: req.user.business,
    status: { $in: ['sent', 'partial', 'overdue'] },
    balance: { $gt: 0 }
  };

  if (customer) matchQuery.customer = customer;

  const report = await Invoice.aggregate([
    { $match: matchQuery },
    {
      $lookup: {
        from: 'customers',
        localField: 'customer',
        foreignField: '_id',
        as: 'customer'
      }
    },
    { $unwind: '$customer' },
    {
      $project: {
        invoiceNumber: 1,
        date: 1,
        dueDate: 1,
        total: 1,
        balance: 1,
        status: 1,
        customerName: '$customer.name',
        customerEmail: '$customer.email',
        aging: {
          $cond: [
            { $lte: ['$dueDate', reportDate] },
            {
              $floor: {
                $divide: [
                  { $subtract: [reportDate, '$dueDate'] },
                  1000 * 60 * 60 * 24
                ]
              }
            },
            0
          ]
        }
      }
    },
    {
      $group: {
        _id: '$customer._id',
        customerName: { $first: '$customerName' },
        customerEmail: { $first: '$customerEmail' },
        totalOutstanding: { $sum: '$balance' },
        invoices: {
          $push: {
            invoiceNumber: '$invoiceNumber',
            date: '$date',
            dueDate: '$dueDate',
            total: '$total',
            balance: '$balance',
            status: '$status',
            aging: '$aging'
          }
        }
      }
    },
    { $sort: { totalOutstanding: -1 } }
  ]);

  // Group by aging buckets
  const agingSummary = {
    current: 0,
    overdue1_30: 0,
    overdue31_60: 0,
    overdue61_90: 0,
    overdue90_plus: 0,
    total: 0
  };

  report.forEach(customer => {
    customer.invoices.forEach(invoice => {
      if (invoice.aging <= 0) {
        agingSummary.current += invoice.balance;
      } else if (invoice.aging <= 30) {
        agingSummary.overdue1_30 += invoice.balance;
      } else if (invoice.aging <= 60) {
        agingSummary.overdue31_60 += invoice.balance;
      } else if (invoice.aging <= 90) {
        agingSummary.overdue61_90 += invoice.balance;
      } else {
        agingSummary.overdue90_plus += invoice.balance;
      }
      agingSummary.total += invoice.balance;
    });
  });

  res.status(200).json({
    success: true,
    asOfDate: reportDate,
    summary: agingSummary,
    data: report,
    totalCustomers: report.length
  });
});
