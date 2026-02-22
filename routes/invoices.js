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
  resumeRecurringInvoice
} = require('../controllers/invoiceController');
const { protect, authorize } = require('../middleware/auth');
const {
  checkSubscription,
  checkInvoiceLimit,
  checkFeatureAccess
} = require('../middleware/subscription');

// All routes are protected
router.use(protect);

// Public invoice view (for customers)
router.get('/public/:id', async (req, res) => {
  // This would be for sharing invoices via link
  // Implement token-based access
});

// Invoice routes
router.route('/')
  .get(authorize('admin', 'accountant', 'staff', 'viewer', 'client'), getInvoices)
  .post(
    authorize('admin', 'accountant', 'staff'),
    checkSubscription(),
    checkInvoiceLimit,
    createInvoice
  );

// Reports
router.get('/outstanding', authorize('admin', 'accountant'), getOutstanding);
router.get('/aging-report', authorize('admin', 'accountant'), getAgingReport);

// Recurring invoices
router.get(
  '/recurring',
  authorize('admin', 'accountant', 'staff', 'viewer'),
  getRecurringInvoices
);
router.post(
  '/:id/recurring',
  authorize('admin', 'accountant', 'staff'),
  checkFeatureAccess('recurring'),
  setInvoiceRecurring
);
router.put(
  '/recurring/:id/pause',
  authorize('admin', 'accountant', 'staff'),
  pauseRecurringInvoice
);
router.put(
  '/recurring/:id/resume',
  authorize('admin', 'accountant', 'staff'),
  resumeRecurringInvoice
);

router.post(
  '/duplicate/:id',
  authorize('admin', 'accountant', 'staff'),
  checkSubscription(),
  checkInvoiceLimit,
  duplicateInvoice
);

// Invoice actions
router.post('/:id/send', authorize('admin', 'accountant', 'staff'), checkSubscription(), sendInvoice);
router.get('/:id/pdf', authorize('admin', 'accountant', 'staff', 'viewer', 'client'), checkSubscription(), getInvoicePDF);
router.post('/:id/payment', authorize('admin', 'accountant', 'client'), recordPayment);
router.post('/:id/reminder', authorize('admin', 'accountant'), sendReminder);

router.route('/:id')
  .get(authorize('admin', 'accountant', 'staff', 'viewer', 'client'), getInvoice)
  .put(authorize('admin', 'accountant', 'staff'), updateInvoice)
  .delete(authorize('super_admin'), deleteInvoice);

// Bulk actions
router.post('/bulk/send', authorize('admin', 'accountant'), async (req, res) => {
  // Send multiple invoices
});

router.post('/bulk/reminders', authorize('admin', 'accountant'), async (req, res) => {
  // Send reminders for multiple invoices
});

module.exports = router;
