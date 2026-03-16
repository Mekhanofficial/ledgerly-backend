const Invoice = require('../models/Invoice');
const Business = require('../models/Business');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');
const Receipt = require('../models/Receipt');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const sendEmail = require('../utils/email');
const {
  initializeBusinessTransaction,
  verifyBusinessTransaction,
  verifyPaystackSignatureWithSecret
} = require('../utils/businessPaystack');
const { sendInvoicePaymentConfirmationEmails } = require('../utils/invoicePaymentEmails');

const TERMINAL_INVOICE_STATUSES = new Set(['paid', 'cancelled', 'void']);

const toMinorUnits = (amount) => Math.round(Number(amount || 0) * 100);
const toMajorUnits = (amount) => Number((Number(amount || 0) / 100).toFixed(2));
const MAX_CLIENT_EMAIL_PDF_BYTES = Number.parseInt(
  String(process.env.MAX_CLIENT_EMAIL_PDF_BYTES || ''),
  10
) > 0
  ? Number.parseInt(String(process.env.MAX_CLIENT_EMAIL_PDF_BYTES), 10)
  : 15 * 1024 * 1024;
const sanitizeAttachmentFileName = (value, fallback = 'receipt.pdf') => {
  const candidate = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '');
  if (!candidate) return fallback;
  return candidate.toLowerCase().endsWith('.pdf') ? candidate : `${candidate}.pdf`;
};
const decodeBase64PdfBuffer = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = raw.includes('base64,') ? raw.split('base64,').pop() : raw;
  if (!normalized) return null;
  try {
    const buffer = Buffer.from(normalized, 'base64');
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
};
const resolveFrontendPdfAttachment = (payload = {}, defaultFileName = 'receipt.pdf') => {
  const attachment = payload?.pdfAttachment;
  if (!attachment || typeof attachment !== 'object') {
    return null;
  }

  const encoding = String(attachment.encoding || 'base64').trim().toLowerCase();
  if (encoding && encoding !== 'base64') {
    return null;
  }

  const buffer = decodeBase64PdfBuffer(
    attachment.data || attachment.content || attachment.base64 || attachment.base64Data
  );
  if (!buffer) {
    return null;
  }

  if (buffer.length > MAX_CLIENT_EMAIL_PDF_BYTES) {
    throw new ErrorResponse(
      `Attached PDF is too large. Maximum allowed size is ${Math.round(MAX_CLIENT_EMAIL_PDF_BYTES / (1024 * 1024))}MB`,
      413
    );
  }

  if (buffer.slice(0, 4).toString('utf8') !== '%PDF') {
    return null;
  }

  return {
    buffer,
    fileName: sanitizeAttachmentFileName(attachment.fileName || attachment.filename, defaultFileName),
    source: String(attachment.source || 'frontend').trim().toLowerCase()
  };
};
const formatDisplayDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
};

const getFrontendBaseUrl = (req) =>
  (process.env.APP_BASE_URL
    || process.env.FRONTEND_URL
    || process.env.REACT_APP_URL
    || '')
    .replace(/\/+$/, '');

const getBackendBaseUrl = (req) => {
  const configured = (process.env.BACKEND_BASE_URL || '').replace(/\/+$/, '');
  if (configured) return configured;

  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = String(forwardedProto || req.protocol || 'http').split(',')[0].trim();
  const host = req.get('host');
  return `${protocol}://${host}`;
};

const buildPublicPaymentPortalUrl = (req, slug) => {
  const normalizedSlug = String(slug || '').trim();
  if (!normalizedSlug) return '';
  return `${getBackendBaseUrl(req)}/api/v1/invoices/public/${encodeURIComponent(normalizedSlug)}/pay`;
};

const buildInvoiceResultUrl = (req, invoice, status) => {
  const baseUrl = getFrontendBaseUrl(req);
  const slug = invoice?.publicSlug || invoice?._id;
  if (!baseUrl || !slug) return '';
  return `${baseUrl}/invoice/${status}/${slug}`;
};

const maskPublicKey = (key) => {
  const value = String(key || '').trim();
  if (!value) return '';
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 6)}${'*'.repeat(Math.max(4, value.length - 10))}${value.slice(-4)}`;
};

const getGlobalPaystackConfig = () => {
  const publicKey = String(process.env.PAYSTACK_PUBLIC_KEY || '').trim();
  const secretKey = String(process.env.PAYSTACK_SECRET_KEY || '').trim();
  return {
    publicKey,
    secretKey,
    enabled: Boolean(publicKey && secretKey)
  };
};

const normalizeCurrencyCode = (value, fallback = 'NGN') => {
  const normalized = String(value || fallback).trim().toUpperCase();
  return normalized || fallback;
};

const parseSupportedCurrencies = (value, fallback = []) => {
  const tokens = Array.isArray(value)
    ? value
    : String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

  const normalized = [...new Set(
    tokens
      .map((entry) => normalizeCurrencyCode(entry, ''))
      .filter(Boolean)
  )];

  if (normalized.length > 0) return normalized;

  return [...new Set(
    (Array.isArray(fallback) ? fallback : [fallback])
      .map((entry) => normalizeCurrencyCode(entry, ''))
      .filter(Boolean)
  )];
};

const getGlobalSupportedPaystackCurrencies = () => {
  const configured = parseSupportedCurrencies(process.env.PAYSTACK_SUPPORTED_CURRENCIES);
  if (configured.length > 0) return configured;
  return parseSupportedCurrencies(process.env.PAYSTACK_CURRENCY, ['NGN']);
};

const buildUnsupportedCurrencyMessage = (currency, supportedCurrencies = []) => {
  const normalizedCurrency = normalizeCurrencyCode(currency);
  const supported = parseSupportedCurrencies(supportedCurrencies);
  if (supported.length === 0) {
    return `Online payment is not available for ${normalizedCurrency} invoices with the current Paystack configuration.`;
  }
  return `Online payment is not available for ${normalizedCurrency} invoices with the current Paystack configuration. Supported currencies: ${supported.join(', ')}.`;
};

const resolvePublicInvoicePaystackAvailability = ({ invoice, business, businessWithSecret = null } = {}) => {
  const status = String(invoice?.status || '').toLowerCase();
  const amountDue = Number(invoice?.balance ?? 0);
  const invoiceCurrency = normalizeCurrencyCode(invoice?.currency || business?.currency || 'NGN');
  const globalPaystack = getGlobalPaystackConfig();
  const paystackPublicKey = businessWithSecret?.paystack?.publicKey || business?.paystack?.publicKey || '';
  const paystackEnabled = Boolean(
    businessWithSecret?.paystack?.enabled
    ?? business?.paystack?.enabled
  );
  const hasPaystackSecretKey = businessWithSecret
    ? Boolean(businessWithSecret.paystack?.secretKeyEncrypted)
    : false;

  const hasBusinessPaystackConfig =
    paystackEnabled
    && Boolean(String(paystackPublicKey || '').trim())
    && (businessWithSecret ? hasPaystackSecretKey : true);

  const supportedCurrencies = hasBusinessPaystackConfig
    ? parseSupportedCurrencies(
        businessWithSecret?.paystack?.supportedCurrencies
        || business?.paystack?.supportedCurrencies,
        [business?.currency || invoiceCurrency]
      )
    : getGlobalSupportedPaystackCurrencies();

  const hasGatewayConfig = hasBusinessPaystackConfig || globalPaystack.enabled;
  const currencySupported = supportedCurrencies.includes(invoiceCurrency);
  const availabilityReason = !hasGatewayConfig
    ? 'Online payment is not configured for this invoice.'
    : !currencySupported
      ? buildUnsupportedCurrencyMessage(invoiceCurrency, supportedCurrencies)
      : '';

  return {
    invoiceCurrency,
    hasBusinessPaystackConfig,
    hasGatewayConfig,
    supportedCurrencies,
    currencySupported,
    availabilityReason,
    resolvedPublicKey: hasBusinessPaystackConfig ? paystackPublicKey : globalPaystack.publicKey,
    canPayOnline:
      !TERMINAL_INVOICE_STATUSES.has(status)
      && amountDue > 0
      && hasGatewayConfig
      && currencySupported
  };
};

const isObjectIdString = (value) => /^[a-f\d]{24}$/i.test(String(value || '').trim());

const resolvePaystackMetadata = (paystackData = {}) => {
  const rawMetadata = paystackData?.metadata;
  if (!rawMetadata) return {};
  if (typeof rawMetadata === 'object') return rawMetadata;
  if (typeof rawMetadata === 'string') {
    try {
      const parsed = JSON.parse(rawMetadata);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const extractInvoiceIdFromReference = (reference) => {
  const candidate = String(reference || '').trim();
  const match = candidate.match(/^inv_([a-f\d]{24})_\d+$/i);
  return match ? match[1] : '';
};

const runWithGlobalPaystackFallback = async (paystackConnection, operation) => {
  try {
    const result = await operation(paystackConnection.secretKey);
    return {
      result,
      connection: paystackConnection
    };
  } catch (primaryError) {
    if (paystackConnection.source !== 'business') {
      throw primaryError;
    }

    const fallback = getGlobalPaystackConfig();
    const canFallback = fallback.enabled && fallback.secretKey !== paystackConnection.secretKey;
    if (!canFallback) {
      throw primaryError;
    }

    const fallbackConnection = {
      publicKey: fallback.publicKey,
      secretKey: fallback.secretKey,
      source: 'global'
    };
    const result = await operation(fallbackConnection.secretKey);
    return {
      result,
      connection: fallbackConnection
    };
  }
};

const loadPublicInvoice = async (slug) => {
  if (!slug) return null;
  return Invoice.findOne({
    publicSlug: slug,
    publicAccessEnabled: { $ne: false }
  })
    .populate('customer', 'name email')
    .populate('business', 'name email phone address currency paystack');
};

const loadInvoiceByReference = async (reference) => {
  const normalizedReference = String(reference || '').trim();
  const inferredInvoiceId = extractInvoiceIdFromReference(normalizedReference);
  const lookup = [];

  if (normalizedReference) {
    lookup.push({ transactionReference: normalizedReference });
    lookup.push({ paymentReference: normalizedReference });
  }

  if (isObjectIdString(inferredInvoiceId)) {
    lookup.push({ _id: inferredInvoiceId });
  }

  if (lookup.length === 0) return null;

  return Invoice.findOne({ $or: lookup })
    .populate('customer', 'name email')
    .populate('business', 'name email');
};

const loadInvoiceByHints = async ({ reference, invoiceId, slug } = {}) => {
  const normalizedReference = String(reference || '').trim();
  const normalizedInvoiceId = String(invoiceId || '').trim();
  const normalizedSlug = String(slug || '').trim();
  const lookup = [];

  if (normalizedReference) {
    lookup.push({ transactionReference: normalizedReference });
    lookup.push({ paymentReference: normalizedReference });
  }

  const inferredInvoiceId = extractInvoiceIdFromReference(normalizedReference);
  const preferredInvoiceId = isObjectIdString(normalizedInvoiceId)
    ? normalizedInvoiceId
    : inferredInvoiceId;
  if (isObjectIdString(preferredInvoiceId)) {
    lookup.push({ _id: preferredInvoiceId });
  }

  if (normalizedSlug) {
    lookup.push({ publicSlug: normalizedSlug });
  }

  if (lookup.length === 0) return null;

  return Invoice.findOne({ $or: lookup })
    .populate('customer', 'name email')
    .populate('business', 'name email');
};

const assertVerifiedPaymentMatchesInvoice = (invoice, paystackData, reference) => {
  const metadata = resolvePaystackMetadata(paystackData);
  if (!metadata || typeof metadata !== 'object') return;

  const invoiceId = String(invoice?._id || '').trim();
  const invoiceBusinessId = String(invoice?.business?._id || invoice?.business || '').trim();
  const invoiceSlug = String(invoice?.publicSlug || '').trim();

  const metadataInvoiceId = String(
    metadata.invoiceId || metadata.invoice_id || metadata.invoice || ''
  ).trim();
  if (metadataInvoiceId && invoiceId && metadataInvoiceId !== invoiceId) {
    throw new ErrorResponse(`Payment reference ${reference} does not match this invoice`, 400);
  }

  const metadataBusinessId = String(
    metadata.businessId || metadata.business_id || metadata.business || ''
  ).trim();
  if (metadataBusinessId && invoiceBusinessId && metadataBusinessId !== invoiceBusinessId) {
    throw new ErrorResponse(`Payment reference ${reference} does not match this business`, 400);
  }

  const metadataSlug = String(
    metadata.publicSlug || metadata.slug || metadata.public_slug || ''
  ).trim();
  if (metadataSlug && invoiceSlug && metadataSlug !== invoiceSlug) {
    throw new ErrorResponse(`Payment reference ${reference} does not match this invoice link`, 400);
  }
};

const loadBusinessWithSecret = async (businessId) => {
  if (!businessId) return null;
  return Business.findById(businessId).select('+paystack.secretKeyEncrypted');
};

const validateBusinessPaystackConnection = (business) => {
  if (!business) {
    throw new ErrorResponse('Business not found', 404);
  }

  const publicKey = String(business.paystack?.publicKey || '').trim();
  let secretKey = '';
  try {
    secretKey = business.getPaystackSecretKey ? business.getPaystackSecretKey() : '';
  } catch (error) {
    throw new ErrorResponse(
      'Unable to decrypt stored Paystack key. Configure BUSINESS_KEYS_ENCRYPTION_KEY or APP_ENCRYPTION_KEY on the server.',
      500
    );
  }
  const enabled = Boolean(business.paystack?.enabled);

  if (enabled && publicKey && secretKey) {
    return { publicKey, secretKey, source: 'business' };
  }

  const fallback = getGlobalPaystackConfig();
  if (fallback.enabled) {
    return { publicKey: fallback.publicKey, secretKey: fallback.secretKey, source: 'global' };
  }

  throw new ErrorResponse('Online payments are not configured for this business', 400);
};

const validateVerifiedAmountAndCurrency = async (invoice, paystackData, reference) => {
  const existingPayment = await Payment.findOne({
    invoice: invoice._id,
    paymentReference: reference,
    paymentGateway: 'paystack'
  });

  const verifiedAmountMinor = Number(paystackData?.amount || 0);
  const verifiedCurrency = String(paystackData?.currency || '').trim().toUpperCase();
  const expectedCurrency = String(invoice.transactionCurrency || invoice.currency || '').trim().toUpperCase();

  if (expectedCurrency && verifiedCurrency && expectedCurrency !== verifiedCurrency) {
    throw new ErrorResponse('Payment currency does not match invoice currency', 400);
  }

  const expectedAmountMinor = existingPayment
    ? toMinorUnits(existingPayment.amount)
    : toMinorUnits(invoice.balance);

  if (verifiedAmountMinor !== expectedAmountMinor) {
    throw new ErrorResponse('Payment amount does not match invoice balance', 400);
  }

  return existingPayment;
};

const maybeSendConfirmationEmails = async (
  invoice,
  business,
  reference,
  amount,
  options = {}
) => {
  if (invoice.paymentConfirmationEmailsSentAt) return;

  try {
    await sendInvoicePaymentConfirmationEmails({
      invoice,
      business,
      reference,
      amount,
      ...options
    });
    invoice.paymentConfirmationEmailsSentAt = new Date();
    await invoice.save();
  } catch (error) {
    console.error('Failed to send invoice payment confirmation emails:', error?.message || error);
  }
};

const maybeCreatePaidInvoiceReceipt = async ({
  invoice,
  business,
  paystackData,
  reference
}) => {
  if (String(invoice?.status || '').toLowerCase() !== 'paid') {
    return null;
  }

  const businessId = business?._id || invoice?.business?._id || invoice?.business;
  const customerId = invoice?.customer?._id || invoice?.customer;
  if (!businessId || !invoice?._id || !customerId) {
    return null;
  }

  const existingReceipt = await Receipt.findOne({
    business: businessId,
    invoice: invoice._id
  })
    .sort({ createdAt: -1 });
  if (existingReceipt) {
    return existingReceipt;
  }

  const resolvedTemplateStyle = String(
    invoice?.templateStyle || 'standard'
  )
    .trim() || 'standard';

  if (!business || typeof business.getNextReceiptNumber !== 'function') {
    return null;
  }

  const receiptPayload = {
    business: businessId,
    invoice: invoice._id,
    customer: customerId,
    receiptNumber: await business.getNextReceiptNumber(),
    date: paystackData?.paid_at ? new Date(paystackData.paid_at) : new Date(),
    items: invoice.items || [],
    subtotal: Number(invoice.subtotal || 0),
    tax: invoice.tax || {},
    taxName: invoice.taxName || invoice.tax?.description,
    taxRateUsed: invoice.taxRateUsed ?? invoice.tax?.percentage,
    taxAmount: invoice.taxAmount ?? invoice.tax?.amount,
    isTaxOverridden: Boolean(invoice.isTaxOverridden),
    total: Number(invoice.total || 0),
    amountPaid: Number(invoice.amountPaid || 0),
    paymentMethod: invoice.paymentMethod || 'online',
    paymentReference: reference || invoice.paymentReference || '',
    templateStyle: resolvedTemplateStyle,
    createdBy: invoice.createdBy || undefined
  };

  try {
    return await Receipt.create(receiptPayload);
  } catch (error) {
    const fallbackReceipt = await Receipt.findOne({
      business: businessId,
      invoice: invoice._id
    }).sort({ createdAt: -1 });
    if (fallbackReceipt) {
      return fallbackReceipt;
    }
    throw error;
  }
};

const sendPublicPaidInvoiceReceiptEmail = async ({
  invoice,
  reference,
  pdfAttachment,
  templateStyle
}) => {
  const businessId = invoice?.business?._id || invoice?.business;
  if (!businessId) {
    throw new ErrorResponse('Business not found for this invoice', 404);
  }

  const customerEmail = String(invoice?.clientEmail || invoice?.customer?.email || '')
    .trim()
    .toLowerCase();
  if (!customerEmail) {
    throw new ErrorResponse('Customer email is required to send this receipt', 400);
  }

  const business = await Business.findById(businessId);
  if (!business) {
    throw new ErrorResponse('Business not found', 404);
  }

  let receipt = await Receipt.findOne({
    business: businessId,
    invoice: invoice._id
  })
    .sort({ createdAt: -1 })
    .populate('customer', 'name email')
    .populate('invoice', 'invoiceNumber currency');

  if (!receipt) {
    const businessWithSecret = await loadBusinessWithSecret(businessId);
    const created = await maybeCreatePaidInvoiceReceipt({
      invoice,
      business: businessWithSecret || business,
      paystackData: null,
      reference
    });

    if (created?._id) {
      receipt = await Receipt.findById(created._id)
        .populate('customer', 'name email')
        .populate('invoice', 'invoiceNumber currency');
    }
  }

  if (!receipt) {
    throw new ErrorResponse('Unable to create receipt for this payment', 500);
  }

  if (receipt.emailSentAt) {
    return { receipt, alreadySent: true };
  }

  const resolvedTemplateStyle = String(
    templateStyle || invoice?.templateStyle || receipt?.templateStyle || 'standard'
  ).trim() || 'standard';
  const attachmentFileName = sanitizeAttachmentFileName(`receipt-${receipt.receiptNumber}.pdf`);
  const frontendPdfAttachment = resolveFrontendPdfAttachment(
    { pdfAttachment },
    attachmentFileName
  );
  const attachments = frontendPdfAttachment?.buffer
    ? [{
      filename: frontendPdfAttachment.fileName || attachmentFileName,
      content: frontendPdfAttachment.buffer,
      contentType: 'application/pdf'
    }]
    : undefined;

  if (!attachments) {
    console.warn('Sending public payment receipt email without PDF attachment because frontend receipt PDF payload is missing.', {
      invoiceId: invoice?._id?.toString?.() || invoice?._id
    });
  }

  const customerName =
    receipt.customer?.name
    || invoice?.customer?.name
    || 'Customer';
  const paymentDate = formatDisplayDate(
    invoice?.paidDate
    || receipt?.date
    || receipt?.createdAt
    || new Date()
  );
  const resolvedCurrency = String(
    invoice?.currency
    || receipt?.invoice?.currency
    || business?.currency
    || 'USD'
  ).toUpperCase();
  const amountPaidValue = Number(receipt.amountPaid || invoice.amountPaid || invoice.total || 0);
  const amountPaidText = `${amountPaidValue.toFixed(2)} ${resolvedCurrency}`;
  const invoiceNumber = invoice?.invoiceNumber || receipt?.invoice?.invoiceNumber || 'N/A';

  await sendEmail({
    businessId,
    to: customerEmail,
    subject: `Receipt for Invoice ${invoiceNumber}`,
    text: `Receipt ${receipt.receiptNumber} for invoice ${invoiceNumber}. Amount paid: ${amountPaidText}.`,
    template: 'receipt',
    context: {
      customerName,
      businessName: business?.name || 'Business',
      receiptNumber: receipt.receiptNumber,
      invoiceNumber,
      paymentDate,
      amountPaid: amountPaidText,
      paymentMethod: receipt.paymentMethod || invoice.paymentMethod || 'online'
    },
    attachments
  });

  receipt.emailSentAt = new Date();
  receipt.templateStyle = resolvedTemplateStyle;
  if (!receipt.paymentReference) {
    receipt.paymentReference = reference || invoice?.paymentReference || '';
  }
  await receipt.save();

  return { receipt, alreadySent: false };
};

const applyVerifiedInvoicePayment = async ({
  invoice,
  business,
  paystackData,
  source = 'verify'
}) => {
  const reference = paystackData?.reference;
  if (!reference) {
    throw new ErrorResponse('Missing payment reference', 400);
  }

  if (String(paystackData?.status || '').toLowerCase() !== 'success') {
    throw new ErrorResponse('Payment not successful', 400);
  }

  assertVerifiedPaymentMatchesInvoice(invoice, paystackData, reference);

  const existingPayment = await validateVerifiedAmountAndCurrency(invoice, paystackData, reference);

  // Idempotent path: invoice already updated and payment record exists.
  if (existingPayment && (invoice.status === 'paid' || Number(invoice.balance || 0) <= 0)) {
    if (!invoice.paymentVerifiedAt) {
      invoice.paymentVerifiedAt = new Date();
      invoice.paymentVerificationSource = source;
      invoice.paymentGatewayStatus = 'success';
      invoice.lastPaymentEventType = 'charge.success';
      await invoice.save();
    }
    await maybeSendConfirmationEmails(invoice, business, reference, existingPayment.amount, {
      notifyCustomer: false,
      notifyBusiness: true
    });
    try {
      await maybeCreatePaidInvoiceReceipt({
        invoice,
        business,
        paystackData,
        reference
      });
    } catch (error) {
      console.error('Failed to auto-create receipt for paid invoice:', error?.message || error);
    }
    return { invoice, payment: existingPayment, isDuplicate: true };
  }

  const amountToApply = toMajorUnits(paystackData.amount);
  const safeAmountToApply = Number(invoice.balance || 0) > 0 ? Number(invoice.balance) : amountToApply;

  let payment = existingPayment;

  if (!payment && Number(invoice.balance || 0) > 0) {
    await invoice.recordPayment(safeAmountToApply, {
      paymentMethod: 'online',
      paymentReference: reference,
      paymentGateway: 'paystack'
    });
  } else {
    invoice.paymentReference = reference;
    invoice.paymentGateway = 'paystack';
    invoice.paymentGatewayStatus = 'success';
  }

  if (!payment) {
    payment = await Payment.create({
      business: invoice.business?._id || invoice.business,
      invoice: invoice._id,
      customer: invoice.customer?._id || invoice.customer,
      amount: safeAmountToApply,
      paymentMethod: 'online',
      paymentReference: reference,
      paymentGateway: 'paystack',
      gatewayTransactionId: paystackData?.id ? String(paystackData.id) : undefined,
      gatewayStatus: paystackData?.status || 'success',
      currency: String(paystackData?.currency || invoice.currency || 'NGN').toUpperCase(),
      status: 'completed',
      paymentDate: paystackData?.paid_at ? new Date(paystackData.paid_at) : new Date()
    });
  }

  invoice.transactionReference = reference;
  invoice.transactionAmount = safeAmountToApply;
  invoice.transactionCurrency = String(paystackData?.currency || invoice.currency || '').toUpperCase();
  invoice.paymentVerifiedAt = new Date();
  invoice.paymentVerificationSource = source;
  invoice.paymentGatewayStatus = 'success';
  invoice.lastPaymentEventType = 'charge.success';
  await invoice.save();

  if (invoice.customer?._id || invoice.customer) {
    try {
      await Customer.updateCustomerStats(invoice.customer?._id || invoice.customer);
    } catch (error) {
      console.warn('Unable to refresh customer stats after online payment:', error?.message || error);
    }
  }

  await maybeSendConfirmationEmails(invoice, business, reference, safeAmountToApply, {
    notifyCustomer: false,
    notifyBusiness: true
  });
  try {
    await maybeCreatePaidInvoiceReceipt({
      invoice,
      business,
      paystackData,
      reference
    });
  } catch (error) {
    console.error('Failed to auto-create receipt for paid invoice:', error?.message || error);
  }

  return { invoice, payment, isDuplicate: false };
};

const initializePublicInvoicePayment = async ({ req, invoice }) => {
  if (!invoice) {
    throw new ErrorResponse('Invoice not found', 404);
  }

  if (TERMINAL_INVOICE_STATUSES.has(String(invoice.status || '').toLowerCase())) {
    throw new ErrorResponse('This invoice is not available for payment', 400);
  }

  if (Number(invoice.balance || 0) <= 0) {
    throw new ErrorResponse('Invoice has no outstanding balance', 400);
  }

  const business = await loadBusinessWithSecret(invoice.business?._id || invoice.business);
  let paystackConnection = validateBusinessPaystackConnection(business);
  const paystackAvailability = resolvePublicInvoicePaystackAvailability({
    invoice,
    business: invoice?.business || business,
    businessWithSecret: business
  });

  const customerEmail = invoice.clientEmail || invoice.customer?.email;
  if (!customerEmail) {
    throw new ErrorResponse('Customer email is required to initialize payment', 400);
  }

  const currency = paystackAvailability.invoiceCurrency;
  if (!paystackAvailability.currencySupported) {
    throw new ErrorResponse(
      paystackAvailability.availabilityReason || buildUnsupportedCurrencyMessage(currency, paystackAvailability.supportedCurrencies),
      400
    );
  }
  const reference = `inv_${invoice._id}_${Date.now()}`;
  const callbackQuery = new URLSearchParams({
    source: 'invoice',
    slug: String(invoice.publicSlug || ''),
    invoiceId: String(invoice._id || '')
  });
  const callbackUrl = `${getBackendBaseUrl(req)}/api/v1/payments/verify?${callbackQuery.toString()}`;

  const payload = {
    email: customerEmail,
    amount: toMinorUnits(invoice.balance),
    currency,
    reference,
    callback_url: callbackUrl,
    metadata: {
      type: 'invoice_payment',
      invoiceId: invoice._id.toString(),
      businessId: (business._id || invoice.business?._id || invoice.business).toString(),
      publicSlug: invoice.publicSlug,
      invoiceNumber: invoice.invoiceNumber
    }
  };

  const { result: response, connection: resolvedConnection } = await runWithGlobalPaystackFallback(
    paystackConnection,
    (secretKey) => initializeBusinessTransaction(secretKey, payload)
  );
  paystackConnection = resolvedConnection;
  if (!response?.status || !response?.data) {
    throw new ErrorResponse('Unable to initialize payment', 400);
  }

  invoice.transactionReference = reference;
  invoice.transactionAmount = Number(invoice.balance);
  invoice.transactionCurrency = currency;
  invoice.paymentInitializedAt = new Date();
  invoice.paymentReference = reference;
  invoice.paymentGateway = 'paystack';
  invoice.paymentGatewayStatus = 'initialized';
  await invoice.save();

  return {
    invoice,
    business,
    payment: {
      provider: 'paystack',
      publicKey: paystackConnection.publicKey,
      authorizationUrl: response.data.authorization_url,
      accessCode: response.data.access_code,
      reference: response.data.reference || reference,
      amount: invoice.transactionAmount,
      currency
    }
  };
};

const buildPublicInvoicePayload = (req, invoice, businessWithSecret = null) => {
  const amountDue = Number(invoice?.balance ?? 0);
  const total = Number(invoice?.total ?? 0);
  const subtotal = Number(invoice?.subtotal ?? 0);
  const taxAmount = Number(invoice?.taxAmount ?? invoice?.tax?.amount ?? 0);
  const amountPaid = Number(invoice?.amountPaid ?? 0);
  const customerName = invoice?.customer?.name || 'Customer';
  const customerEmail = invoice?.clientEmail || invoice?.customer?.email || '';
  const status = String(invoice?.status || '').toLowerCase();
  const publicSlug = invoice?.publicSlug;

  const business = invoice?.business || {};
  const paystackAvailability = resolvePublicInvoicePaystackAvailability({
    invoice,
    business,
    businessWithSecret
  });

  return {
    id: invoice._id,
    publicSlug: invoice.publicSlug,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    currency: invoice.currency || business.currency || 'NGN',
    amountDue,
    total,
    subtotal,
    taxAmount,
    taxRateUsed: Number(invoice?.taxRateUsed ?? invoice?.tax?.percentage ?? 0),
    taxName: invoice?.taxName || invoice?.tax?.description || 'Tax',
    amountPaid,
    templateStyle: invoice?.templateStyle || 'standard',
    dueDate: invoice.dueDate,
    issueDate: invoice.date,
    notes: invoice.notes || '',
    transactionReference: invoice?.transactionReference || '',
    paymentReference: invoice?.paymentReference || '',
    items: Array.isArray(invoice?.items)
      ? invoice.items.map((item) => ({
          description: item?.description || '',
          quantity: Number(item?.quantity || 0),
          unitPrice: Number(item?.unitPrice || 0),
          total: Number(item?.total || 0)
        }))
      : [],
    customer: {
      name: customerName,
      email: customerEmail
    },
    business: {
      name: business.name,
      email: business.email,
      currency: business.currency || invoice.currency || 'NGN'
    },
    payment: {
      portalUrl: buildPublicPaymentPortalUrl(req, publicSlug),
      canPayOnline: paystackAvailability.canPayOnline,
      availabilityReason: paystackAvailability.availabilityReason,
      supportedCurrencies: paystackAvailability.supportedCurrencies,
      provider: 'paystack',
      publicKey: paystackAvailability.resolvedPublicKey,
      publicKeyMasked: maskPublicKey(paystackAvailability.resolvedPublicKey),
      verifyUrl: '/api/v1/payments/verify'
    }
  };
};

// @desc    Get public invoice details (for payment page)
// @route   GET /api/v1/invoices/public/:slug
// @access  Public
exports.getPublicInvoice = asyncHandler(async (req, res, next) => {
  const invoice = await loadPublicInvoice(req.params.slug);

  if (!invoice) {
    return next(new ErrorResponse('Invoice not found', 404));
  }

  res.status(200).json({
    success: true,
    data: buildPublicInvoicePayload(req, invoice)
  });
});

// @desc    Initialize Paystack payment for a public invoice using business-owned keys
// @route   POST /api/v1/invoices/public/:slug/paystack/initialize
// @access  Public
exports.initializePublicInvoicePaystackPayment = asyncHandler(async (req, res, next) => {
  const invoice = await loadPublicInvoice(req.params.slug);

  if (!invoice) {
    return next(new ErrorResponse('Invoice not found', 404));
  }

  const initialized = await initializePublicInvoicePayment({ req, invoice });

  res.status(200).json({
    success: true,
    data: {
      invoice: buildPublicInvoicePayload(req, initialized.invoice, initialized.business),
      payment: initialized.payment
    }
  });
});

// @desc    Redirect a public invoice link directly into Paystack checkout
// @route   GET /api/v1/invoices/public/:slug/pay
// @access  Public
exports.redirectPublicInvoicePaymentPortal = asyncHandler(async (req, res, next) => {
  const invoice = await loadPublicInvoice(req.params.slug);

  if (!invoice) {
    return next(new ErrorResponse('Invoice not found', 404));
  }

  try {
    const initialized = await initializePublicInvoicePayment({ req, invoice });
    if (!initialized?.payment?.authorizationUrl) {
      throw new ErrorResponse('Unable to initialize payment', 400);
    }

    return res.redirect(initialized.payment.authorizationUrl);
  } catch (error) {
    const frontendBaseUrl = getFrontendBaseUrl(req);
    if (frontendBaseUrl && invoice.publicSlug) {
      const fallbackUrl = `${frontendBaseUrl}/invoice/pay/${invoice.publicSlug}?payError=${encodeURIComponent(error?.message || 'Unable to start payment')}`;
      return res.redirect(fallbackUrl);
    }

    return next(error);
  }
});

const sanitizeErrorMessage = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Verification failed';
  return raw.length > 240 ? `${raw.slice(0, 237)}...` : raw;
};

const buildInvoicePayPageUrl = (req, invoice, extras = {}) => {
  const baseUrl = getFrontendBaseUrl(req);
  const slug = invoice?.publicSlug || invoice?._id;
  if (!baseUrl || !slug) return '';

  const params = new URLSearchParams();
  Object.entries(extras).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });

  const query = params.toString();
  return `${baseUrl}/invoice/pay/${slug}${query ? `?${query}` : ''}`;
};

const buildInvoiceResultFallbackUrl = (req, invoice, status, reason) => {
  const resultUrl = buildInvoiceResultUrl(req, invoice, status);
  if (!resultUrl) return '';

  if (!reason) return resultUrl;

  const delimiter = resultUrl.includes('?') ? '&' : '?';
  return `${resultUrl}${delimiter}reason=${encodeURIComponent(reason)}`;
};

const respondWithInvoicePaymentError = (req, res, invoice, reason, statusCode = 400) => {
  const safeReason = sanitizeErrorMessage(reason);
  const fallbackPayPageUrl = buildInvoicePayPageUrl(req, invoice, { payError: safeReason });
  if (fallbackPayPageUrl) {
    return res.redirect(fallbackPayPageUrl);
  }

  const failureUrl = buildInvoiceResultFallbackUrl(req, invoice, 'failed', safeReason);
  if (failureUrl) {
    return res.redirect(failureUrl);
  }

  return res.status(statusCode).json({
    success: false,
    data: {
      invoice: invoice
        ? {
            publicSlug: invoice.publicSlug,
            invoiceNumber: invoice.invoiceNumber,
            status: invoice.status
          }
        : null,
      reason: safeReason
    }
  });
};

const respondWithInvoicePaymentResult = (req, res, invoice, isSuccess, payload = {}) => {
  const targetUrl = buildInvoiceResultUrl(req, invoice, isSuccess ? 'success' : 'failed');
  const forceJson = req.query.mode === 'json';
  const shouldRedirect =
    !forceJson
    && (
      req.query.redirect === '1'
      || req.query.mode === 'redirect'
      || Boolean(getFrontendBaseUrl(req))
    );

  if (shouldRedirect && targetUrl) {
    return res.redirect(targetUrl);
  }

  return res.status(isSuccess ? 200 : 400).json({
    success: isSuccess,
    data: {
      invoice: invoice
        ? {
            publicSlug: invoice.publicSlug,
            invoiceNumber: invoice.invoiceNumber,
            status: invoice.status
          }
        : null,
      ...payload
    }
  });
};

// @desc    Verify a public invoice payment after Paystack redirect/callback
// @route   GET /api/v1/payments/verify?reference=...
// @access  Public
exports.verifyPublicInvoicePayment = asyncHandler(async (req, res, next) => {
  const reference = String(req.query.reference || req.query.trxref || '').trim();
  const invoiceIdHint = String(req.query.invoiceId || req.query.invoice || '').trim();
  const slugHint = String(req.query.slug || req.query.publicSlug || '').trim();

  if (!reference) {
    const reason = 'Reference is required';
    const fallbackBaseUrl = getFrontendBaseUrl(req);
    if (fallbackBaseUrl) {
      return res.redirect(`${fallbackBaseUrl}/invoice/failed/unknown?reason=${encodeURIComponent(reason)}`);
    }
    return next(new ErrorResponse(reason, 400));
  }

  const invoice = await loadInvoiceByHints({
    reference,
    invoiceId: invoiceIdHint,
    slug: slugHint
  });
  if (!invoice) {
    const reason = 'Invoice not found';
    const fallbackBaseUrl = getFrontendBaseUrl(req);
    if (fallbackBaseUrl) {
      return res.redirect(`${fallbackBaseUrl}/invoice/failed/unknown?reason=${encodeURIComponent(reason)}`);
    }
    return next(new ErrorResponse(reason, 404));
  }

  const business = await loadBusinessWithSecret(invoice.business?._id || invoice.business);
  let paystackConnection;

  try {
    paystackConnection = validateBusinessPaystackConnection(business);
  } catch (error) {
    return respondWithInvoicePaymentError(
      req,
      res,
      invoice,
      error?.message || 'Online payments are not configured for this invoice',
      error?.statusCode || 400
    );
  }

  try {
    const { result: response } = await runWithGlobalPaystackFallback(
      paystackConnection,
      (secretKey) => verifyBusinessTransaction(secretKey, reference)
    );
    const paystackData = response?.data;

    if (!paystackData) {
      return respondWithInvoicePaymentError(req, res, invoice, 'Unable to verify payment', 400);
    }

    await applyVerifiedInvoicePayment({
      invoice,
      business,
      paystackData,
      source: 'redirect'
    });

    return respondWithInvoicePaymentResult(req, res, invoice, true, {
      reference,
      status: 'success'
    });
  } catch (error) {
    console.error('Invoice payment verification failed:', error?.response?.data || error?.message || error);
    return respondWithInvoicePaymentError(
      req,
      res,
      invoice,
      error?.response?.data?.message || error?.message || 'Verification failed',
      error?.statusCode || 400
    );
  }
});

// @desc    Send public paid-invoice receipt email using frontend-rendered PDF attachment
// @route   POST /api/v1/payments/public-receipt/email
// @access  Public
exports.sendPublicInvoiceReceiptEmail = asyncHandler(async (req, res, next) => {
  const reference = String(req.body?.reference || '').trim();
  if (!reference) {
    return next(new ErrorResponse('Reference is required', 400));
  }

  const invoice = await loadInvoiceByHints({ reference });
  if (!invoice) {
    return next(new ErrorResponse('Invoice not found', 404));
  }

  const isPaid = String(invoice.status || '').toLowerCase() === 'paid' || Number(invoice.balance || 0) <= 0;
  if (!isPaid) {
    return next(new ErrorResponse('Invoice payment is not completed', 400));
  }

  const receiptResult = await sendPublicPaidInvoiceReceiptEmail({
    invoice,
    reference,
    pdfAttachment: req.body?.pdfAttachment,
    templateStyle: req.body?.templateStyle
  });

  const receipt = receiptResult?.receipt;
  return res.status(200).json({
    success: true,
    data: {
      alreadySent: Boolean(receiptResult?.alreadySent),
      receipt: receipt
        ? {
            id: receipt._id,
            receiptNumber: receipt.receiptNumber,
            templateStyle: receipt.templateStyle,
            emailSentAt: receipt.emailSentAt
          }
        : null
    }
  });
});

// @desc    Paystack webhook for business-owned invoice payments
// @route   POST /api/v1/webhooks/paystack
// @access  Public
exports.paystackInvoiceWebhook = asyncHandler(async (req, res) => {
  const event = req.body || {};
  const eventType = event?.event;
  const payload = event?.data || {};
  const metadata = resolvePaystackMetadata(payload);
  const reference = String(payload?.reference || '').trim();

  if (!reference) {
    return res.status(200).json({ success: true, message: 'No reference in webhook payload' });
  }

  const invoice = await loadInvoiceByHints({
    reference,
    invoiceId: metadata?.invoiceId || metadata?.invoice_id || metadata?.invoice,
    slug: metadata?.publicSlug || metadata?.public_slug || metadata?.slug
  });
  if (!invoice) {
    return res.status(200).json({ success: true, message: 'Invoice not found for reference' });
  }

  const business = await loadBusinessWithSecret(invoice.business?._id || invoice.business);
  if (!business) {
    return res.status(200).json({ success: true, message: 'Business not found for invoice' });
  }

  let paystackConfig;
  try {
    paystackConfig = validateBusinessPaystackConnection(business);
  } catch (error) {
    return res.status(200).json({ success: true, message: 'Paystack is not configured for this business' });
  }

  const signature = req.headers['x-paystack-signature'];
  let isValid = verifyPaystackSignatureWithSecret(req.rawBody, signature, paystackConfig.secretKey);
  if (!isValid && paystackConfig.source === 'business') {
    const fallback = getGlobalPaystackConfig();
    if (fallback.enabled && fallback.secretKey !== paystackConfig.secretKey) {
      isValid = verifyPaystackSignatureWithSecret(req.rawBody, signature, fallback.secretKey);
      if (isValid) {
        paystackConfig = {
          publicKey: fallback.publicKey,
          secretKey: fallback.secretKey,
          source: 'global'
        };
      }
    }
  }
  if (!isValid) {
    return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
  }

  if (eventType !== 'charge.success') {
    return res.status(200).json({ success: true, message: 'Event ignored' });
  }

  try {
    await applyVerifiedInvoicePayment({
      invoice,
      business,
      paystackData: payload,
      source: 'webhook'
    });
  } catch (error) {
    console.error('Invoice payment webhook handling error:', error?.message || error);
    return res.status(error.statusCode || 400).json({
      success: false,
      error: error.message || 'Webhook processing failed'
    });
  }

  return res.status(200).json({ success: true });
});
