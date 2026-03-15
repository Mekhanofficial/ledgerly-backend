const express = require('express');
const router = express.Router();
const {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerHistory,
  sendCustomerStatement,
  importCustomers
} = require('../controllers/customerController');
const { protect, authorizePermission } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(authorizePermission('customers', 'read'), getCustomers)
  .post(authorizePermission('customers', 'create'), createCustomer);

router.route('/:id')
  .get(authorizePermission('customers', 'read'), getCustomer)
  .put(authorizePermission('customers', 'update'), updateCustomer)
  .delete(authorizePermission('customers', 'delete'), deleteCustomer);

router.get('/:id/history', authorizePermission('customers', 'read'), getCustomerHistory);
router.post('/:id/send-statement', authorizePermission('customers', 'read'), sendCustomerStatement);
router.post('/import', authorizePermission('customers', 'create'), importCustomers);

module.exports = router;
