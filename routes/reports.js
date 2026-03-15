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
const { protect, authorizePermission } = require('../middleware/auth');
const { checkFeatureAccess } = require('../middleware/subscription');

router.use(protect);

router.get('/dashboard', authorizePermission('reports', 'view'), getDashboard);
router.get('/sales', authorizePermission('reports', 'view'), getSalesReport);
router.get('/inventory', authorizePermission('reports', 'view'), checkFeatureAccess('inventory'), getInventoryReport);
router.get('/profit-loss', authorizePermission('reports', 'view'), checkFeatureAccess('advancedReporting'), getProfitLossReport);

router.route('/history')
  .get(authorizePermission('reports', 'view'), listReports)
  .post(authorizePermission('reports', 'view'), createReport);

router.route('/history/:id')
  .patch(authorizePermission('reports', 'view'), updateReport)
  .delete(authorizePermission('reports', 'view'), deleteReport);

router.post('/history/:id/download', authorizePermission('reports', 'export'), recordDownload);

module.exports = router;
