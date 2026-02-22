const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getTaxSettings,
  updateTaxSettings
} = require('../controllers/taxSettingsController');

router.use(protect);

router
  .route('/')
  .get(authorize('super_admin', 'admin', 'accountant', 'staff', 'viewer', 'client'), getTaxSettings)
  .put(authorize('super_admin', 'admin'), updateTaxSettings);

module.exports = router;
