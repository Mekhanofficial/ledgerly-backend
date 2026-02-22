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
  getReceipts
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

module.exports = router;
