const mongoose = require('mongoose');
const dotenv = require('dotenv');

const User = require('../models/User');
const Business = require('../models/Business');
const { getDefaultPermissions } = require('../utils/rolePermissions');

dotenv.config();

const DEFAULT_E2E_NAME = 'QA Admin';
const DEFAULT_E2E_BUSINESS_NAME = 'Ledgerly QA';
const DEFAULT_E2E_BUSINESS_PHONE = '0000000000';
const ACTIVE_SUBSCRIPTION_DAYS = 365;

const getEnv = (names) => {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
};

const email = getEnv(['E2E_USER_EMAIL', 'QA_USER_EMAIL']).toLowerCase();
const password = getEnv(['E2E_USER_PASSWORD', 'QA_USER_PASSWORD']);
const name = getEnv(['E2E_USER_NAME', 'QA_USER_NAME']) || DEFAULT_E2E_NAME;
const phone = getEnv(['E2E_USER_PHONE', 'QA_USER_PHONE']) || '';
const businessId = getEnv(['E2E_BUSINESS_ID', 'QA_BUSINESS_ID']);
const businessName = getEnv(['E2E_BUSINESS_NAME', 'QA_BUSINESS_NAME']) || DEFAULT_E2E_BUSINESS_NAME;
const businessEmail = getEnv(['E2E_BUSINESS_EMAIL', 'QA_BUSINESS_EMAIL']) || email;
const businessPhone = getEnv(['E2E_BUSINESS_PHONE', 'QA_BUSINESS_PHONE']) || DEFAULT_E2E_BUSINESS_PHONE;
const resetPasswordEnv = getEnv(['E2E_RESET_PASSWORD', 'QA_RESET_PASSWORD']) || 'true';
const shouldResetPassword = resetPasswordEnv.toLowerCase() !== 'false';
const superAdminEmail = getEnv(['SUPERADMIN_EMAIL', 'ADMIN_EMAIL']).toLowerCase();

const log = (message) => {
  console.log(`[ensure-e2e-user] ${message}`);
};

const exitWithError = (message) => {
  console.error(`[ensure-e2e-user] ${message}`);
  process.exit(1);
};

const getMongoUri = () => {
  if (process.env.NODE_ENV === 'production') {
    return process.env.MONGODB_ATLAS_URI || process.env.MONGODB_URI;
  }
  return process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI;
};

const ensureBusiness = async () => {
  let business = null;

  if (businessId) {
    business = await Business.findById(businessId);
  }

  if (!business && superAdminEmail) {
    const superAdminUser = await User.findOne({ email: superAdminEmail }).select('business');
    if (superAdminUser?.business) {
      business = await Business.findById(superAdminUser.business);
    }
  }

  if (!business && businessEmail) {
    business = await Business.findOne({ email: businessEmail.toLowerCase() });
  }

  if (!business && businessName) {
    business = await Business.findOne({ name: businessName });
  }

  if (!business) {
    business = await Business.findOne().sort({ createdAt: 1 });
  }

  if (business) {
    return business;
  }

  business = await Business.create({
    name: businessName,
    email: businessEmail.toLowerCase(),
    phone: businessPhone,
    owner: null
  });
  log(`Created business "${business.name}" (${business._id}).`);
  return business;
};

const ensureE2EUser = async () => {
  if (!email || !password) {
    exitWithError('Missing E2E_USER_EMAIL and/or E2E_USER_PASSWORD.');
  }

  const mongoUri = getMongoUri();
  if (!mongoUri) {
    exitWithError('Missing MONGODB_URI (or MONGODB_ATLAS_URI).');
  }

  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  const business = await ensureBusiness();
  const permissions = getDefaultPermissions('admin');
  const now = new Date();
  const activeUntil = new Date(now.getTime() + ACTIVE_SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);

  let user = await User.findOne({ email }).select('+password');
  if (user) {
    if (user.role === 'super_admin') {
      exitWithError(
        `E2E user email ${email} belongs to a super_admin. Use a dedicated non-super-admin email.`
      );
    }

    user.name = user.name || name;
    user.phone = user.phone || phone || undefined;
    user.role = 'admin';
    user.permissions = permissions;
    user.business = business._id;
    user.isActive = true;
    user.emailVerified = true;
    user.plan = 'enterprise';
    user.subscriptionStatus = 'active';
    user.trialEndsAt = null;
    user.subscriptionEndsAt = activeUntil;
    user.invoiceLimit = 100000;
    user.invoiceCountThisMonth = 0;
    user.invoiceCountResetAt = now;
    if (shouldResetPassword) {
      user.password = password;
    }
    await user.save();
    log(`Updated existing E2E user ${user.email}.`);
  } else {
    user = await User.create({
      name,
      email,
      password,
      phone: phone || undefined,
      business: business._id,
      role: 'admin',
      permissions,
      isActive: true,
      emailVerified: true,
      plan: 'enterprise',
      subscriptionStatus: 'active',
      trialEndsAt: null,
      subscriptionEndsAt: activeUntil,
      invoiceLimit: 100000,
      invoiceCountThisMonth: 0,
      invoiceCountResetAt: now
    });
    log(`Created E2E admin user ${user.email}.`);
  }

  if (!business.owner || String(business.owner) !== String(user._id)) {
    business.owner = user._id;
    log('Set business owner to E2E admin user.');
  }

  business.subscription = {
    ...(business.subscription || {}),
    plan: 'enterprise',
    status: 'active',
    billingCycle: 'monthly',
    currentPeriodEnd: activeUntil,
    trialEndsAt: null
  };

  await business.save();

  log(`Done. E2E user ensured for ${email}.`);
  await mongoose.disconnect();
  process.exit(0);
};

ensureE2EUser().catch((error) => {
  console.error('[ensure-e2e-user] Failed:', error?.message || error);
  process.exit(1);
});
