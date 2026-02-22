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
  .get(authorize('admin', 'accountant'), checkFeatureAccess('advancedReporting'), listReports)
  .post(authorize('admin', 'accountant'), checkFeatureAccess('advancedReporting'), createReport);

router.route('/history/:id')
  .patch(authorize('admin', 'accountant'), checkFeatureAccess('advancedReporting'), updateReport)
  .delete(authorize('admin', 'accountant'), checkFeatureAccess('advancedReporting'), deleteReport);

router.post('/history/:id/download', authorize('admin', 'accountant'), checkFeatureAccess('advancedReporting'), recordDownload);

module.exports = router;
