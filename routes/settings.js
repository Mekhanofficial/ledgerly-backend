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

router.get('/', authorize('admin', 'accountant', 'sales', 'viewer'), getSettings);
router.put('/', authorize('admin', 'accountant'), updateSettings);
router.put('/integrations/:provider', authorize('admin', 'accountant'), updateIntegration);
router.post('/backup/run', authorize('admin', 'accountant'), runBackup);
router.get('/audit-log', authorize('admin', 'accountant'), getAuditLogs);

module.exports = router;
