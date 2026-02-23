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
  updateInvoiceSettings,
  getPaystackSettings,
  updatePaystackSettings,
  removePaystackSettings
} = require('../controllers/businessController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(authorize('admin', 'accountant', 'staff', 'viewer'), getBusinessProfile)
  .put(authorize('super_admin', 'admin', 'accountant'), updateBusinessProfile);

router.get('/payment-methods', authorize('admin', 'accountant'), getPaymentMethods);
router.post('/payment-methods', authorize('admin', 'accountant'), addPaymentMethod);
router.put('/payment-methods/:methodId', authorize('admin', 'accountant'), updatePaymentMethod);
router.delete('/payment-methods/:methodId', authorize('admin', 'accountant'), removePaymentMethod);

router.get('/paystack', authorize('admin', 'accountant'), getPaystackSettings);
router.put('/paystack', authorize('admin', 'accountant'), updatePaystackSettings);
router.delete('/paystack', authorize('admin', 'accountant'), removePaystackSettings);

router.put('/tax-settings', authorize('admin', 'accountant'), updateTaxSettings);
router.put('/invoice-settings', authorize('admin', 'accountant'), updateInvoiceSettings);

module.exports = router;
