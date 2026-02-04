const express = require('express');
const router = express.Router();
const { getStockAdjustments } = require('../controllers/inventoryController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(getStockAdjustments);

module.exports = router;
