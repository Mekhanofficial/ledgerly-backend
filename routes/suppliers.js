const express = require('express');
const router = express.Router();
const {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier
} = require('../controllers/supplierController');
const { protect, authorize } = require('../middleware/auth');
const { checkFeatureAccess } = require('../middleware/subscription');

router.use(protect);
router.use(checkFeatureAccess('inventory'));

router.route('/')
  .get(authorize('admin', 'accountant', 'staff', 'viewer'), getSuppliers)
  .post(authorize('admin', 'accountant'), createSupplier);

router.route('/:id')
  .put(authorize('admin', 'accountant'), updateSupplier)
  .delete(authorize('admin', 'accountant'), deleteSupplier);

module.exports = router;
