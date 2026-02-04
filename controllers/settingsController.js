const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');

const logAuditEntry = async (req, action, resource, details = {}) => {
  await AuditLog.create({
    business: req.user.business,
    user: req.user.id,
    action,
    resource,
    details
  });
};

const mergeSection = (target, source) => {
  if (!source) return;
  Object.keys(source).forEach(key => {
    target[key] = source[key];
  });
};

// @desc    Get settings document
// @route   GET /api/v1/settings
// @access  Private
exports.getSettings = asyncHandler(async (req, res) => {
  let settings = await Settings.findOne({ business: req.user.business });

  if (!settings) {
    settings = await Settings.create({ business: req.user.business });
  }

  res.status(200).json({
    success: true,
    data: settings
  });
});

// @desc    Update settings
// @route   PUT /api/v1/settings
// @access  Private (Admin/Accountant)
exports.updateSettings = asyncHandler(async (req, res, next) => {
  const { invoice, receipt, notifications, backup } = req.body;

  const settings = await Settings.findOneAndUpdate(
    { business: req.user.business },
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  settings.invoice = settings.invoice || {};
  settings.receipt = settings.receipt || {};
  settings.notifications = settings.notifications || {};
  settings.backup = settings.backup || {};

  mergeSection(settings.invoice, invoice);
  mergeSection(settings.receipt, receipt);
  mergeSection(settings.notifications, notifications);
  mergeSection(settings.backup, backup);

  await settings.save();
  await logAuditEntry(req, 'update-settings', 'Settings', req.body);

  res.status(200).json({
    success: true,
    data: settings
  });
});

// @desc    Update integration settings
// @route   PUT /api/v1/settings/integrations/:provider
// @access  Private (Admin/Accountant)
exports.updateIntegration = asyncHandler(async (req, res, next) => {
  const provider = req.params.provider.toLowerCase();
  const payload = req.body;

  const settings = await Settings.findOneAndUpdate(
    { business: req.user.business },
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  settings.integrations = settings.integrations || {};
  settings.integrations[provider] = settings.integrations[provider] || {};
  mergeSection(settings.integrations[provider], payload);

  await settings.save();
  await logAuditEntry(req, 'update-integration', 'Settings', { provider, payload });

  res.status(200).json({
    success: true,
    data: settings.integrations[provider]
  });
});

// @desc    Trigger backup metadata update
// @route   POST /api/v1/settings/backup/run
// @access  Private (Admin/Accountant)
exports.runBackup = asyncHandler(async (req, res, next) => {
  const settings = await Settings.findOneAndUpdate(
    { business: req.user.business },
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  settings.backup = {
    ...settings.backup,
    lastBackup: new Date(),
    backupLocation: req.body.backupLocation || settings.backup.backupLocation
  };

  await settings.save();
  await logAuditEntry(req, 'run-backup', 'Settings', { backupLocation: settings.backup.backupLocation });

  res.status(200).json({
    success: true,
    message: 'Backup metadata updated',
    data: settings.backup
  });
});

// @desc    Get audit logs
// @route   GET /api/v1/settings/audit-log
// @access  Private (Admin/Accountant)
exports.getAuditLogs = asyncHandler(async (req, res) => {
  const { limit = 25, action } = req.query;

  const query = { business: req.user.business };
  if (action) query.action = action;

  const logs = await AuditLog.find(query)
    .populate('user', 'name email role')
    .sort({ timestamp: -1 })
    .limit(parseInt(limit, 10));

  res.status(200).json({
    success: true,
    count: logs.length,
    data: logs
  });
});
