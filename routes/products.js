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
const uploadCloudinaryImage = require('../middleware/uploadImage');

const uploadProductImage = uploadCloudinaryImage.fields([
  { name: 'image', maxCount: 1 },
  { name: 'productImage', maxCount: 1 }
]);

router.use(protect);

router.route('/')
  .get(authorize('admin', 'accountant', 'staff', 'viewer'), checkFeatureAccess('inventory'), getProducts)
  .post(
    authorize('admin', 'accountant'),
    checkFeatureAccess('inventory'),
    uploadProductImage,
    createProduct
  );

router.get('/low-stock', authorize('admin', 'accountant'), checkFeatureAccess('inventory'), getLowStockProducts);

router.route('/:id')
  .get(authorize('admin', 'accountant', 'staff', 'viewer'), checkFeatureAccess('inventory'), getProduct)
  .put(
    authorize('admin', 'accountant'),
    checkFeatureAccess('inventory'),
    uploadProductImage,
    updateProduct
  );

router.post('/:id/adjust-stock', authorize('admin', 'accountant'), checkFeatureAccess('inventory'), adjustStock);

module.exports = router;
