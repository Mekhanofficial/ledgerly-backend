const express = require('express');
const router = express.Router();
const {
  getSettings,
  updateSettings,
  updateIntegration,
  runBackup,
  getAuditLogs
} = require('../controllers/settingsController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', authorize('super_admin', 'admin'), getSettings);
router.put('/', authorize('super_admin'), updateSettings);
router.put('/integrations/:provider', authorize('super_admin'), updateIntegration);
router.post('/backup/run', authorize('super_admin'), runBackup);
router.get('/audit-log', authorize('super_admin'), getAuditLogs);

module.exports = router;
