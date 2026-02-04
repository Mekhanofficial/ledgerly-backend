const express = require('express');
const router = express.Router();
const {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerHistory,
  importCustomers
} = require('../controllers/customerController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(authorize('admin', 'accountant', 'sales', 'viewer'), getCustomers)
  .post(authorize('admin', 'accountant', 'sales'), createCustomer);

router.route('/:id')
  .get(authorize('admin', 'accountant', 'sales', 'viewer'), getCustomer)
  .put(authorize('admin', 'accountant', 'sales'), updateCustomer)
  .delete(authorize('admin', 'accountant'), deleteCustomer);

router.get('/:id/history', authorize('admin', 'accountant', 'sales', 'viewer'), getCustomerHistory);
router.post('/import', authorize('admin', 'accountant'), importCustomers);

module.exports = router;