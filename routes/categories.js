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
router.use(checkFeatureAccess('inventory'));

router.route('/')
  .get(authorize('admin', 'accountant', 'staff', 'viewer'), getCategories)
  .post(authorize('admin', 'accountant'), createCategory);

router.route('/:id')
  .put(authorize('admin', 'accountant'), updateCategory)
  .delete(authorize('admin', 'accountant'), deleteCategory);

module.exports = router;
