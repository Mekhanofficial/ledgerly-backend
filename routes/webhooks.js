const express = require('express');

const router = express.Router();
const { paystackInvoiceWebhook } = require('../controllers/invoicePaymentController');

router.post('/paystack', paystackInvoiceWebhook);

module.exports = router;
