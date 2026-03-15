const ROLE_ALIASES = {
  sales: 'staff'
};

const ROLE_PERMISSIONS = {
  super_admin: {
    invoices: { create: true, read: true, update: true, delete: true },
    customers: { create: true, read: true, update: true, delete: true },
    products: { create: true, read: true, update: true, delete: true },
    reports: { view: true, export: true },
    settings: { view: true, update: true }
  },
  admin: {
    invoices: { create: true, read: true, update: true, delete: false },
    customers: { create: true, read: true, update: true, delete: true },
    products: { create: true, read: true, update: true, delete: true },
    reports: { view: true, export: true },
    settings: { view: true, update: true }
  },
  accountant: {
    invoices: { create: true, read: true, update: true, delete: false },
    customers: { create: false, read: true, update: false, delete: false },
    products: { create: false, read: true, update: false, delete: false },
    reports: { view: true, export: true },
    settings: { view: false, update: false }
  },
  staff: {
    invoices: { create: true, read: true, update: true, delete: false },
    customers: { create: true, read: true, update: true, delete: false },
    products: { create: false, read: true, update: false, delete: false },
    reports: { view: false, export: false },
    settings: { view: false, update: false }
  },
  client: {
    invoices: { create: false, read: true, update: false, delete: false },
    customers: { create: false, read: false, update: false, delete: false },
    products: { create: false, read: false, update: false, delete: false },
    reports: { view: false, export: false },
    settings: { view: false, update: false }
  },
  viewer: {
    invoices: { create: false, read: true, update: false, delete: false },
    customers: { create: false, read: true, update: false, delete: false },
    products: { create: false, read: true, update: false, delete: false },
    reports: { view: false, export: false },
    settings: { view: false, update: false }
  }
};

const normalizeRole = (role) => {
  if (!role) return 'staff';
  const lower = String(role).toLowerCase();
  return ROLE_ALIASES[lower] || lower;
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const mergePermissions = (base = {}, override = {}) => {
  const result = deepClone(base);
  Object.entries(override || {}).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = mergePermissions(result[key] || {}, value);
      return;
    }
    result[key] = value;
  });
  return result;
};

const getDefaultPermissions = (role) => {
  const normalized = normalizeRole(role);
  const base = ROLE_PERMISSIONS[normalized] || ROLE_PERMISSIONS.staff;
  return deepClone(base);
};

const getResolvedPermissions = (subject) => {
  if (!subject) {
    return getDefaultPermissions('staff');
  }

  if (typeof subject === 'string') {
    return getDefaultPermissions(subject);
  }

  return mergePermissions(
    getDefaultPermissions(subject.effectiveRole || subject.role),
    subject.permissions || {}
  );
};

const hasPermission = (subject, domain, action) => {
  const effectiveRole = normalizeRole(subject?.effectiveRole || subject?.role || subject);
  if (isSuperAdmin(effectiveRole)) {
    return true;
  }

  // Preserve admin settings ownership behavior even for older accounts created before
  // settings.update became part of the admin default template.
  if (effectiveRole === 'admin' && domain === 'settings') {
    return true;
  }

  const permissions = getResolvedPermissions(subject);
  return Boolean(permissions?.[domain]?.[action]);
};

const isRoleSupported = (role) => {
  const normalized = normalizeRole(role);
  return Boolean(ROLE_PERMISSIONS[normalized]);
};

const isSuperAdmin = (role) => normalizeRole(role) === 'super_admin';
const isAdmin = (role) => normalizeRole(role) === 'admin';
const isAccountant = (role) => normalizeRole(role) === 'accountant';
const isStaff = (role) => normalizeRole(role) === 'staff';
const isClient = (role) => normalizeRole(role) === 'client';

const canManageRoles = (role) => isSuperAdmin(role);
const canViewReports = (role) => ['super_admin', 'admin', 'accountant'].includes(normalizeRole(role));
const canEditPaidInvoices = (role) => isSuperAdmin(role);
const canDeleteInvoices = (role) => isSuperAdmin(role);

module.exports = {
  ROLE_PERMISSIONS,
  normalizeRole,
  getDefaultPermissions,
  getResolvedPermissions,
  hasPermission,
  isRoleSupported,
  isSuperAdmin,
  isAdmin,
  isAccountant,
  isStaff,
  isClient,
  canManageRoles,
  canViewReports,
  canEditPaidInvoices,
  canDeleteInvoices
};
