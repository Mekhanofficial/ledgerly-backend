const express = require('express');
const router = express.Router();
const {
  getBusinessProfile,
  updateBusinessProfile,
  getPaymentMethods,
  addPaymentMethod,
  updatePaymentMethod,
  removePaymentMethod,
  updateTaxSettings,
  updateInvoiceSettings
} = require('../controllers/businessController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(authorize('admin', 'accountant', 'sales', 'viewer'), getBusinessProfile)
  .put(authorize('admin', 'accountant'), updateBusinessProfile);

router.get('/payment-methods', authorize('admin', 'accountant'), getPaymentMethods);
router.post('/payment-methods', authorize('admin', 'accountant'), addPaymentMethod);
router.put('/payment-methods/:methodId', authorize('admin', 'accountant'), updatePaymentMethod);
router.delete('/payment-methods/:methodId', authorize('admin', 'accountant'), removePaymentMethod);

router.put('/tax-settings', authorize('admin', 'accountant'), updateTaxSettings);
router.put('/invoice-settings', authorize('admin', 'accountant'), updateInvoiceSettings);

module.exports = router;
