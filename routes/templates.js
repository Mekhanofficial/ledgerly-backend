const express = require('express');
const router = express.Router();
const {
  getTemplates,
  createCustomTemplate,
  purchaseTemplate,
  getTemplatePurchases
} = require('../controllers/templateController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get(
  '/',
  authorize('admin', 'accountant', 'sales', 'viewer'),
  getTemplates
);

router.post(
  '/custom',
  authorize('admin', 'accountant', 'sales'),
  createCustomTemplate
);

router.get(
  '/purchases',
  authorize('admin', 'accountant', 'sales', 'viewer'),
  getTemplatePurchases
);

router.post(
  '/:id/purchase',
  authorize('admin', 'accountant', 'sales'),
  purchaseTemplate
);

module.exports = router;
