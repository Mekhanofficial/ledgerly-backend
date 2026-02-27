const express = require('express');
const router = express.Router();
const {
  getTemplates,
  createCustomTemplate,
  updateTemplateEmailContent,
  purchaseTemplate,
  purchaseTemplateBundle,
  getTemplatePurchases
} = require('../controllers/templateController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get(
  '/',
  authorize('admin', 'accountant', 'staff', 'viewer'),
  getTemplates
);

router.post(
  '/custom',
  authorize('admin', 'accountant'),
  createCustomTemplate
);

router.put(
  '/:id/email-content',
  authorize('admin', 'accountant'),
  updateTemplateEmailContent
);

router.get(
  '/purchases',
  authorize('admin', 'accountant'),
  getTemplatePurchases
);

router.post(
  '/:id/purchase',
  authorize('admin', 'accountant'),
  purchaseTemplate
);

router.post(
  '/bundle/purchase',
  authorize('admin', 'accountant'),
  purchaseTemplateBundle
);

module.exports = router;
