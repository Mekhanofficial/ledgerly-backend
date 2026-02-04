const express = require('express');
const router = express.Router();
const {
  getReceipts,
  createReceipt,
  createReceiptFromInvoice,
  voidReceipt,
  getReceiptPDF,
  emailReceipt
} = require('../controllers/receiptController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(authorize('admin', 'accountant', 'sales', 'viewer'), getReceipts)
  .post(authorize('admin', 'accountant', 'sales'), createReceipt);

router.post('/from-invoice/:invoiceId', authorize('admin', 'accountant', 'sales'), createReceiptFromInvoice);
router.post('/:id/void', authorize('admin', 'accountant'), voidReceipt);
router.get('/:id/pdf', authorize('admin', 'accountant', 'sales', 'viewer'), getReceiptPDF);
router.post('/:id/email', authorize('admin', 'accountant', 'sales'), emailReceipt);

module.exports = router;