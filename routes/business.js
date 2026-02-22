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
  .get(authorize('admin', 'accountant', 'staff', 'viewer'), getBusinessProfile)
  .put(authorize('super_admin'), updateBusinessProfile);

router.get('/payment-methods', authorize('super_admin'), getPaymentMethods);
router.post('/payment-methods', authorize('super_admin'), addPaymentMethod);
router.put('/payment-methods/:methodId', authorize('super_admin'), updatePaymentMethod);
router.delete('/payment-methods/:methodId', authorize('super_admin'), removePaymentMethod);

router.put('/tax-settings', authorize('super_admin'), updateTaxSettings);
router.put('/invoice-settings', authorize('super_admin'), updateInvoiceSettings);

module.exports = router;
