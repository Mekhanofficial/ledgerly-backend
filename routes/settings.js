const express = require('express');
const router = express.Router();
const {
  getSettings,
  updateSettings,
  updateIntegration,
  runBackup,
  getAuditLogs,
  exportBackupSnapshot
} = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', authorize('super_admin', 'admin', 'accountant'), getSettings);
router.put('/', authorize('super_admin', 'admin', 'accountant'), updateSettings);
router.put('/integrations/:provider', authorize('super_admin', 'admin', 'accountant'), updateIntegration);
router.post('/backup/run', authorize('super_admin', 'admin', 'accountant'), runBackup);
router.get('/backup/export', authorize('super_admin', 'admin', 'accountant'), exportBackupSnapshot);
router.get('/audit-log', authorize('super_admin', 'admin', 'accountant'), getAuditLogs);

module.exports = router;
