const express = require('express');
const router = express.Router();
const {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/categoryController');
const { protect, authorizePermission } = require('../middleware/auth');
const { checkFeatureAccess } = require('../middleware/subscription');

router.use(protect);

router.route('/')
  .get(authorizePermission('products', 'read'), checkFeatureAccess('inventory'), getCategories)
  .post(authorizePermission('products', 'create'), checkFeatureAccess('inventory'), createCategory);

router.route('/:id')
  .put(authorizePermission('products', 'update'), checkFeatureAccess('inventory'), updateCategory)
  .delete(authorizePermission('products', 'delete'), checkFeatureAccess('inventory'), deleteCategory);

module.exports = router;
