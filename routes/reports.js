const express = require('express');
const router = express.Router();
const {
  getDashboard,
  getSalesReport,
  getInventoryReport,
  getProfitLossReport
} = require('../controllers/reportController');
const {
  listReports,
  createReport,
  updateReport,
  deleteReport,
  recordDownload
} = require('../controllers/generatedReportController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/dashboard', authorize('admin', 'accountant', 'sales', 'viewer'), getDashboard);
router.get('/sales', authorize('admin', 'accountant', 'sales', 'viewer'), getSalesReport);
router.get('/inventory', authorize('admin', 'accountant', 'sales', 'viewer'), getInventoryReport);
router.get('/profit-loss', authorize('admin', 'accountant'), getProfitLossReport);

router.route('/history')
  .get(authorize('admin', 'accountant', 'sales', 'viewer'), listReports)
  .post(authorize('admin', 'accountant', 'sales'), createReport);

router.route('/history/:id')
  .patch(authorize('admin', 'accountant', 'sales'), updateReport)
  .delete(authorize('admin', 'accountant'), deleteReport);

router.post('/history/:id/download', authorize('admin', 'accountant', 'sales', 'viewer'), recordDownload);

module.exports = router;
