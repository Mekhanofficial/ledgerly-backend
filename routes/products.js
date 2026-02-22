const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  adjustStock,
  getLowStockProducts
} = require('../controllers/productController');
const { protect, authorize } = require('../middleware/auth');
const { checkFeatureAccess } = require('../middleware/subscription');

router.use(protect);
router.use(checkFeatureAccess('inventory'));

router.route('/')
  .get(authorize('admin', 'accountant', 'staff', 'viewer'), getProducts)
  .post(authorize('admin', 'accountant'), createProduct);

router.route('/:id')
  .get(authorize('admin', 'accountant', 'staff', 'viewer'), getProduct)
  .put(authorize('admin', 'accountant'), updateProduct);

router.post('/:id/adjust-stock', authorize('admin', 'accountant'), adjustStock);
router.get('/low-stock', authorize('admin', 'accountant'), getLowStockProducts);

module.exports = router;
