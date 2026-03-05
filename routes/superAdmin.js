const express = require('express');
const router = express.Router();
const {
  getOverview,
  getUsers,
  updateUser,
  getBusinesses,
  updateBusiness,
  getInvoices,
  getPayments,
  getCustomers,
  getProducts,
  getReceipts,
  getPartners,
  createPartner,
  updatePartner,
  rotatePartnerKey,
  getPartnerTemplateOptions
} = require('../controllers/superAdminController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/overview', authorize('super_admin'), getOverview);
router.get('/users', authorize('super_admin'), getUsers);
router.put('/users/:id', authorize('super_admin'), updateUser);
router.get('/businesses', authorize('super_admin'), getBusinesses);
router.put('/businesses/:id', authorize('super_admin'), updateBusiness);
router.get('/invoices', authorize('super_admin'), getInvoices);
router.get('/payments', authorize('super_admin'), getPayments);
router.get('/customers', authorize('super_admin'), getCustomers);
router.get('/products', authorize('super_admin'), getProducts);
router.get('/receipts', authorize('super_admin'), getReceipts);
router.get('/partner-template-options', authorize('super_admin'), getPartnerTemplateOptions);
router.get('/partners', authorize('super_admin'), getPartners);
router.post('/partners', authorize('super_admin'), createPartner);
router.put('/partners/:id', authorize('super_admin'), updatePartner);
router.post('/partners/:id/rotate-key', authorize('super_admin'), rotatePartnerKey);

module.exports = router;
