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
    settings: { view: true, update: false }
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

const getDefaultPermissions = (role) => {
  const normalized = normalizeRole(role);
  const base = ROLE_PERMISSIONS[normalized] || ROLE_PERMISSIONS.staff;
  return JSON.parse(JSON.stringify(base));
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
