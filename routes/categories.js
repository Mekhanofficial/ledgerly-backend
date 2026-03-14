const express = require('express');
const router = express.Router();
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/categoryController');
const { protect, authorize } = require('../middleware/auth');
const { checkFeatureAccess } = require('../middleware/subscription');

router.use(protect);

router.route('/')
  .get(authorize('admin', 'accountant', 'staff', 'viewer'), checkFeatureAccess('inventory'), getCategories)
  .post(authorize('admin', 'accountant'), checkFeatureAccess('inventory'), createCategory);

router.route('/:id')
  .put(authorize('admin', 'accountant'), checkFeatureAccess('inventory'), updateCategory)
  .delete(authorize('admin', 'accountant'), checkFeatureAccess('inventory'), deleteCategory);

module.exports = router;
