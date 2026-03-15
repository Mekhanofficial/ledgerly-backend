const express = require('express');
const router = express.Router();
const {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier
} = require('../controllers/supplierController');
const { protect, authorizePermission } = require('../middleware/auth');
const { checkFeatureAccess } = require('../middleware/subscription');

router.use(protect);

router.route('/')
  .get(authorizePermission('products', 'read'), checkFeatureAccess('inventory'), getSuppliers)
  .post(authorizePermission('products', 'create'), checkFeatureAccess('inventory'), createSupplier);

router.route('/:id')
  .put(authorizePermission('products', 'update'), checkFeatureAccess('inventory'), updateSupplier)
  .delete(authorizePermission('products', 'delete'), checkFeatureAccess('inventory'), deleteSupplier);

module.exports = router;
