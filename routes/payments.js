const express = require('express');
const router = express.Router();
const {
  getPayments,
  getPayment,
  createPayment,
  refundPayment
} = require('../controllers/paymentController');
const {
  initializeSubscriptionPayment,
  initializeTemplatePayment,
  verifyPayment,
  paystackWebhook
} = require('../controllers/monetizationController');
const { verifyPublicInvoicePayment } = require('../controllers/invoicePaymentController');
const { protect, authorize } = require('../middleware/auth');

// Paystack webhook (no auth)
router.post('/webhook', paystackWebhook);
router.get('/verify', verifyPublicInvoicePayment);

router.use(protect);

router.post('/initialize-subscription', authorize('admin', 'super_admin'), initializeSubscriptionPayment);
router.post('/initialize-template', authorize('admin', 'accountant', 'staff'), initializeTemplatePayment);
router.get('/verify/:reference', authorize('admin', 'accountant', 'staff', 'client'), verifyPayment);

router.route('/')
  .get(authorize('admin', 'accountant', 'client'), getPayments)
  .post(authorize('admin', 'accountant'), createPayment);

router.get('/:id', authorize('admin', 'accountant', 'client'), getPayment);
router.post('/:id/refund', authorize('admin', 'accountant'), refundPayment);

module.exports = router;
