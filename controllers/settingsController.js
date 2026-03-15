const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');
const Business = require('../models/Business');
const Category = require('../models/Category');
const Customer = require('../models/Customer');
const Document = require('../models/Document');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Product = require('../models/Product');
const Receipt = require('../models/Receipt');
const Supplier = require('../models/Supplier');
const TaxSettings = require('../models/TaxSettings');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const { getDefaultPermissions, normalizeRole } = require('../utils/rolePermissions');

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

const deepClone = (value) => JSON.parse(JSON.stringify(value || {}));

const mergeDeep = (base = {}, override = {}) => {
  const result = deepClone(base);
  Object.entries(override || {}).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergeDeep(result[key] || {}, value);
      return;
    }
    result[key] = value;
  });
  return result;
};

const mergeRolePermissionTemplates = (existingTemplates = {}, incomingTemplates = {}) => {
  const merged = deepClone(existingTemplates);
  Object.entries(incomingTemplates || {}).forEach(([role, template]) => {
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole || normalizedRole === 'super_admin') {
      return;
    }

    merged[normalizedRole] = mergeDeep(merged[normalizedRole] || {}, template || {});
  });
  return merged;
};

const getUserRoleVariants = (normalizedRole) => (
  normalizedRole === 'staff' ? ['staff', 'sales'] : [normalizedRole]
);

const syncRoleTemplatesToExistingUsers = async (
  businessId,
  settingsRolePermissions = {},
  updatedRolePermissions = {}
) => {
  if (
    !businessId
    || !updatedRolePermissions
    || typeof updatedRolePermissions !== 'object'
    || Array.isArray(updatedRolePermissions)
  ) {
    return;
  }

  const updatedRoles = Array.from(new Set(
    Object.keys(updatedRolePermissions)
      .map((role) => normalizeRole(role))
      .filter((role) => role && role !== 'super_admin')
  ));

  if (!updatedRoles.length) {
    return;
  }

  const operations = updatedRoles.map((role) => {
    const resolvedTemplate = mergeDeep(
      getDefaultPermissions(role),
      settingsRolePermissions?.[role] || {}
    );

    return {
      updateMany: {
        filter: {
          business: businessId,
          role: { $in: getUserRoleVariants(role) }
        },
        update: {
          $set: {
            permissions: resolvedTemplate
          }
        }
      }
    };
  });

  if (!operations.length) {
    return;
  }

  await User.bulkWrite(operations);
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
  const { invoice, receipt, preferences, notifications, security, backup, rolePermissions } = req.body;

  const settings = await Settings.findOneAndUpdate(
    { business: req.user.business },
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  settings.invoice = settings.invoice || {};
  settings.receipt = settings.receipt || {};
  settings.preferences = settings.preferences || {};
  settings.notifications = settings.notifications || {};
  settings.security = settings.security || {};
  settings.backup = settings.backup || {};
  settings.rolePermissions = settings.rolePermissions || {};

  mergeSection(settings.invoice, invoice);
  mergeSection(settings.receipt, receipt);
  mergeSection(settings.preferences, preferences);
  mergeSection(settings.notifications, notifications);
  mergeSection(settings.security, security);
  mergeSection(settings.backup, backup);

  if (rolePermissions && typeof rolePermissions === 'object' && !Array.isArray(rolePermissions)) {
    settings.rolePermissions = mergeRolePermissionTemplates(settings.rolePermissions, rolePermissions);
    settings.markModified('rolePermissions');
  }

  await settings.save();
  if (rolePermissions && typeof rolePermissions === 'object' && !Array.isArray(rolePermissions)) {
    await syncRoleTemplatesToExistingUsers(req.user.business, settings.rolePermissions, rolePermissions);
  }
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
  settings.markModified('integrations');

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

// @desc    Export backup snapshot (JSON)
// @route   GET /api/v1/settings/backup/export
// @access  Private (Admin/Accountant)
exports.exportBackupSnapshot = asyncHandler(async (req, res) => {
  const businessId = req.user.business;

  const [
    business,
    settings,
    taxSettings,
    users,
    customers,
    categories,
    suppliers,
    products,
    invoices,
    receipts,
    payments,
    documents,
    auditLogs
  ] = await Promise.all([
    Business.findById(businessId).lean(),
    Settings.findOne({ business: businessId }).lean(),
    (async () => {
      const scoped = await TaxSettings.findOne({ business: businessId }).lean();
      if (scoped) return scoped;
      return TaxSettings.findOne({
        $or: [
          { business: null },
          { business: { $exists: false } }
        ]
      })
        .sort({ updatedAt: -1 })
        .lean();
    })(),
    User.find({ business: businessId })
      .select('-password -resetPasswordToken -resetPasswordExpire -verificationToken -invitationToken -invitationExpire')
      .lean(),
    Customer.find({ business: businessId }).lean(),
    Category.find({ business: businessId }).lean(),
    Supplier.find({ business: businessId }).lean(),
    Product.find({ business: businessId }).lean(),
    Invoice.find({ business: businessId }).lean(),
    Receipt.find({ business: businessId }).lean(),
    Payment.find({ business: businessId }).lean(),
    Document.find({ business: businessId }).lean(),
    AuditLog.find({ business: businessId }).sort({ timestamp: -1 }).limit(1000).lean()
  ]);

  const snapshot = {
    schemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
    exportedBy: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role
    },
    businessId: String(businessId),
    counts: {
      users: users.length,
      customers: customers.length,
      categories: categories.length,
      suppliers: suppliers.length,
      products: products.length,
      invoices: invoices.length,
      receipts: receipts.length,
      payments: payments.length,
      documents: documents.length,
      auditLogs: auditLogs.length
    },
    data: {
      business,
      settings: settings || null,
      taxSettings: taxSettings || null,
      users,
      customers,
      categories,
      suppliers,
      products,
      invoices,
      receipts,
      payments,
      documents,
      auditLogs
    },
    notes: [
      'Tax settings are exported from the business-scoped tax settings collection.',
      'Audit logs are capped to the most recent 1000 entries in this export.'
    ]
  };

  const fileName = `ledgerly-backup-${String(businessId)}-${new Date().toISOString().split('T')[0]}.json`;

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=\"${fileName}\"`);
  res.status(200).send(JSON.stringify(snapshot, null, 2));
});
