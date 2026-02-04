const express = require('express');
const router = express.Router();
const {
  getSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier
} = require('../controllers/supplierController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getSuppliers)
  .post(createSupplier);

router.route('/:id')
  .put(updateSupplier)
  .delete(deleteSupplier);

module.exports = router;
