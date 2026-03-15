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
const { protect, authorize, authorizePermission } = require('../middleware/auth');
const uploadImage = require('../middleware/uploadImage');

router.use(protect);

router.route('/')
  .get(authorize('admin', 'accountant', 'staff', 'viewer'), getBusinessProfile)
  .put(
    authorizePermission('settings', 'update'),
    uploadImage.single('logo'),
    updateBusinessProfile
  );

router.get('/payment-methods', authorizePermission('settings', 'view'), getPaymentMethods);
router.post('/payment-methods', authorizePermission('settings', 'update'), addPaymentMethod);
router.put('/payment-methods/:methodId', authorizePermission('settings', 'update'), updatePaymentMethod);
router.delete('/payment-methods/:methodId', authorizePermission('settings', 'update'), removePaymentMethod);

router.get('/paystack', authorizePermission('settings', 'view'), getPaystackSettings);
router.put('/paystack', authorizePermission('settings', 'update'), updatePaystackSettings);
router.delete('/paystack', authorizePermission('settings', 'update'), removePaystackSettings);

router.put('/tax-settings', authorizePermission('settings', 'update'), updateTaxSettings);
router.put('/invoice-settings', authorizePermission('settings', 'update'), updateInvoiceSettings);

module.exports = router;
