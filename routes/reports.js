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
const { checkFeatureAccess } = require('../middleware/subscription');

router.use(protect);

router.get('/dashboard', authorize('admin', 'accountant'), getDashboard);
router.get('/sales', authorize('admin', 'accountant'), getSalesReport);
router.get('/inventory', authorize('admin', 'accountant'), checkFeatureAccess('inventory'), getInventoryReport);
router.get('/profit-loss', authorize('admin', 'accountant'), checkFeatureAccess('advancedReporting'), getProfitLossReport);

router.route('/history')
  .get(authorize('admin', 'accountant'), listReports)
  .post(authorize('admin', 'accountant'), createReport);

router.route('/history/:id')
  .patch(authorize('admin', 'accountant'), updateReport)
  .delete(authorize('admin', 'accountant'), deleteReport);

router.post('/history/:id/download', authorize('admin', 'accountant'), recordDownload);

module.exports = router;
