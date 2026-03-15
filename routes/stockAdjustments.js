const express = require('express');
const router = express.Router();
const { getStockAdjustments } = require('../controllers/inventoryController');
const { protect, authorizePermission } = require('../middleware/auth');
const { checkFeatureAccess } = require('../middleware/subscription');

router.use(protect);
router.use(checkFeatureAccess('inventory'));

router.route('/')
  .get(authorizePermission('products', 'update'), getStockAdjustments);

module.exports = router;
