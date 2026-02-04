const Receipt = require('../models/Receipt');
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Business = require('../models/Business');
const InventoryTransaction = require('../models/InventoryTransaction');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const sendEmail = require('../utils/email');
const generatePDF = require('../utils/generatePDF');

const ensureWalkInCustomer = async (req, fallbackName = 'Walk-in Customer') => {
  const existing = await Customer.findOne({
    business: req.user.business,
    name: fallbackName
  });

  if (existing) {
    return existing._id;
  }

  const generatedEmail = `walkin-${Date.now()}@invoiceflow.local`;
  const newCustomer = await Customer.create({
    business: req.user.business,
    name: fallbackName,
    email: generatedEmail,
    phone: '0000000000',
    createdBy: req.user.id
  });

  return newCustomer._id;
};

// @desc    Get all receipts
// @route   GET /api/v1/receipts
// @access  Private
exports.getReceipts = asyncHandler(async (req, res, next) => {
  const {
    customer,
    startDate,
    endDate,
    paymentMethod,
    search,
    page = 1,
    limit = 20
  } = req.query;
  
  let query = { business: req.user.business, isVoid: false };
  
  if (customer) query.customer = customer;
  if (paymentMethod) query.paymentMethod = paymentMethod;
  
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }
  
  if (search) {
    query.$or = [
      { receiptNumber: { $regex: search, $options: 'i' } },
      { 'customer.name': { $regex: search, $options: 'i' } },
      { paymentReference: { $regex: search, $options: 'i' } }
    ];
  }
  
  const receipts = await Receipt.find(query)
    .populate('customer', 'name email phone')
    .populate('cashier', 'name')
    .sort({ date: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));
    
  const total = await Receipt.countDocuments(query);
  
  // Calculate totals
  const totals = await Receipt.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$total' },
        totalReceipts: { $sum: 1 }
      }
    }
  ]);
  
  res.status(200).json({
    success: true,
    count: receipts.length,
    total,
    pages: Math.ceil(total / limit),
    summary: totals[0] || { totalAmount: 0, totalReceipts: 0 },
    data: receipts
  });
});

// @desc    Create receipt (POS)
// @route   POST /api/v1/receipts
// @access  Private
exports.createReceipt = asyncHandler(async (req, res, next) => {
  const { customer, items, paymentMethod, amountPaid, notes } = req.body;
  
  // Calculate totals
  let subtotal = 0;
  const processedItems = [];
  
  for (const item of items) {
    let product = null;
    if (item.product) {
      product = await Product.findById(item.product);
    }
    
    const unitPrice = item.unitPrice || (product ? product.sellingPrice : 0);
    const quantity = item.quantity || 1;
    const taxRate = item.taxRate || (product ? product.taxRate : 0);
    
    const itemTotal = unitPrice * quantity;
    const taxAmount = itemTotal * (taxRate / 100);
    const total = itemTotal + taxAmount;
    
    subtotal += itemTotal;
    
    processedItems.push({
      description: item.description || (product ? product.name : 'Item'),
      quantity,
      unitPrice,
      total,
      taxRate,
      taxAmount
    });
    
    // Update inventory if product exists and tracks inventory
    if (product && product.trackInventory) {
      product.stock.quantity -= quantity;
      product.stock.available = product.stock.quantity - product.stock.reserved;
      await product.save();
      
      // Create inventory transaction
      await InventoryTransaction.create({
        business: req.user.business,
        product: product._id,
        type: 'sale',
        quantity: -quantity,
        reference: `Receipt`,
        notes: 'POS sale',
        createdBy: req.user.id
      });
    }
  }
  
  const tax = subtotal * 0.1; // Default 10% tax
  const total = subtotal + tax;
  const change = amountPaid - total;
  
  // Handle customer
  let customerId = customer;
  if (!customerId && req.body.customerEmail) {
    // Find or create customer
    let existingCustomer = await Customer.findOne({
      business: req.user.business,
      email: req.body.customerEmail
    });
    
    if (!existingCustomer) {
      existingCustomer = await Customer.create({
        business: req.user.business,
        name: req.body.customerName || 'Walk-in Customer',
        email: req.body.customerEmail,
        phone: req.body.customerPhone,
        createdBy: req.user.id
      });
    }
    
    customerId = existingCustomer._id;
  }

  if (!customerId) {
    customerId = await ensureWalkInCustomer(req, req.body.customerName || 'Walk-in Customer');
  }
  
  const business = await Business.findById(req.user.business);
  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  const receiptNumber = await business.getNextReceiptNumber();

  // Create receipt
  let receipt;
  try {
    receipt = await Receipt.create({
      business: req.user.business,
      customer: customerId,
      items: processedItems,
      subtotal,
      tax: {
        amount: tax,
        percentage: 10
      },
    total,
    amountPaid,
    change,
    paymentMethod,
    cashier: req.user.id,
    notes,
    paymentMethod,
    cashier: req.user.id,
    notes,
    receiptNumber,
    createdBy: req.user.id
    });
  } catch (error) {
    console.error('Receipt creation failed', {
      message: error.message,
      body: req.body,
      stack: error.stack
    });
    return next(new ErrorResponse(error.message || 'Unable to create receipt', 400));
  }
  
  // Update customer stats
  if (customerId) {
    await Customer.updateCustomerStats(customerId);
  }
  
  res.status(201).json({
    success: true,
    data: receipt,
    change
  });
});

// @desc    Create receipt from invoice
// @route   POST /api/v1/receipts/from-invoice/:invoiceId
// @access  Private
exports.createReceiptFromInvoice = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findOne({
    _id: req.params.invoiceId,
    business: req.user.business
  }).populate('customer');
  
  if (!invoice) {
    return next(new ErrorResponse(`Invoice not found with id ${req.params.invoiceId}`, 404));
  }
  
  if (invoice.status !== 'paid') {
    return next(new ErrorResponse('Invoice is not paid', 400));
  }
  
  // Create receipt from invoice
  const receipt = await Receipt.create({
    business: req.user.business,
    invoice: invoice._id,
    customer: invoice.customer._id,
    items: invoice.items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      taxRate: item.taxRate,
      taxAmount: item.taxAmount
    })),
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    total: invoice.total,
    amountPaid: invoice.amountPaid,
    paymentMethod: invoice.paymentMethod,
    createdBy: req.user.id
  });
  
  res.status(201).json({
    success: true,
    data: receipt
  });
});

// @desc    Void receipt
// @route   POST /api/v1/receipts/:id/void
// @access  Private
exports.voidReceipt = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;
  
  const receipt = await Receipt.findOne({
    _id: req.params.id,
    business: req.user.business
  });
  
  if (!receipt) {
    return next(new ErrorResponse(`Receipt not found with id ${req.params.id}`, 404));
  }
  
  if (receipt.isVoid) {
    return next(new ErrorResponse('Receipt is already voided', 400));
  }
  
  // Restore inventory
  for (const item of receipt.items) {
    if (item.product) {
      const product = await Product.findById(item.product);
      
      if (product && product.trackInventory) {
        product.stock.quantity += item.quantity;
        product.stock.available = product.stock.quantity - product.stock.reserved;
        await product.save();
        
        // Create inventory transaction
        await InventoryTransaction.create({
          business: req.user.business,
          product: product._id,
          type: 'return',
          quantity: item.quantity,
          reference: `Receipt Voided: ${receipt.receiptNumber}`,
          notes: `Voided: ${reason}`,
          createdBy: req.user.id
        });
      }
    }
  }
  
  // Update receipt
  receipt.isVoid = true;
  receipt.voidReason = reason;
  receipt.voidedBy = req.user.id;
  receipt.voidedAt = new Date();
  await receipt.save();
  
  // Update customer stats
  await Customer.updateCustomerStats(receipt.customer);
  
  res.status(200).json({
    success: true,
    message: 'Receipt voided successfully',
    data: receipt
  });
});

// @desc    Get receipt PDF
// @route   GET /api/v1/receipts/:id/pdf
// @access  Private
exports.getReceiptPDF = asyncHandler(async (req, res, next) => {
  const receipt = await Receipt.findById(req.params.id)
    .populate('customer')
    .populate('business');
  
  if (!receipt) {
    return next(new ErrorResponse(`Receipt not found with id ${req.params.id}`, 404));
  }
  
  if (receipt.business._id.toString() !== req.user.business.toString()) {
    return next(new ErrorResponse('Not authorized to access this receipt', 403));
  }
  
  const pdfBuffer = await generatePDF.receipt(receipt);
  
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename=receipt-${receipt.receiptNumber}.pdf`,
    'Content-Length': pdfBuffer.length
  });
  
  res.send(pdfBuffer);
});

// @desc    Email receipt
// @route   POST /api/v1/receipts/:id/email
// @access  Private
exports.emailReceipt = asyncHandler(async (req, res, next) => {
  const receipt = await Receipt.findById(req.params.id)
    .populate('customer')
    .populate('business');
  
  if (!receipt) {
    return next(new ErrorResponse(`Receipt not found with id ${req.params.id}`, 404));
  }
  
  if (!receipt.customer.email) {
    return next(new ErrorResponse('Customer does not have an email address', 400));
  }
  
  const pdfBuffer = await generatePDF.receipt(receipt);
  
  await sendEmail({
    to: receipt.customer.email,
    subject: `Receipt ${receipt.receiptNumber} from ${receipt.business.name}`,
    template: 'receipt',
    context: {
      customerName: receipt.customer.name,
      businessName: receipt.business.name,
      receiptNumber: receipt.receiptNumber,
      paymentDate: receipt.date.toLocaleDateString(),
      amountPaid: receipt.amountPaid.toFixed(2),
      paymentMethod: receipt.paymentMethod
    },
    attachments: [{
      filename: `receipt-${receipt.receiptNumber}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }]
  });
  
  res.status(200).json({
    success: true,
    message: 'Receipt emailed successfully'
  });
});
