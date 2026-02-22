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
  .get(authorize('admin', 'accountant'), getReceipts)
  .post(authorize('admin', 'accountant'), createReceipt);

router.post('/from-invoice/:invoiceId', authorize('admin', 'accountant'), createReceiptFromInvoice);
router.post('/:id/void', authorize('admin', 'accountant'), voidReceipt);
router.get('/:id/pdf', authorize('admin', 'accountant'), getReceiptPDF);
router.post('/:id/email', authorize('admin', 'accountant'), emailReceipt);

module.exports = router;
