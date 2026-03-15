const express = require('express');
const router = express.Router();
const {
  getInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  sendInvoice,
  getInvoicePDF,
  recordPayment,
  sendReminder,
  getOutstanding,
  getAgingReport,
  duplicateInvoice,
  getRecurringInvoices,
  setInvoiceRecurring,
  pauseRecurringInvoice,
  resumeRecurringInvoice,
  generateRecurringInvoiceNow,
  cancelRecurringInvoice
} = require('../controllers/invoiceController');
const {
  getPublicInvoice,
  initializePublicInvoicePaystackPayment,
  redirectPublicInvoicePaymentPortal
} = require('../controllers/invoicePaymentController');
const { protect, authorize, authorizePermission } = require('../middleware/auth');
const {
  checkSubscription,
  checkInvoiceLimit,
  checkFeatureAccess
} = require('../middleware/subscription');

// Public invoice view (for customers)
router.get('/public/:slug', getPublicInvoice);
router.get('/public/:slug/pay', redirectPublicInvoicePaymentPortal);
router.post('/public/:slug/paystack/initialize', initializePublicInvoicePaystackPayment);

// All remaining routes are protected
router.use(protect);

// Invoice routes
router.route('/')
  .get(authorizePermission('invoices', 'read'), getInvoices)
  .post(
    authorizePermission('invoices', 'create'),
    checkSubscription(),
    checkInvoiceLimit,
    createInvoice
  );

// Reports
router.get('/outstanding', authorizePermission('reports', 'view'), getOutstanding);
router.get('/aging-report', authorizePermission('reports', 'view'), getAgingReport);

// Recurring invoices
router.get(
  '/recurring',
  authorizePermission('invoices', 'read'),
  checkFeatureAccess('recurring'),
  getRecurringInvoices
);
router.post(
  '/:id/recurring',
  authorizePermission('invoices', 'update'),
  checkFeatureAccess('recurring'),
  setInvoiceRecurring
);
router.put(
  '/recurring/:id/pause',
  authorizePermission('invoices', 'update'),
  checkFeatureAccess('recurring'),
  pauseRecurringInvoice
);
router.put(
  '/recurring/:id/resume',
  authorizePermission('invoices', 'update'),
  checkFeatureAccess('recurring'),
  resumeRecurringInvoice
);
router.post(
  '/recurring/:id/generate',
  authorizePermission('invoices', 'create'),
  checkFeatureAccess('recurring'),
  generateRecurringInvoiceNow
);
router.put(
  '/recurring/:id/cancel',
  authorizePermission('invoices', 'update'),
  checkFeatureAccess('recurring'),
  cancelRecurringInvoice
);

router.post(
  '/duplicate/:id',
  authorizePermission('invoices', 'create'),
  checkSubscription(),
  checkInvoiceLimit,
  duplicateInvoice
);

// Invoice actions
router.post('/:id/send', authorizePermission('invoices', 'update'), checkSubscription(), sendInvoice);
router.get('/:id/pdf', authorizePermission('invoices', 'read'), checkSubscription(), getInvoicePDF);
router.post('/:id/payment', authorize('admin', 'accountant', 'client'), recordPayment);
router.post('/:id/reminder', authorizePermission('invoices', 'update'), sendReminder);

router.route('/:id')
  .get(authorizePermission('invoices', 'read'), getInvoice)
  .put(authorizePermission('invoices', 'update'), updateInvoice)
  .delete(authorizePermission('invoices', 'delete'), deleteInvoice);

// Bulk actions
router.post('/bulk/send', authorizePermission('invoices', 'update'), async (req, res) => {
  // Send multiple invoices
});

router.post('/bulk/reminders', authorizePermission('invoices', 'update'), async (req, res) => {
  // Send reminders for multiple invoices
});

module.exports = router;
