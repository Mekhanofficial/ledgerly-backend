const mongoose = require('mongoose');
const dotenv = require('dotenv');

const User = require('../models/User');
const Business = require('../models/Business');
const { getDefaultPermissions } = require('../utils/rolePermissions');

dotenv.config();

const getEnv = (names) => {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
};

const email = getEnv(['SUPERADMIN_EMAIL', 'ADMIN_EMAIL']);
const password = getEnv(['SUPERADMIN_PASSWORD', 'ADMIN_PASSWORD']);
const name = getEnv(['SUPERADMIN_NAME', 'ADMIN_NAME']) || 'Super Admin';
const userPhone = getEnv(['SUPERADMIN_PHONE', 'ADMIN_PHONE']);
const businessName = getEnv(['SUPERADMIN_BUSINESS_NAME', 'ADMIN_BUSINESS_NAME']) || 'Ledgerly HQ';
const businessEmail = getEnv(['SUPERADMIN_BUSINESS_EMAIL', 'ADMIN_BUSINESS_EMAIL']) || email;
const businessPhone = getEnv(['SUPERADMIN_BUSINESS_PHONE', 'ADMIN_BUSINESS_PHONE']) || userPhone || '0000000000';
const businessId = getEnv(['SUPERADMIN_BUSINESS_ID', 'ADMIN_BUSINESS_ID']);
const resetPasswordEnv = getEnv(['SUPERADMIN_RESET_PASSWORD', 'ADMIN_RESET_PASSWORD']) || 'true';
const shouldResetPassword = resetPasswordEnv.toLowerCase() !== 'false';

const log = (message) => {
  console.log(`[ensure-superadmin] ${message}`);
};

const getMongoUri = () => {
  if (process.env.NODE_ENV === 'production') {
    return process.env.MONGODB_ATLAS_URI || process.env.MONGODB_URI;
  }
  return process.env.MONGODB_URI || process.env.MONGODB_ATLAS_URI;
};

const exitWithError = (message) => {
  console.error(`[ensure-superadmin] ${message}`);
  process.exit(1);
};

const ensureBusiness = async (user) => {
  let business = null;

  if (user?.business) {
    business = await Business.findById(user.business);
  }

  if (!business && businessId) {
    business = await Business.findById(businessId);
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
    return { business, created: false };
  }

  if (!businessEmail || !businessPhone) {
    exitWithError('Missing business details. Provide SUPERADMIN_BUSINESS_EMAIL and SUPERADMIN_BUSINESS_PHONE.');
  }

  const createdBusiness = await Business.create({
    name: businessName,
    email: businessEmail.toLowerCase(),
    phone: businessPhone,
    owner: null
  });

  log(`Created business "${createdBusiness.name}" (${createdBusiness._id}).`);
  return { business: createdBusiness, created: true };
};

const ensureSuperAdmin = async () => {
  if (!email || !password) {
    exitWithError('Missing SUPERADMIN_EMAIL and/or SUPERADMIN_PASSWORD (or ADMIN_EMAIL/ADMIN_PASSWORD).');
  }

  const mongoUri = getMongoUri();
  if (!mongoUri) {
    exitWithError('Missing MONGODB_URI (or MONGODB_ATLAS_URI).');
  }

  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  const normalizedEmail = email.toLowerCase();
  let user = await User.findOne({ email: normalizedEmail }).select('+password');

  const { business, created } = await ensureBusiness(user);
  const permissions = getDefaultPermissions('super_admin');

  if (user) {
    user.role = 'super_admin';
    user.permissions = permissions;
    user.isActive = true;
    user.emailVerified = true;
    if (!user.name) user.name = name;
    if (!user.business) user.business = business._id;
    if (shouldResetPassword) {
      user.password = password;
    }
    await user.save();
    log(`Updated user ${user.email} to super_admin.`);
  } else {
    user = await User.create({
      name,
      email: normalizedEmail,
      password,
      phone: userPhone || undefined,
      business: business._id,
      role: 'super_admin',
      permissions,
      isActive: true,
      emailVerified: true
    });
    log(`Created super_admin user ${user.email}.`);
  }

  if (created || !business.owner) {
    business.owner = user._id;
    await business.save();
    log('Set business owner to super admin.');
  } else {
    const ownerExists = await User.exists({ _id: business.owner });
    if (!ownerExists) {
      business.owner = user._id;
      await business.save();
      log('Fixed missing business owner reference.');
    }
  }

  log('Done.');
  await mongoose.disconnect();
  process.exit(0);
};

ensureSuperAdmin().catch((err) => {
  console.error('[ensure-superadmin] Failed:', err.message);
  process.exit(1);
});
