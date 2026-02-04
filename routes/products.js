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

router.use(protect);

router.route('/')
  .get(authorize('admin', 'accountant', 'sales', 'viewer'), getProducts)
  .post(authorize('admin', 'accountant', 'sales'), createProduct);

router.route('/:id')
  .get(authorize('admin', 'accountant', 'sales', 'viewer'), getProduct)
  .put(authorize('admin', 'accountant', 'sales'), updateProduct);

router.post('/:id/adjust-stock', authorize('admin', 'accountant', 'sales'), adjustStock);
router.get('/low-stock', authorize('admin', 'accountant', 'sales', 'viewer'), getLowStockProducts);

module.exports = router;