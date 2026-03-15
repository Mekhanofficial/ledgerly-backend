const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  getLowStockProducts
} = require('../controllers/productController');
const { protect, authorizePermission } = require('../middleware/auth');
const { checkFeatureAccess } = require('../middleware/subscription');
const uploadCloudinaryImage = require('../middleware/uploadImage');

const uploadProductImage = uploadCloudinaryImage.fields([
  { name: 'image', maxCount: 1 },
  { name: 'productImage', maxCount: 1 }
]);

router.use(protect);

router.route('/')
  .get(authorizePermission('products', 'read'), checkFeatureAccess('inventory'), getProducts)
  .post(
    authorizePermission('products', 'create'),
    checkFeatureAccess('inventory'),
    uploadProductImage,
    createProduct
  );

router.get('/low-stock', authorizePermission('products', 'read'), checkFeatureAccess('inventory'), getLowStockProducts);

router.route('/:id')
  .get(authorizePermission('products', 'read'), checkFeatureAccess('inventory'), getProduct)
  .put(
    authorizePermission('products', 'update'),
    checkFeatureAccess('inventory'),
    uploadProductImage,
    updateProduct
  )
  .delete(authorizePermission('products', 'delete'), checkFeatureAccess('inventory'), deleteProduct);

router.post('/:id/adjust-stock', authorizePermission('products', 'update'), checkFeatureAccess('inventory'), adjustStock);

module.exports = router;
