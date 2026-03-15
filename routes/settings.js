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
const { protect, authorizePermission } = require('../middleware/auth');

router.use(protect);

router.get('/', authorizePermission('settings', 'view'), getSettings);
router.put('/', authorizePermission('settings', 'update'), updateSettings);
router.put('/integrations/:provider', authorizePermission('settings', 'update'), updateIntegration);
router.post('/backup/run', authorizePermission('settings', 'update'), runBackup);
router.get('/backup/export', authorizePermission('settings', 'update'), exportBackupSnapshot);
router.get('/audit-log', authorizePermission('settings', 'view'), getAuditLogs);

module.exports = router;
