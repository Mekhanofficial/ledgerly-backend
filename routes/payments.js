const express = require('express');
const router = express.Router();
const {
  getPayments,
  getPayment,
  createPayment,
  refundPayment
} = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .get(authorize('admin', 'accountant', 'sales'), getPayments)
  .post(authorize('admin', 'accountant', 'sales'), createPayment);

router.get('/:id', authorize('admin', 'accountant', 'sales'), getPayment);
router.post('/:id/refund', authorize('admin', 'accountant'), refundPayment);

module.exports = router;
