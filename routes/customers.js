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
  .get(authorize('admin', 'accountant', 'staff', 'viewer'), getCustomers)
  .post(authorize('admin', 'staff'), createCustomer);

router.route('/:id')
  .get(authorize('admin', 'accountant', 'staff', 'viewer'), getCustomer)
  .put(authorize('admin', 'staff'), updateCustomer)
  .delete(authorize('admin'), deleteCustomer);

router.get('/:id/history', authorize('admin', 'accountant', 'staff'), getCustomerHistory);
router.post('/import', authorize('admin'), importCustomers);

module.exports = router;
