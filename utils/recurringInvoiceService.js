const Invoice = require('../models/Invoice');
const Business = require('../models/Business');
const Product = require('../models/Product');
const User = require('../models/User');
const InventoryTransaction = require('../models/InventoryTransaction');
const Customer = require('../models/Customer');
const { getPlanDefinition } = require('./planConfig');
const {
  resolveBillingOwner,
  resolveEffectivePlan,
  resetInvoiceCountIfNeeded,
  resolveInvoiceLimit
} = require('./subscriptionService');

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const addDays = (date, days) => new Date(date.getTime() + (days * 24 * 60 * 60 * 1000));

const normalizeDate = (value, fallbackDate = null) => {
  if (!value) return fallbackDate ? new Date(fallbackDate) : null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallbackDate ? new Date(fallbackDate) : null;
  }
  return parsed;
};

const clonePlain = (value) => {
  if (value == null) return value;
  if (typeof value?.toObject === 'function') {
    return value.toObject();
  }
  return JSON.parse(JSON.stringify(value));
};

const normalizeSubdocument = (value) => {
  const cloned = clonePlain(value) || {};
  delete cloned._id;
  delete cloned.id;
  return cloned;
};

const addMonthsPreservingDay = (inputDate, monthCount) => {
  const source = new Date(inputDate);
  const day = source.getDate();
  const result = new Date(source);
  result.setDate(1);
  result.setMonth(result.getMonth() + monthCount);
  const maxDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, maxDay));
  return result;
};

const addRecurringInterval = (dateValue, frequency = 'monthly', interval = 1) => {
  const date = normalizeDate(dateValue, new Date());
  const safeInterval = Math.max(1, parsePositiveInt(interval, 1));
  const normalizedFrequency = String(frequency || 'monthly').toLowerCase();

  if (normalizedFrequency === 'daily') {
    return addDays(date, safeInterval);
  }

  if (normalizedFrequency === 'weekly') {
    return addDays(date, safeInterval * 7);
  }

  if (normalizedFrequency === 'quarterly') {
    return addMonthsPreservingDay(date, safeInterval * 3);
  }

  if (normalizedFrequency === 'yearly') {
    return addMonthsPreservingDay(date, safeInterval * 12);
  }

  return addMonthsPreservingDay(date, safeInterval);
};

const resolveStockAvailability = (product = {}) => {
  const quantity = Math.max(0, toFiniteNumber(product?.stock?.quantity, 0));
  const reserved = Math.max(0, toFiniteNumber(product?.stock?.reserved, 0));
  return Math.max(0, quantity - reserved);
};

const buildItemQuantityMap = (items = []) => {
  const itemMap = new Map();
  items.forEach((item) => {
    const productId = item?.product ? String(item.product) : '';
    const quantity = Math.max(0, toFiniteNumber(item?.quantity, 0));
    if (!productId || quantity <= 0) return;
    itemMap.set(productId, (itemMap.get(productId) || 0) + quantity);
  });
  return itemMap;
};

const validateStockAvailability = async (items = []) => {
  const quantityMap = buildItemQuantityMap(items);
  if (quantityMap.size === 0) {
    return [];
  }

  const productIds = Array.from(quantityMap.keys());
  const products = await Product.find({ _id: { $in: productIds } });
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  const reservations = [];
  for (const [productId, requiredQuantity] of quantityMap.entries()) {
    const product = productMap.get(productId);
    if (!product || !product.trackInventory) continue;

    const availableStock = resolveStockAvailability(product);
    if (availableStock < requiredQuantity) {
      throw new Error(`Insufficient stock for ${product.name}. Available: ${availableStock}`);
    }

    reservations.push({ product, quantity: requiredQuantity });
  }

  return reservations;
};

const reserveStock = async ({ reservations, businessId, createdBy, invoiceNumber }) => {
  for (const reservation of reservations) {
    const { product, quantity } = reservation;
    product.stock.reserved = Math.max(0, toFiniteNumber(product.stock.reserved, 0)) + quantity;
    product.stock.available = Math.max(0, toFiniteNumber(product.stock.quantity, 0) - product.stock.reserved);
    await product.save();

    await InventoryTransaction.create({
      business: businessId,
      product: product._id,
      type: 'sale_reserved',
      quantity: -quantity,
      reference: `Recurring Invoice: ${invoiceNumber}`,
      createdBy
    });
  }
};

const resolveDueDays = (templateInvoice, defaultDays = 30) => {
  const issueDate = normalizeDate(templateInvoice?.date, null);
  const dueDate = normalizeDate(templateInvoice?.dueDate, null);
  if (!issueDate || !dueDate) return defaultDays;

  const delta = Math.round((dueDate.getTime() - issueDate.getTime()) / (24 * 60 * 60 * 1000));
  if (!Number.isFinite(delta) || delta < 0) return defaultDays;
  return delta;
};

const findExistingOccurrenceInvoice = async ({ businessId, parentInvoiceId, occurrenceDate }) => {
  const start = new Date(occurrenceDate);
  start.setSeconds(0, 0);
  const end = new Date(start.getTime() + 60 * 1000);

  return Invoice.findOne({
    business: businessId,
    'recurring.parentInvoice': parentInvoiceId,
    date: { $gte: start, $lt: end }
  });
};

const resolveBillingOwnerForTemplate = async (templateInvoice, billingOwnerCache = new Map()) => {
  const businessId = String(templateInvoice?.business || '');
  if (!businessId) return null;

  if (billingOwnerCache.has(businessId)) {
    return billingOwnerCache.get(businessId);
  }

  let candidate = null;
  if (templateInvoice?.createdBy) {
    candidate = await User.findById(templateInvoice.createdBy);
  }

  if (!candidate) {
    const business = await Business.findById(templateInvoice.business).select('owner');
    if (business?.owner) {
      candidate = await User.findById(business.owner);
    }
  }

  if (!candidate) {
    billingOwnerCache.set(businessId, null);
    return null;
  }

  const owner = await resolveBillingOwner(candidate);
  billingOwnerCache.set(businessId, owner || null);
  return owner || null;
};

const enforceRecurringGenerationLimits = async ({
  templateInvoice,
  billingOwnerCache,
  skipChecks = false
}) => {
  if (skipChecks) {
    return { allowed: true, billingOwner: null };
  }

  const billingOwner = await resolveBillingOwnerForTemplate(templateInvoice, billingOwnerCache);
  if (!billingOwner) {
    return { allowed: true, billingOwner: null };
  }

  await resetInvoiceCountIfNeeded(billingOwner);
  const planId = resolveEffectivePlan(billingOwner);
  const planDef = getPlanDefinition(planId);
  if (!planDef?.allowRecurring) {
    return {
      allowed: false,
      reason: `Recurring invoices are unavailable on ${planDef?.name || planId} plan.`,
      billingOwner
    };
  }

  const limit = resolveInvoiceLimit(billingOwner);
  if (Number.isFinite(limit) && toFiniteNumber(billingOwner.invoiceCountThisMonth, 0) >= limit) {
    return {
      allowed: false,
      reason: 'Invoice limit reached for current billing period.',
      billingOwner
    };
  }

  return { allowed: true, billingOwner };
};

const incrementBillingOwnerInvoiceCount = async (billingOwner) => {
  if (!billingOwner?._id) return;
  billingOwner.invoiceCountThisMonth = toFiniteNumber(billingOwner.invoiceCountThisMonth, 0) + 1;
  await billingOwner.save();
};

const buildGeneratedInvoicePayload = ({
  templateInvoice,
  occurrenceDate,
  invoiceNumber,
  generatedBy
}) => {
  const clonedItems = Array.isArray(templateInvoice.items)
    ? templateInvoice.items.map((item) => normalizeSubdocument(item))
    : [];

  const dueDays = resolveDueDays(templateInvoice);
  const subtotal = toFiniteNumber(templateInvoice.subtotal, 0);
  const total = toFiniteNumber(templateInvoice.total, 0);
  const taxAmount = toFiniteNumber(templateInvoice.taxAmount ?? templateInvoice.tax?.amount, 0);
  const amountPaid = 0;

  return {
    business: templateInvoice.business,
    invoiceNumber,
    customer: templateInvoice.customer,
    clientEmail: templateInvoice.clientEmail,
    date: occurrenceDate,
    dueDate: addDays(occurrenceDate, dueDays),
    items: clonedItems,
    subtotal,
    discount: normalizeSubdocument(templateInvoice.discount || {}),
    tax: normalizeSubdocument(templateInvoice.tax || {}),
    taxName: templateInvoice.taxName,
    taxRateUsed: toFiniteNumber(templateInvoice.taxRateUsed, 0),
    taxAmount,
    isTaxOverridden: Boolean(templateInvoice.isTaxOverridden),
    shipping: normalizeSubdocument(templateInvoice.shipping || {}),
    total,
    amountPaid,
    balance: total,
    status: 'draft',
    paymentTerms: templateInvoice.paymentTerms,
    notes: templateInvoice.notes,
    terms: templateInvoice.terms,
    templateStyle: templateInvoice.templateStyle || 'standard',
    emailSubject: templateInvoice.emailSubject,
    emailMessage: templateInvoice.emailMessage,
    footerNotes: templateInvoice.footerNotes,
    currency: templateInvoice.currency || 'USD',
    recurring: {
      isRecurring: false,
      parentInvoice: templateInvoice._id
    },
    createdBy: generatedBy || templateInvoice.updatedBy || templateInvoice.createdBy,
    updatedBy: generatedBy || templateInvoice.updatedBy || templateInvoice.createdBy
  };
};

const createInvoiceFromRecurringTemplate = async ({
  templateInvoice,
  occurrenceDate,
  generatedBy,
  billingOwner
}) => {
  const businessId = templateInvoice.business?._id || templateInvoice.business;
  if (!businessId) {
    throw new Error('Recurring invoice is missing business reference');
  }

  const existing = await findExistingOccurrenceInvoice({
    businessId,
    parentInvoiceId: templateInvoice._id,
    occurrenceDate
  });
  if (existing) {
    return { created: false, invoice: existing, duplicate: true };
  }

  const business = await Business.findById(businessId);
  if (!business) {
    throw new Error('Business not found for recurring invoice generation');
  }

  const invoiceNumber = await business.getNextInvoiceNumber();
  const reservations = await validateStockAvailability(templateInvoice.items || []);

  const payload = buildGeneratedInvoicePayload({
    templateInvoice,
    occurrenceDate,
    invoiceNumber,
    generatedBy
  });

  let createdInvoice = null;
  try {
    createdInvoice = await Invoice.create(payload);
    await reserveStock({
      reservations,
      businessId,
      createdBy: generatedBy || templateInvoice.updatedBy || templateInvoice.createdBy,
      invoiceNumber: createdInvoice.invoiceNumber
    });
  } catch (error) {
    if (createdInvoice?._id) {
      await Invoice.deleteOne({ _id: createdInvoice._id });
    }
    throw error;
  }

  await incrementBillingOwnerInvoiceCount(billingOwner);
  if (templateInvoice.customer) {
    await Customer.updateCustomerStats(templateInvoice.customer);
  }
  return { created: true, invoice: createdInvoice, duplicate: false };
};

const shouldMarkRecurringCompleted = ({ recurring, nextInvoiceDate, completedCycles }) => {
  if (!recurring) return false;

  if (toFiniteNumber(recurring.totalCycles, 0) > 0 && completedCycles >= recurring.totalCycles) {
    return true;
  }

  const endDate = normalizeDate(recurring.endDate, null);
  if (endDate && nextInvoiceDate > endDate) {
    return true;
  }

  return false;
};

const processRecurringTemplateInvoice = async (templateInvoice, options = {}) => {
  const now = normalizeDate(options.now, new Date()) || new Date();
  const force = options.force === true;
  const maxOccurrencesPerTemplate = Math.max(
    1,
    parsePositiveInt(
      options.maxOccurrencesPerTemplate,
      parsePositiveInt(process.env.RECURRING_INVOICE_MAX_OCCURRENCES_PER_TEMPLATE, 6)
    )
  );
  const billingOwnerCache = options.billingOwnerCache || new Map();
  const generatedBy = options.generatedBy || templateInvoice.updatedBy || templateInvoice.createdBy;
  const skipLimitChecks = options.skipLimitChecks === true;

  const recurring = templateInvoice?.recurring || {};
  const startDate = normalizeDate(recurring.startDate, templateInvoice.date || now);
  let nextInvoiceDate = normalizeDate(recurring.nextInvoiceDate, startDate || now);
  let completedCycles = Math.max(0, toFiniteNumber(recurring.completedCycles, 0));
  const frequency = String(recurring.frequency || 'monthly').toLowerCase();
  const interval = Math.max(1, parsePositiveInt(recurring.interval, 1));
  const endDate = normalizeDate(recurring.endDate, null);
  const totalCycles = Math.max(0, toFiniteNumber(recurring.totalCycles, 0));

  const result = {
    templateInvoiceId: String(templateInvoice._id),
    generatedCount: 0,
    duplicateCount: 0,
    blockedReason: '',
    errors: [],
    latestGeneratedInvoice: null,
    updated: false
  };

  let processedAnyOccurrence = false;
  for (let loop = 0; loop < maxOccurrencesPerTemplate; loop += 1) {
    if (!force && nextInvoiceDate > now) {
      break;
    }

    if (endDate && nextInvoiceDate > endDate) {
      break;
    }

    if (totalCycles > 0 && completedCycles >= totalCycles) {
      break;
    }

    const limitCheck = await enforceRecurringGenerationLimits({
      templateInvoice,
      billingOwnerCache,
      skipChecks: skipLimitChecks
    });
    if (!limitCheck.allowed) {
      result.blockedReason = limitCheck.reason;
      break;
    }

    const occurrenceDate = force ? now : nextInvoiceDate;
    const createResult = await createInvoiceFromRecurringTemplate({
      templateInvoice,
      occurrenceDate,
      generatedBy,
      billingOwner: limitCheck.billingOwner
    });

    if (createResult.created) {
      result.generatedCount += 1;
      result.latestGeneratedInvoice = createResult.invoice;
    } else if (createResult.duplicate) {
      result.duplicateCount += 1;
    }

    processedAnyOccurrence = true;
    completedCycles += 1;
    nextInvoiceDate = addRecurringInterval(occurrenceDate, frequency, interval);

    if (force) {
      break;
    }
  }

  const shouldComplete = shouldMarkRecurringCompleted({
    recurring,
    nextInvoiceDate,
    completedCycles
  });
  const nextStatus = shouldComplete ? 'completed' : (recurring.status || 'active');
  const needsUpdate = processedAnyOccurrence
    || nextStatus !== recurring.status
    || String(nextInvoiceDate) !== String(recurring.nextInvoiceDate)
    || completedCycles !== toFiniteNumber(recurring.completedCycles, 0);

  if (needsUpdate) {
    templateInvoice.recurring = {
      ...(templateInvoice.recurring?.toObject?.() || templateInvoice.recurring || {}),
      isRecurring: true,
      status: nextStatus,
      frequency,
      interval,
      startDate: startDate || nextInvoiceDate,
      endDate,
      nextInvoiceDate,
      totalCycles: totalCycles || undefined,
      completedCycles
    };
    templateInvoice.updatedBy = generatedBy || templateInvoice.updatedBy;
    await templateInvoice.save();
    result.updated = true;
  }

  return result;
};

const processDueRecurringInvoices = async (options = {}) => {
  const now = normalizeDate(options.now, new Date()) || new Date();
  const maxTemplatesPerRun = Math.max(
    1,
    parsePositiveInt(
      options.maxTemplatesPerRun,
      parsePositiveInt(process.env.RECURRING_INVOICE_MAX_TEMPLATES_PER_RUN, 100)
    )
  );
  const maxOccurrencesPerTemplate = Math.max(
    1,
    parsePositiveInt(
      options.maxOccurrencesPerTemplate,
      parsePositiveInt(process.env.RECURRING_INVOICE_MAX_OCCURRENCES_PER_TEMPLATE, 6)
    )
  );

  const templates = await Invoice.find({
    'recurring.isRecurring': true,
    'recurring.status': 'active',
    'recurring.nextInvoiceDate': { $lte: now },
    status: { $nin: ['cancelled', 'void'] }
  })
    .sort({ 'recurring.nextInvoiceDate': 1, createdAt: 1 })
    .limit(maxTemplatesPerRun);

  const summary = {
    now: now.toISOString(),
    templateCount: templates.length,
    processedTemplates: 0,
    generatedInvoices: 0,
    duplicateInvoices: 0,
    blockedTemplates: 0,
    failedTemplates: 0,
    errors: []
  };

  const billingOwnerCache = new Map();

  for (const template of templates) {
    try {
      const processed = await processRecurringTemplateInvoice(template, {
        now,
        force: false,
        maxOccurrencesPerTemplate,
        billingOwnerCache
      });
      summary.processedTemplates += 1;
      summary.generatedInvoices += processed.generatedCount;
      summary.duplicateInvoices += processed.duplicateCount;
      if (processed.blockedReason) {
        summary.blockedTemplates += 1;
      }
    } catch (error) {
      summary.failedTemplates += 1;
      summary.errors.push({
        invoiceId: String(template._id),
        message: error?.message || 'Recurring generation failed'
      });
    }
  }

  return summary;
};

module.exports = {
  addRecurringInterval,
  processRecurringTemplateInvoice,
  processDueRecurringInvoices
};
