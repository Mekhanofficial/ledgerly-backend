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
  duplicateInvoice
} = require('../controllers/invoiceController');
const { protect, authorize } = require('../middleware/auth');

// All routes are protected
router.use(protect);

// Public invoice view (for customers)
router.get('/public/:id', async (req, res) => {
  // This would be for sharing invoices via link
  // Implement token-based access
});

// Invoice routes
router.route('/')
  .get(authorize('admin', 'accountant', 'sales', 'viewer'), getInvoices)
  .post(authorize('admin', 'accountant', 'sales'), createInvoice);

router.route('/:id')
  .get(authorize('admin', 'accountant', 'sales', 'viewer'), getInvoice)
  .put(authorize('admin', 'accountant', 'sales'), updateInvoice)
  .delete(authorize('admin', 'accountant'), deleteInvoice);

// Invoice actions
router.post('/:id/send', authorize('admin', 'accountant', 'sales'), sendInvoice);
router.get('/:id/pdf', authorize('admin', 'accountant', 'sales', 'viewer'), getInvoicePDF);
router.post('/:id/payment', authorize('admin', 'accountant', 'sales'), recordPayment);
router.post('/:id/reminder', authorize('admin', 'accountant'), sendReminder);
router.post('/duplicate/:id', authorize('admin', 'accountant', 'sales'), duplicateInvoice);

// Reports
router.get('/outstanding', authorize('admin', 'accountant', 'sales', 'viewer'), getOutstanding);
router.get('/aging-report', authorize('admin', 'accountant'), getAgingReport);

// Recurring invoices
router.get('/recurring', authorize('admin', 'accountant', 'sales', 'viewer'), async (req, res) => {
  // Get all recurring invoices
});

router.post('/:id/recurring', authorize('admin', 'accountant', 'sales'), async (req, res) => {
  // Convert to recurring
});

router.put('/recurring/:id/pause', authorize('admin', 'accountant'), async (req, res) => {
  // Pause recurring invoice
});

router.put('/recurring/:id/resume', authorize('admin', 'accountant'), async (req, res) => {
  // Resume recurring invoice
});

// Bulk actions
router.post('/bulk/send', authorize('admin', 'accountant'), async (req, res) => {
  // Send multiple invoices
});

router.post('/bulk/reminders', authorize('admin', 'accountant'), async (req, res) => {
  // Send reminders for multiple invoices
});

module.exports = router;