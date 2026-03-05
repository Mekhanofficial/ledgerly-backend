const express = require('express');
const router = express.Router();
const {
  getPartnerTemplates,
  createPartnerInvoice,
  getPartnerInvoice,
  getPartnerInvoicePDF
} = require('../controllers/partnerController');
const {
  protectPartner,
  authorizePartnerScopes,
  partnerRateLimit
} = require('../middleware/partnerAuth');

router.use(protectPartner);
router.use(partnerRateLimit);

router.get(
  '/templates',
  authorizePartnerScopes('templates:read'),
  getPartnerTemplates
);

router.post(
  '/invoices',
  authorizePartnerScopes('invoices:create'),
  createPartnerInvoice
);

router.get(
  '/invoices/:id',
  authorizePartnerScopes('invoices:read'),
  getPartnerInvoice
);

router.get(
  '/invoices/:id/pdf',
  authorizePartnerScopes('invoices:read'),
  getPartnerInvoicePDF
);

module.exports = router;
