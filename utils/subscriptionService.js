const Business = require('../models/Business');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { PLAN_DEFINITIONS, normalizePlanId } = require('./planConfig');
const { isSuperAdmin } = require('./rolePermissions');

const TRIAL_DAYS = 7;
const TRIAL_PLAN = 'professional';
const TRIAL_INVOICE_LIMIT = 100;
const INVOICE_RESET_DAYS = Number(process.env.INVOICE_RESET_DAYS || 0);

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
const getInvoiceResetCutoff = (now) => (INVOICE_RESET_DAYS > 0
  ? new Date(now.getTime() - INVOICE_RESET_DAYS * 24 * 60 * 60 * 1000)
  : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));

const shouldResetInvoiceCount = (lastReset, now) => {
  if (!lastReset) return true;
  if (INVOICE_RESET_DAYS > 0) {
    return lastReset < getInvoiceResetCutoff(now);
  }
  return lastReset.getUTCFullYear() !== now.getUTCFullYear()
    || lastReset.getUTCMonth() !== now.getUTCMonth();
};

const hasSuperAdminLifetimeAccess = (user) => isSuperAdmin(user?.role);
const SUPER_ADMIN_PLAN = 'enterprise';

const normalizeSuperAdminSubscriptionState = async (user) => {
  if (!user || !hasSuperAdminLifetimeAccess(user)) return user;

  let changed = false;

  if (user.plan !== SUPER_ADMIN_PLAN) {
    user.plan = SUPER_ADMIN_PLAN;
    changed = true;
  }
  if (user.subscriptionStatus !== 'active') {
    user.subscriptionStatus = 'active';
    changed = true;
  }
  if (user.trialEndsAt) {
    user.trialEndsAt = null;
    changed = true;
  }
  if (user.subscriptionEndsAt) {
    user.subscriptionEndsAt = null;
    changed = true;
  }
  if (user.invoiceLimit !== Infinity) {
    user.invoiceLimit = Infinity;
    changed = true;
  }

  if (changed) {
    await user.save();
  }

  return user;
};


const startTrialForUser = async ({ user, business }) => {
  if (hasSuperAdminLifetimeAccess(user)) {
    user.plan = SUPER_ADMIN_PLAN;
    user.subscriptionStatus = 'active';
    user.trialEndsAt = null;
    user.subscriptionEndsAt = null;
    user.invoiceLimit = Infinity;
    user.invoiceCountThisMonth = 0;
    user.invoiceCountResetAt = new Date();
    await user.save();

    if (business) {
      business.subscription = {
        ...(business.subscription || {}),
        plan: SUPER_ADMIN_PLAN,
        status: 'active',
        currentPeriodEnd: null,
        trialEndsAt: null
      };
      await business.save();
    }

    return { trialEndsAt: null };
  }

  const now = new Date();
  const trialEndsAt = addDays(now, TRIAL_DAYS);

  user.plan = TRIAL_PLAN;
  user.subscriptionStatus = 'trial';
  user.trialEndsAt = trialEndsAt;
  user.subscriptionEndsAt = trialEndsAt;
  user.invoiceLimit = TRIAL_INVOICE_LIMIT;
  user.invoiceCountThisMonth = 0;
  user.invoiceCountResetAt = now;
  await user.save();

  if (business) {
    business.subscription = {
      ...(business.subscription || {}),
      plan: TRIAL_PLAN,
      status: 'trial',
      currentPeriodEnd: trialEndsAt,
      trialEndsAt
    };
    await business.save();
  }

  await Subscription.create({
    user: user._id,
    business: user.business,
    plan: TRIAL_PLAN,
    billingCycle: 'monthly',
    status: 'trial',
    subscriptionStart: now,
    subscriptionEnd: trialEndsAt,
    expiresAt: trialEndsAt
  });

  return { trialEndsAt };
};

const resolveBillingOwner = async (user) => {
  if (hasSuperAdminLifetimeAccess(user)) return user;
  if (!user?.business) return user;
  const business = await Business.findById(user.business).select('owner').lean();
  if (business?.owner) {
    const owner = await User.findById(business.owner);
    return owner || user;
  }
  return user;
};

const isTrialActive = (user) => {
  if (!user) return false;
  if (hasSuperAdminLifetimeAccess(user)) return false;
  if (user.subscriptionStatus !== 'trial') return false;
  if (!user.trialEndsAt) return false;
  return new Date(user.trialEndsAt) >= new Date();
};

const isSubscriptionActive = (user) => {
  if (!user) return false;
  if (hasSuperAdminLifetimeAccess(user)) return true;
  const status = user.subscriptionStatus || 'active';
  if (status === 'active') {
    if (!user.subscriptionEndsAt) return true;
    return new Date(user.subscriptionEndsAt) >= new Date();
  }
  return false;
};

const resolveEffectivePlan = (user) => {
  if (!user) return 'starter';
  if (hasSuperAdminLifetimeAccess(user)) return SUPER_ADMIN_PLAN;
  if (isTrialActive(user) || isSubscriptionActive(user)) {
    return normalizePlanId(user.plan);
  }
  return 'starter';
};

const expireSubscriptionIfNeeded = async (user) => {
  if (!user) return null;
  if (hasSuperAdminLifetimeAccess(user)) {
    await normalizeSuperAdminSubscriptionState(user);
    return 'active';
  }
  const now = new Date();
  if (user.subscriptionStatus === 'trial' && user.trialEndsAt && new Date(user.trialEndsAt) < now) {
    user.subscriptionStatus = 'expired';
    user.subscriptionEndsAt = user.trialEndsAt;
    user.plan = normalizePlanId(user.plan || 'starter');
    await user.save();
    return 'expired';
  }
  if (user.subscriptionStatus === 'active' && user.subscriptionEndsAt && new Date(user.subscriptionEndsAt) < now) {
    user.subscriptionStatus = 'expired';
    await user.save();
    return 'expired';
  }
  return user.subscriptionStatus;
};

const syncBusinessFromUser = async (user) => {
  if (!user?.business) return null;
  const business = await Business.findById(user.business);
  if (!business) return null;
  if (hasSuperAdminLifetimeAccess(user)) {
    business.subscription = {
      ...(business.subscription || {}),
      plan: SUPER_ADMIN_PLAN,
      status: 'active',
      currentPeriodEnd: null,
      trialEndsAt: null
    };
    await business.save();
    return business;
  }
  const plan = normalizePlanId(user.plan || business.subscription?.plan || 'starter');
  const status = user.subscriptionStatus || business.subscription?.status || 'active';
  business.subscription = {
    ...(business.subscription || {}),
    plan,
    status,
    currentPeriodEnd: user.subscriptionEndsAt,
    trialEndsAt: user.trialEndsAt
  };
  await business.save();
  return business;
};

const resetInvoiceCountIfNeeded = async (user) => {
  if (!user) return user;
  if (hasSuperAdminLifetimeAccess(user)) {
    if (user.invoiceLimit !== Infinity) {
      user.invoiceLimit = Infinity;
      await user.save();
    }
    return user;
  }
  const now = new Date();
  const lastReset = user.invoiceCountResetAt ? new Date(user.invoiceCountResetAt) : null;
  const needsReset = shouldResetInvoiceCount(lastReset, now);

  if (needsReset) {
    user.invoiceCountThisMonth = 0;
    user.invoiceCountResetAt = now;
    await user.save();
  }
  return user;
};

const syncTrialPeriods = async () => {
  const trialSubscriptions = await Subscription.find({ status: 'trial' })
    .select('user business subscriptionStart createdAt subscriptionEnd expiresAt')
    .lean();

  if (!trialSubscriptions.length) return { updated: 0 };

  const subUpdates = [];
  const userUpdates = [];
  const businessUpdates = [];

  for (const sub of trialSubscriptions) {
    const startAt = sub.subscriptionStart || sub.createdAt;
    if (!startAt) continue;

    const expectedEnd = addDays(new Date(startAt), TRIAL_DAYS);
    const currentEnd = sub.subscriptionEnd ? new Date(sub.subscriptionEnd) : null;
    const currentExpires = sub.expiresAt ? new Date(sub.expiresAt) : null;

    const needsSubUpdate = !currentEnd
      || currentEnd.getTime() !== expectedEnd.getTime()
      || !currentExpires
      || currentExpires.getTime() !== expectedEnd.getTime();

    if (needsSubUpdate) {
      subUpdates.push({
        updateOne: {
          filter: { _id: sub._id },
          update: { $set: { subscriptionEnd: expectedEnd, expiresAt: expectedEnd } }
        }
      });
    }

    if (sub.user) {
      userUpdates.push({
        updateOne: {
          filter: { _id: sub.user, subscriptionStatus: 'trial', role: { $ne: 'super_admin' } },
          update: {
            $set: {
              trialEndsAt: expectedEnd,
              subscriptionEndsAt: expectedEnd,
              invoiceLimit: TRIAL_INVOICE_LIMIT
            }
          }
        }
      });
    }

    if (sub.business) {
      businessUpdates.push({
        updateOne: {
          filter: { _id: sub.business },
          update: {
            $set: {
              'subscription.currentPeriodEnd': expectedEnd,
              'subscription.trialEndsAt': expectedEnd,
              'subscription.status': 'trial'
            }
          }
        }
      });
    }
  }

  if (subUpdates.length) await Subscription.bulkWrite(subUpdates);
  if (userUpdates.length) await User.bulkWrite(userUpdates);
  if (businessUpdates.length) await Business.bulkWrite(businessUpdates);

  return { updated: subUpdates.length };
};

const resetMonthlyInvoiceCounts = async () => {
  const now = new Date();
  const resetCutoff = getInvoiceResetCutoff(now);

  await syncTrialPeriods();

  await User.updateMany(
    {
      $or: [
        { invoiceCountResetAt: { $lt: resetCutoff } },
        { invoiceCountResetAt: { $exists: false } }
      ]
    },
    {
      $set: { invoiceCountThisMonth: 0, invoiceCountResetAt: now }
    }
  );

  await User.updateMany(
    {
      role: { $ne: 'super_admin' },
      subscriptionStatus: 'trial',
      trialEndsAt: { $lt: now }
    },
    {
      $set: { subscriptionStatus: 'expired', subscriptionEndsAt: now }
    }
  );

  await User.updateMany(
    {
      role: { $ne: 'super_admin' },
      subscriptionStatus: 'active',
      subscriptionEndsAt: { $lt: now }
    },
    {
      $set: { subscriptionStatus: 'expired' }
    }
  );
};

const resolveInvoiceLimit = (user) => {
  if (!user) return PLAN_DEFINITIONS.starter.maxInvoicesPerMonth;
  if (hasSuperAdminLifetimeAccess(user)) return Infinity;
  if (Number.isFinite(Number(user.invoiceLimit))) return Number(user.invoiceLimit);
  const planId = normalizePlanId(user.plan);
  return PLAN_DEFINITIONS[planId]?.maxInvoicesPerMonth ?? PLAN_DEFINITIONS.starter.maxInvoicesPerMonth;
};

const updateSubscriptionFromPayment = async ({
  user,
  business,
  plan,
  billingCycle = 'monthly',
  paystackCustomerCode,
  paystackSubscriptionCode,
  paystackPlanCode
}) => {
  if (hasSuperAdminLifetimeAccess(user)) {
    await normalizeSuperAdminSubscriptionState(user);

    if (business) {
      business.subscription = {
        ...(business.subscription || {}),
        plan: SUPER_ADMIN_PLAN,
        status: 'active',
        currentPeriodEnd: null,
        trialEndsAt: null
      };
      await business.save();
    }

    return Subscription.findOneAndUpdate(
      { business: user.business },
      {
        user: user._id,
        business: user.business,
        plan: SUPER_ADMIN_PLAN,
        billingCycle,
        status: 'active',
        subscriptionStart: user.createdAt || new Date(),
        subscriptionEnd: null,
        expiresAt: null,
        paystackCustomerCode: paystackCustomerCode || undefined,
        paystackSubscriptionCode: paystackSubscriptionCode || undefined,
        paystackPlanCode: paystackPlanCode || undefined
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const now = new Date();
  const cycleDays = billingCycle === 'yearly' ? 365 : 30;
  const subscriptionEndsAt = addDays(now, cycleDays);
  const normalizedPlan = normalizePlanId(plan);
  const planDef = PLAN_DEFINITIONS[normalizedPlan] || PLAN_DEFINITIONS.starter;

  user.plan = normalizedPlan;
  user.subscriptionStatus = 'active';
  user.subscriptionEndsAt = subscriptionEndsAt;
  user.invoiceLimit = planDef.maxInvoicesPerMonth;
  if (paystackCustomerCode) user.paystackCustomerCode = paystackCustomerCode;
  if (paystackSubscriptionCode) user.paystackSubscriptionCode = paystackSubscriptionCode;
  await user.save();

  if (business) {
    business.subscription = {
      ...(business.subscription || {}),
      plan: normalizedPlan,
      status: 'active',
      currentPeriodEnd: subscriptionEndsAt,
      trialEndsAt: null
    };
    await business.save();
  }

  const subscription = await Subscription.findOneAndUpdate(
    { business: user.business },
    {
      user: user._id,
      business: user.business,
      plan: normalizedPlan,
      billingCycle,
      status: 'active',
      subscriptionStart: now,
      subscriptionEnd: subscriptionEndsAt,
      expiresAt: subscriptionEndsAt,
      paystackCustomerCode: paystackCustomerCode || undefined,
      paystackSubscriptionCode: paystackSubscriptionCode || undefined,
      paystackPlanCode: paystackPlanCode || undefined
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return subscription;
};

module.exports = {
  TRIAL_DAYS,
  TRIAL_PLAN,
  TRIAL_INVOICE_LIMIT,
  startTrialForUser,
  resolveBillingOwner,
  resolveEffectivePlan,
  isTrialActive,
  isSubscriptionActive,
  expireSubscriptionIfNeeded,
  syncBusinessFromUser,
  resetInvoiceCountIfNeeded,
  resetMonthlyInvoiceCounts,
  resolveInvoiceLimit,
  updateSubscriptionFromPayment
};
