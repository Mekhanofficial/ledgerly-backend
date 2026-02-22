const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getBillingSummary,
  updateSubscription,
  updateAddOns
} = require('../controllers/billingController');

router.use(protect);

router.get('/summary', authorize('admin', 'super_admin'), getBillingSummary);
router.put('/subscription', authorize('admin', 'super_admin'), updateSubscription);
router.put('/addons', authorize('admin', 'super_admin'), updateAddOns);

module.exports = router;
