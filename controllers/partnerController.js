const crypto = require('crypto');
const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const Business = require('../models/Business');
const InventoryTransaction = require('../models/InventoryTransaction');
const PartnerIdempotencyKey = require('../models/PartnerIdempotencyKey');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const generatePDF = require('../utils/generatePDF');
const { calculateInvoiceTotals, toNumber } = require('../utils/invoiceCalculator');
const { getTaxSettings } = require('../utils/taxSettings');
const { normalizePlanId } = require('../utils/planConfig');
const { resolveEffectivePlan } = require('../utils/subscriptionService');
const {
  resolveCanonicalTemplateId,
  resolveBusinessTemplateContext,
  resolvePartnerAllowedTemplateIds
} = require('../utils/templateAccess');

const IDEMPOTENCY_ENDPOINT = 'POST:/api/v1/partner/invoices';

const hasValue = (value) => value !== undefined && value !== null;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const stableStringify = (value) => {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

const hashPayload = (payload) => crypto
  .createHash('sha256')
  .update(stableStringify(payload || {}))
  .digest('hex');

const parseDateOrNull = (value) => {
  if (!hasValue(value)) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const isMultiCurrencyAllowed = (plan) =>
  ['professional', 'enterprise'].includes(normalizePlanId(plan));

const resolveInvoiceCurrency = (business, requestedCurrency) => {
  const businessCurrency = (business?.currency || 'USD').toString().trim().toUpperCase();
  const requested = requestedCurrency ? String(requestedCurrency).trim().toUpperCase() : '';
  return requested || businessCurrency;
};

const resolveCustomer = async ({ businessId, payload, createdBy }) => {
  const directCustomerId = String(payload.customerId || '').trim();
  if (directCustomerId) {
    if (!mongoose.Types.ObjectId.isValid(directCustomerId)) {
      throw new ErrorResponse('Invalid customerId supplied', 400);
    }

    const existingById = await Customer.findOne({
      _id: directCustomerId,
      business: businessId
    });

    if (!existingById) {
      throw new ErrorResponse('Customer not found for this business', 404);
    }

    return existingById;
  }

  const customerInput = payload.customer && typeof payload.customer === 'object'
    ? payload.customer
    : {};
  const name = String(
    customerInput.name
    || payload.customerName
    || payload.clientName
    || ''
  ).trim();
  const email = normalizeEmail(
    customerInput.email
    || payload.customerEmail
    || payload.clientEmail
    || ''
  );
  const phone = String(customerInput.phone || payload.customerPhone || '').trim();
  const company = String(customerInput.company || '').trim();

  if (!name && !email) {
    throw new ErrorResponse('Provide customerId or customer details (name/email).', 400);
  }

  let customer = null;
  if (email) {
    customer = await Customer.findOne({ business: businessId, email });
  } else if (phone) {
    customer = await Customer.findOne({ business: businessId, phone });
  }

  if (customer) {
    let changed = false;

    if (name && customer.name !== name) {
      customer.name = name;
      changed = true;
    }
    if (email && customer.email !== email) {
      customer.email = email;
      changed = true;
    }
    if (phone && customer.phone !== phone) {
      customer.phone = phone;
      changed = true;
    }
    if (company && customer.company !== company) {
      customer.company = company;
      changed = true;
    }

    if (customerInput.address && typeof customerInput.address === 'object') {
      customer.address = {
        ...(customer.address || {}),
        ...customerInput.address
      };
      changed = true;
    }

    if (changed) {
      await customer.save();
    }

    return customer;
  }

  const customerPayload = {
    business: businessId,
    createdBy,
    name: name || email,
    email: email || undefined,
    phone: phone || undefined,
    company: company || undefined,
    address: customerInput.address || undefined
  };

  return Customer.create(customerPayload);
};

const normalizeItems = async ({ businessId, items }) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ErrorResponse('At least one invoice item is required', 400);
  }

  const normalized = [];
  const productMap = new Map();

  for (const rawItem of items) {
    const description = String(rawItem?.description || rawItem?.name || '').trim();
    const quantity = toNumber(rawItem?.quantity, NaN);
    const unitPrice = toNumber(rawItem?.unitPrice ?? rawItem?.rate ?? rawItem?.price, NaN);
    const taxRate = toNumber(rawItem?.taxRate, 0);
    const discount = toNumber(rawItem?.discount, 0);
    const discountType = rawItem?.discountType === 'percentage' ? 'percentage' : 'fixed';

    if (!description) {
      throw new ErrorResponse('Each item must include a description', 400);
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ErrorResponse(`Invalid quantity for item "${description}"`, 400);
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new ErrorResponse(`Invalid unitPrice for item "${description}"`, 400);
    }

    let productDoc = null;
    if (rawItem?.product) {
      if (!mongoose.Types.ObjectId.isValid(rawItem.product)) {
        throw new ErrorResponse(`Invalid product id for item "${description}"`, 400);
      }

      productDoc = await Product.findOne({
        _id: rawItem.product,
        business: businessId
      });

      if (!productDoc) {
        throw new ErrorResponse(`Product not found for item "${description}"`, 404);
      }

      if (productDoc.trackInventory && productDoc.stock.available < quantity) {
        throw new ErrorResponse(
          `Insufficient stock for ${productDoc.name}. Available: ${productDoc.stock.available}`,
          400
        );
      }

      productMap.set(productDoc._id.toString(), productDoc);
    }

    normalized.push({
      product: productDoc?._id || undefined,
      sku: String(rawItem?.sku || productDoc?.sku || '').trim(),
      description,
      quantity,
      unitPrice,
      taxRate,
      discount,
      discountType,
      taxAmount: 0,
      total: 0
    });
  }

  return { normalized, productMap };
};

const resolveTaxConfiguration = async (payload) => {
  const taxSettings = await getTaxSettings();
  const requestedRate = hasValue(payload.taxRateUsed)
    ? payload.taxRateUsed
    : payload.taxRate;
  const requestedAmount = hasValue(payload.taxAmount)
    ? payload.taxAmount
    : payload.tax?.amount;
  const requestedName = hasValue(payload.taxName)
    ? payload.taxName
    : payload.tax?.description;

  const manualOverrideRequested = hasValue(requestedRate)
    || hasValue(requestedAmount)
    || Boolean(payload.isTaxOverridden);

  if (manualOverrideRequested && !taxSettings.allowManualOverride) {
    throw new ErrorResponse('Manual tax override is not enabled', 403);
  }

  let taxRateUsed = taxSettings.taxEnabled ? toNumber(taxSettings.taxRate, 0) : 0;
  let taxAmountOverride = null;
  let isTaxOverridden = false;
  let taxName = taxSettings.taxName || 'VAT';

  if (taxSettings.taxEnabled && manualOverrideRequested) {
    isTaxOverridden = true;
    if (hasValue(requestedRate)) taxRateUsed = toNumber(requestedRate, taxRateUsed);
    if (hasValue(requestedAmount)) taxAmountOverride = requestedAmount;
    if (hasValue(requestedName)) taxName = String(requestedName).trim() || taxName;
  }

  if (!taxSettings.taxEnabled) {
    taxRateUsed = 0;
    taxAmountOverride = 0;
    isTaxOverridden = false;
  }

  return {
    taxRateUsed,
    taxAmountOverride,
    isTaxOverridden,
    taxName
  };
};

const validateTemplateAccess = ({ requestedTemplate, partner, templateContext }) => {
  const accessible = templateContext.accessibleTemplateIds;
  const allowedTemplateIds = resolvePartnerAllowedTemplateIds(partner, templateContext);
  const allowedSet = new Set(allowedTemplateIds);

  if (!allowedTemplateIds.length) {
    throw new ErrorResponse('No templates are currently enabled for this API key', 403);
  }

  const resolvedTemplateId = resolveCanonicalTemplateId(
    requestedTemplate || partner?.defaultTemplateId || 'standard',
    templateContext.templateLookup,
    partner?.defaultTemplateId || 'standard'
  );

  if (!accessible.has(resolvedTemplateId)) {
    throw new ErrorResponse('Requested template is not available on this business plan', 403);
  }

  if (!allowedSet.has(resolvedTemplateId)) {
    throw new ErrorResponse('Requested template is not enabled for this API key', 403);
  }

  return {
    templateId: resolvedTemplateId,
    allowedTemplateIds
  };
};

const findIdempotentReplay = async ({ partnerId, idempotencyKey, requestHash }) => {
  if (!idempotencyKey) {
    return null;
  }

  const existingKey = await PartnerIdempotencyKey.findOne({
    partner: partnerId,
    endpoint: IDEMPOTENCY_ENDPOINT,
    idempotencyKey
  });

  if (!existingKey) {
    return null;
  }

  if (existingKey.requestHash !== requestHash) {
    throw new ErrorResponse('Idempotency key has already been used with different request data', 409);
  }

  const existingInvoice = await Invoice.findById(existingKey.invoice)
    .populate('customer', 'name email phone company')
    .populate('business', 'name email');

  if (!existingInvoice) {
    await existingKey.deleteOne();
    return null;
  }

  return existingInvoice;
};

// @desc    List templates available to this partner API key
// @route   GET /api/v1/partner/templates
// @access  Partner API key
exports.getPartnerTemplates = asyncHandler(async (req, res) => {
  const templateContext = await resolveBusinessTemplateContext({
    businessId: req.partner.business,
    billingOwner: req.partnerBillingOwner
  });

  const allowedTemplateIds = new Set(resolvePartnerAllowedTemplateIds(req.partner, templateContext));

  const templates = templateContext.templates
    .filter((template) => allowedTemplateIds.has(template.id))
    .map((template) => ({
      id: template.id,
      name: template.name,
      category: template.category,
      templateStyle: template.templateStyle,
      previewColor: template.previewColor
    }));

  res.status(200).json({
    success: true,
    count: templates.length,
    data: templates,
    meta: {
      allowAllTemplates: Boolean(req.partner.allowAllTemplates),
      allowedTemplateIds: Array.from(allowedTemplateIds),
      planId: templateContext.planId
    }
  });
});

// @desc    Create invoice with partner API key
// @route   POST /api/v1/partner/invoices
// @access  Partner API key
exports.createPartnerInvoice = asyncHandler(async (req, res, next) => {
  const partner = req.partner;
  const business = await Business.findById(partner.business).select(
    '_id owner isActive invoiceSettings currency'
  );

  if (!business || business.isActive === false) {
    return next(new ErrorResponse('Business not available', 404));
  }

  const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
  const requestHash = hashPayload(req.body);
  const replayInvoice = await findIdempotentReplay({
    partnerId: partner._id,
    idempotencyKey,
    requestHash
  });
  if (replayInvoice) {
    return res.status(200).json({
      success: true,
      idempotentReplay: true,
      data: replayInvoice
    });
  }

  const createdBy = business.owner || undefined;
  const billingPlan = resolveEffectivePlan(req.partnerBillingOwner);
  const currency = resolveInvoiceCurrency(business, req.body.currency);
  if (!isMultiCurrencyAllowed(billingPlan) && currency !== business.currency) {
    return next(new ErrorResponse('Multi-currency is available on Professional and Enterprise plans.', 403));
  }

  const templateContext = await resolveBusinessTemplateContext({
    businessId: business._id,
    billingOwner: req.partnerBillingOwner
  });
  const { templateId } = validateTemplateAccess({
    requestedTemplate: req.body.templateStyle || req.body.templateId || req.body.template,
    partner,
    templateContext
  });

  const customer = await resolveCustomer({
    businessId: business._id,
    payload: req.body,
    createdBy
  });

  const { normalized: normalizedItems, productMap } = await normalizeItems({
    businessId: business._id,
    items: req.body.items
  });

  const dueDate = parseDateOrNull(req.body.dueDate)
    || new Date(Date.now() + (business.invoiceSettings?.dueDays || 30) * 24 * 60 * 60 * 1000);
  if (!dueDate) {
    return next(new ErrorResponse('Invalid due date supplied', 400));
  }

  const invoiceDate = parseDateOrNull(req.body.date) || new Date();

  const {
    taxRateUsed,
    taxAmountOverride,
    isTaxOverridden,
    taxName
  } = await resolveTaxConfiguration(req.body);

  let totals;
  try {
    totals = calculateInvoiceTotals({
      items: normalizedItems,
      discount: req.body.discount,
      shipping: req.body.shipping,
      taxRateUsed,
      taxAmountOverride,
      isTaxOverridden,
      amountPaid: req.body.amountPaid
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }

  const invoicePayload = {
    business: business._id,
    customer: customer._id,
    clientEmail: normalizeEmail(
      req.body.clientEmail || req.body.customerEmail || customer.email || ''
    ) || undefined,
    date: invoiceDate,
    dueDate,
    items: totals.items,
    subtotal: totals.subtotal,
    discount: req.body.discount,
    tax: {
      ...(req.body.tax || {}),
      amount: totals.taxAmount,
      percentage: taxRateUsed,
      description: taxName
    },
    taxName,
    taxRateUsed,
    taxAmount: totals.taxAmount,
    isTaxOverridden,
    shipping: req.body.shipping,
    total: totals.total,
    amountPaid: totals.amountPaid,
    balance: totals.balance,
    status: req.body.status || 'draft',
    paymentTerms: req.body.paymentTerms,
    notes: req.body.notes,
    terms: req.body.terms,
    templateStyle: templateId,
    currency,
    exchangeRate: req.body.exchangeRate || 1,
    createdBy,
    partnerIntegration: partner._id,
    partnerMetadata: {
      source: String(req.body.source || '').trim(),
      externalReference: String(req.body.externalReference || '').trim()
    }
  };

  const invoice = await Invoice.create(invoicePayload);

  for (const item of totals.items) {
    if (!item.product) continue;
    const product = productMap.get(item.product.toString());
    if (!product || !product.trackInventory) continue;

    product.stock.reserved += item.quantity;
    product.stock.available = product.stock.quantity - product.stock.reserved;
    await product.save();

    await InventoryTransaction.create({
      business: business._id,
      product: product._id,
      type: 'sale_reserved',
      quantity: -item.quantity,
      reference: `Partner Invoice: ${invoice.invoiceNumber}`,
      createdBy
    });
  }

  await Customer.updateCustomerStats(customer._id);

  if (idempotencyKey) {
    await PartnerIdempotencyKey.findOneAndUpdate(
      {
        partner: partner._id,
        endpoint: IDEMPOTENCY_ENDPOINT,
        idempotencyKey
      },
      {
        $setOnInsert: {
          business: business._id,
          requestHash,
          invoice: invoice._id
        }
      },
      {
        upsert: true,
        new: false
      }
    );
  }

  const createdInvoice = await Invoice.findById(invoice._id)
    .populate('customer', 'name email phone company')
    .populate('business', 'name email');

  res.status(201).json({
    success: true,
    data: createdInvoice
  });
});

// @desc    Get partner-created invoice
// @route   GET /api/v1/partner/invoices/:id
// @access  Partner API key
exports.getPartnerInvoice = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    business: req.partner.business,
    partnerIntegration: req.partner._id
  })
    .populate('customer', 'name email phone company')
    .populate('business', 'name email')
    .populate('items.product', 'name sku');

  if (!invoice) {
    return next(new ErrorResponse('Invoice not found for this API key', 404));
  }

  res.status(200).json({
    success: true,
    data: invoice
  });
});

// @desc    Download partner-created invoice PDF
// @route   GET /api/v1/partner/invoices/:id/pdf
// @access  Partner API key
exports.getPartnerInvoicePDF = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findOne({
    _id: req.params.id,
    business: req.partner.business,
    partnerIntegration: req.partner._id
  })
    .populate('customer')
    .populate('business')
    .populate('items.product');

  if (!invoice) {
    return next(new ErrorResponse('Invoice not found for this API key', 404));
  }

  const pdfBuffer = await generatePDF.invoice(invoice, {
    templateStyle: invoice.templateStyle
  });

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`,
    'Content-Length': pdfBuffer.length
  });

  res.send(pdfBuffer);
});
