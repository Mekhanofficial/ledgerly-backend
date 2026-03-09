const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Product = require('../models/Product');
const Business = require('../models/Business');
const asyncHandler = require('../utils/asyncHandler');
const { getPlanDefinition } = require('../utils/planConfig');
const {
  resolveBillingOwner,
  resolveEffectivePlan,
  expireSubscriptionIfNeeded,
  syncBusinessFromUser
} = require('../utils/subscriptionService');

const ELITE_ACCESS_LEVEL = 'elite_enterprise';
const SUPPORT_HOURS = {
  timezone: 'America/New_York',
  window: 'Mon-Fri, 8:00 AM - 8:00 PM'
};

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const resolveBusinessId = (reqUser, billingOwner) => {
  if (billingOwner?.business) return billingOwner.business;
  if (reqUser?.business) return reqUser.business;
  return null;
};

const buildBusinessMetrics = async (businessId) => {
  if (!businessId) {
    return {
      totalInvoices: 0,
      overdueInvoices: 0,
      unpaidInvoices: 0,
      dueSoonInvoices: 0,
      lowStockProducts: 0,
      outOfStockProducts: 0,
      paymentsTodayCount: 0,
      paymentsTodayAmount: 0
    };
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const upcomingWindow = new Date(now);
  upcomingWindow.setDate(upcomingWindow.getDate() + 7);

  const unpaidStatuses = ['sent', 'viewed', 'partial', 'overdue'];

  const [
    totalInvoices,
    overdueInvoices,
    unpaidInvoices,
    dueSoonInvoices,
    lowStockProducts,
    outOfStockProducts,
    paymentsTodayAggregate
  ] = await Promise.all([
    Invoice.countDocuments({ business: businessId, isEstimate: { $ne: true } }),
    Invoice.countDocuments({
      business: businessId,
      isEstimate: { $ne: true },
      $or: [
        { status: 'overdue' },
        {
          status: { $in: ['sent', 'viewed', 'partial'] },
          dueDate: { $lt: now }
        }
      ]
    }),
    Invoice.countDocuments({
      business: businessId,
      isEstimate: { $ne: true },
      status: { $in: unpaidStatuses }
    }),
    Invoice.countDocuments({
      business: businessId,
      isEstimate: { $ne: true },
      status: { $in: ['sent', 'viewed', 'partial'] },
      dueDate: { $gte: now, $lte: upcomingWindow }
    }),
    Product.countDocuments({
      business: businessId,
      isActive: true,
      trackInventory: true,
      $expr: { $lte: ['$stock.available', '$stock.lowStockThreshold'] }
    }),
    Product.countDocuments({
      business: businessId,
      isActive: true,
      trackInventory: true,
      'stock.available': { $lte: 0 }
    }),
    Payment.aggregate([
      {
        $match: {
          business: businessId,
          status: 'completed',
          createdAt: { $gte: startOfDay }
        }
      },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ])
  ]);

  const todaySummary = paymentsTodayAggregate[0] || {};

  return {
    totalInvoices,
    overdueInvoices,
    unpaidInvoices,
    dueSoonInvoices,
    lowStockProducts,
    outOfStockProducts,
    paymentsTodayCount: Number(todaySummary.totalCount || 0),
    paymentsTodayAmount: Number(todaySummary.totalAmount || 0)
  };
};

const createReplyPayload = (message, metrics, businessName) => {
  const normalized = normalizeText(message);
  const businessLabel = businessName || 'your business';

  if (!normalized) {
    return {
      reply:
        `Welcome to Ledgerly Live Chat for ${businessLabel}. ` +
        'I can help with invoices, payments, reporting, and inventory. What would you like to review first?',
      quickActions: ['Open dashboard', 'Review invoices', 'Check inventory', 'Talk to specialist'],
      suggestedRoute: '/dashboard'
    };
  }

  if (/(hello|hi|hey|good morning|good afternoon|good evening)/.test(normalized)) {
    return {
      reply:
        `Hello. I am your Ledgerly enterprise assistant for ${businessLabel}. ` +
        `Current highlights: ${metrics.overdueInvoices} overdue invoices, ${metrics.lowStockProducts} low-stock items, ` +
        `${metrics.paymentsTodayCount} completed payments today.`,
      quickActions: ['Open dashboard', 'Review invoices', 'Check inventory', 'View payments'],
      suggestedRoute: '/dashboard'
    };
  }

  if (/(dashboard|summary|overview|kpi|status)/.test(normalized)) {
    return {
      reply:
        `Business summary for ${businessLabel}: ` +
        `${metrics.totalInvoices} invoices total, ${metrics.unpaidInvoices} unpaid, ${metrics.overdueInvoices} overdue, ` +
        `${metrics.dueSoonInvoices} due within 7 days, and ${metrics.paymentsTodayCount} payments today.`,
      quickActions: ['Open dashboard', 'Review overdue invoices', 'View payments', 'Generate report'],
      suggestedRoute: '/dashboard'
    };
  }

  if (/(invoice|billing|overdue|reminder)/.test(normalized)) {
    return {
      reply:
        `Invoice health: ${metrics.totalInvoices} total invoices, ${metrics.unpaidInvoices} unpaid, and ${metrics.overdueInvoices} overdue. ` +
        'I recommend reviewing overdue invoices first and sending reminders.',
      quickActions: ['Review overdue invoices', 'Open invoices', 'View payments', 'Generate report'],
      suggestedRoute: '/invoices'
    };
  }

  if (/(payment|revenue|collection|transaction)/.test(normalized)) {
    return {
      reply:
        `Today so far: ${metrics.paymentsTodayCount} completed payments with a total amount of ${metrics.paymentsTodayAmount.toFixed(2)}. ` +
        'You can drill into transactions and reconciliation from Payments.',
      quickActions: ['View payments', 'Open dashboard', 'Generate report', 'Review invoices'],
      suggestedRoute: '/payments'
    };
  }

  if (/(inventory|stock|product|warehouse)/.test(normalized)) {
    return {
      reply:
        `Inventory status: ${metrics.lowStockProducts} low-stock products and ${metrics.outOfStockProducts} out-of-stock products. ` +
        'I suggest prioritizing replenishment for out-of-stock items first.',
      quickActions: ['Check inventory', 'Open products', 'Generate report', 'Talk to specialist'],
      suggestedRoute: '/inventory'
    };
  }

  if (/(report|analytics|export)/.test(normalized)) {
    return {
      reply:
        'I can guide report workflows for revenue, invoice aging, and inventory risk. ' +
        'Open Reports to generate and export the breakdown you need.',
      quickActions: ['Generate report', 'Open dashboard', 'Review invoices', 'Check inventory'],
      suggestedRoute: '/reports'
    };
  }

  if (/(human|agent|specialist|support|escalate)/.test(normalized)) {
    return {
      reply:
        'A specialist can continue this conversation. Share your issue summary and priority, and we will route it to the right team.',
      quickActions: ['Open support center', 'Review invoices', 'View payments', 'Check inventory'],
      suggestedRoute: '/support'
    };
  }

  return {
    reply:
      'I can assist with invoice collections, payment tracking, inventory alerts, and executive summaries. ' +
      'Tell me your goal and I will suggest the fastest path.',
    quickActions: ['Open dashboard', 'Review invoices', 'View payments', 'Check inventory'],
    suggestedRoute: '/dashboard'
  };
};

// @desc    Get live chat eligibility for current account
// @route   GET /api/v1/livechat/eligibility
// @access  Private
exports.getLiveChatEligibility = asyncHandler(async (req, res) => {
  const billingOwner = await resolveBillingOwner(req.user);
  await expireSubscriptionIfNeeded(billingOwner);
  await syncBusinessFromUser(billingOwner);

  const planId = resolveEffectivePlan(billingOwner);
  const planDef = getPlanDefinition(planId);
  const canAccess = Boolean(planDef.allowLiveChat);

  res.status(200).json({
    success: true,
    data: {
      canAccess,
      accessLevel: ELITE_ACCESS_LEVEL,
      requiredPlan: 'enterprise',
      plan: planId,
      subscriptionStatus: billingOwner?.subscriptionStatus || 'active',
      reason: canAccess
        ? ''
        : 'Live chat is reserved for Elite Enterprise accounts. Upgrade to Enterprise to unlock this channel.'
    }
  });
});

// @desc    Get enterprise live chat status and context
// @route   GET /api/v1/livechat/status
// @access  Private (Enterprise only)
exports.getLiveChatStatus = asyncHandler(async (req, res) => {
  const billingOwner = await resolveBillingOwner(req.user);
  const businessId = resolveBusinessId(req.user, billingOwner);

  const [metrics, business] = await Promise.all([
    buildBusinessMetrics(businessId),
    Business.findById(businessId).select('name currency').lean()
  ]);

  res.status(200).json({
    success: true,
    data: {
      isEnabled: true,
      accessLevel: ELITE_ACCESS_LEVEL,
      plan: resolveEffectivePlan(billingOwner),
      subscriptionStatus: billingOwner?.subscriptionStatus || 'active',
      business: {
        name: business?.name || '',
        currency: business?.currency || 'USD'
      },
      availability: SUPPORT_HOURS,
      capabilities: [
        'Invoice operations support',
        'Payment and collections guidance',
        'Inventory risk alerts',
        'Enterprise onboarding escalation'
      ],
      metrics
    }
  });
});

// @desc    Send message to enterprise live chat assistant
// @route   POST /api/v1/livechat/message
// @access  Private (Enterprise only)
exports.sendLiveChatMessage = asyncHandler(async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) {
    return res.status(400).json({
      success: false,
      error: 'Please provide a message.'
    });
  }

  const billingOwner = await resolveBillingOwner(req.user);
  const businessId = resolveBusinessId(req.user, billingOwner);
  const [metrics, business] = await Promise.all([
    buildBusinessMetrics(businessId),
    Business.findById(businessId).select('name').lean()
  ]);

  const payload = createReplyPayload(message, metrics, business?.name || '');

  res.status(200).json({
    success: true,
    data: {
      ...payload,
      accessLevel: ELITE_ACCESS_LEVEL,
      generatedAt: new Date().toISOString(),
      metrics
    }
  });
});
