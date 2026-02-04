const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');
const AuditLog = require('../models/AuditLog');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');

const logAuditEntry = async (req, action, resource, details = {}) => {
  await AuditLog.create({
    business: req.user.business,
    user: req.user.id,
    action,
    resource,
    details
  });
};

// @desc    Get payments
// @route   GET /api/v1/payments
// @access  Private
exports.getPayments = asyncHandler(async (req, res) => {
  const { startDate, endDate, customer, status, paymentMethod, invoice } = req.query;
  const query = { business: req.user.business };

  if (startDate || endDate) {
    query.paymentDate = {};
    if (startDate) query.paymentDate.$gte = new Date(startDate);
    if (endDate) query.paymentDate.$lte = new Date(endDate);
  }

  if (customer) query.customer = customer;
  if (status) query.status = status;
  if (paymentMethod) query.paymentMethod = paymentMethod;
  if (invoice) query.invoice = invoice;

  const payments = await Payment.find(query)
    .populate('customer', 'name email')
    .populate('invoice', 'invoiceNumber')
    .sort({ paymentDate: -1 });

  const totalAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);

  res.status(200).json({
    success: true,
    count: payments.length,
    totalAmount,
    data: payments
  });
});

// @desc    Get single payment
// @route   GET /api/v1/payments/:id
// @access  Private
exports.getPayment = asyncHandler(async (req, res, next) => {
  const payment = await Payment.findOne({
    _id: req.params.id,
    business: req.user.business
  })
    .populate('customer', 'name email')
    .populate('invoice', 'invoiceNumber');

  if (!payment) {
    return next(new ErrorResponse('Payment not found', 404));
  }

  res.status(200).json({
    success: true,
    data: payment
  });
});

// @desc    Create payment record
// @route   POST /api/v1/payments
// @access  Private
exports.createPayment = asyncHandler(async (req, res, next) => {
  const { invoiceId, amount, paymentMethod, paymentReference, paymentGateway, notes, status, paymentDate } = req.body;

  if (!invoiceId || !amount || !paymentMethod) {
    return next(new ErrorResponse('invoiceId, amount, and paymentMethod are required', 400));
  }

  const invoice = await Invoice.findOne({
    _id: invoiceId,
    business: req.user.business
  });

  if (!invoice) {
    return next(new ErrorResponse('Invoice not found', 404));
  }

  if (amount <= 0) {
    return next(new ErrorResponse('Amount must be greater than 0', 400));
  }

  const maxPayable = invoice.balance;
  if (amount > maxPayable) {
    return next(new ErrorResponse(`Amount exceeds outstanding balance of ${maxPayable}`, 400));
  }

  await invoice.recordPayment(amount, { paymentMethod, paymentReference, paymentGateway });

  const payment = await Payment.create({
    business: req.user.business,
    invoice: invoice._id,
    customer: invoice.customer,
    amount,
    paymentMethod,
    paymentReference,
    paymentGateway,
    status: status || (invoice.balance <= 0 ? 'completed' : 'completed'),
    paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
    createdBy: req.user.id,
    notes
  });

  await logAuditEntry(req, 'create-payment', 'Payment', { paymentId: payment._id, invoice: invoice._id, amount });

  res.status(201).json({
    success: true,
    data: payment
  });
});

// @desc    Refund a payment
// @route   POST /api/v1/payments/:id/refund
// @access  Private (Admin/Accountant)
exports.refundPayment = asyncHandler(async (req, res, next) => {
  const { amount, reason } = req.body;

  const payment = await Payment.findOne({
    _id: req.params.id,
    business: req.user.business
  });

  if (!payment) {
    return next(new ErrorResponse('Payment not found', 404));
  }

  const refundable = payment.amount - (payment.refundAmount || 0);
  const refundAmount = amount || refundable;

  if (refundAmount <= 0 || refundAmount > refundable) {
    return next(new ErrorResponse('Invalid refund amount', 400));
  }

  payment.refundAmount += refundAmount;
  payment.refundReason = reason || 'Refund issued';
  payment.refundDate = new Date();
  payment.refundedBy = req.user.id;
  payment.status = payment.refundAmount >= payment.amount ? 'refunded' : 'refunded';
  await payment.save();

  const invoice = await Invoice.findById(payment.invoice);
  if (invoice) {
    invoice.amountPaid = Math.max(0, invoice.amountPaid - refundAmount);
    invoice.balance = invoice.total - invoice.amountPaid;
    if (invoice.balance >= invoice.total) {
      invoice.status = 'sent';
    } else if (invoice.balance > 0) {
      invoice.status = 'partial';
    }
    await invoice.save();
  }

  await logAuditEntry(req, 'refund-payment', 'Payment', { paymentId: payment._id, refundAmount });

  res.status(200).json({
    success: true,
    message: 'Refund processed',
    data: payment
  });
});
