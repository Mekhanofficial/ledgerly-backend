const Invoice = require('../models/Invoice');
const Business = require('../models/Business');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const {
  initializeBusinessTransaction,
  verifyBusinessTransaction,
  verifyPaystackSignatureWithSecret
} = require('../utils/businessPaystack');
const { sendInvoicePaymentConfirmationEmails } = require('../utils/invoicePaymentEmails');

const TERMINAL_INVOICE_STATUSES = new Set(['paid', 'cancelled', 'void']);

const toMinorUnits = (amount) => Math.round(Number(amount || 0) * 100);
const toMajorUnits = (amount) => Number((Number(amount || 0) / 100).toFixed(2));

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

const loadPublicInvoice = async (slug) => {
  if (!slug) return null;
  return Invoice.findOne({
    publicSlug: slug,
    publicAccessEnabled: { $ne: false }
  })
    .populate('customer', 'name email')
    .populate('business', 'name email currency paystack');
};

const loadInvoiceByReference = async (reference) => {
  if (!reference) return null;
  return Invoice.findOne({
    $or: [
      { transactionReference: reference },
      { paymentReference: reference }
    ]
  })
    .populate('customer', 'name email')
    .populate('business', 'name email');
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

  if (!enabled || !publicKey || !secretKey) {
    throw new ErrorResponse('Online payments are not configured for this business', 400);
  }

  return { publicKey, secretKey };
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

const maybeSendConfirmationEmails = async (invoice, business, reference, amount) => {
  if (invoice.paymentConfirmationEmailsSentAt) return;

  try {
    await sendInvoicePaymentConfirmationEmails({
      invoice,
      business,
      reference,
      amount
    });
    invoice.paymentConfirmationEmailsSentAt = new Date();
    await invoice.save();
  } catch (error) {
    console.error('Failed to send invoice payment confirmation emails:', error?.message || error);
  }
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
    await maybeSendConfirmationEmails(invoice, business, reference, existingPayment.amount);
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

  await maybeSendConfirmationEmails(invoice, business, reference, safeAmountToApply);

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
  const { publicKey, secretKey } = validateBusinessPaystackConnection(business);

  const customerEmail = invoice.clientEmail || invoice.customer?.email;
  if (!customerEmail) {
    throw new ErrorResponse('Customer email is required to initialize payment', 400);
  }

  const currency = String(invoice.currency || business.currency || 'NGN').trim().toUpperCase();
  const reference = `inv_${invoice._id}_${Date.now()}`;
  const callbackUrl = `${getBackendBaseUrl(req)}/api/v1/payments/verify?source=invoice`;

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

  const response = await initializeBusinessTransaction(secretKey, payload);
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
      publicKey,
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
  const customerName = invoice?.customer?.name || 'Customer';
  const customerEmail = invoice?.clientEmail || invoice?.customer?.email || '';
  const status = String(invoice?.status || '').toLowerCase();
  const publicSlug = invoice?.publicSlug;

  const business = invoice?.business || {};
  const paystackPublicKey = businessWithSecret?.paystack?.publicKey || business?.paystack?.publicKey || '';
  const paystackEnabled = Boolean(
    businessWithSecret?.paystack?.enabled
    ?? business?.paystack?.enabled
  );
  const hasPaystackSecretKey = businessWithSecret
    ? Boolean(businessWithSecret.paystack?.secretKeyEncrypted)
    : false;

  return {
    id: invoice._id,
    publicSlug: invoice.publicSlug,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    currency: invoice.currency || business.currency || 'NGN',
    amountDue,
    total,
    dueDate: invoice.dueDate,
    issueDate: invoice.date,
    notes: invoice.notes || '',
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
      canPayOnline:
        !TERMINAL_INVOICE_STATUSES.has(status)
        && amountDue > 0
        && paystackEnabled
        && Boolean(paystackPublicKey)
        && (businessWithSecret ? hasPaystackSecretKey : true),
      provider: 'paystack',
      publicKey: paystackPublicKey,
      publicKeyMasked: maskPublicKey(paystackPublicKey),
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

  if (!reference) {
    const reason = 'Reference is required';
    const fallbackBaseUrl = getFrontendBaseUrl(req);
    if (fallbackBaseUrl) {
      return res.redirect(`${fallbackBaseUrl}/invoice/failed/unknown?reason=${encodeURIComponent(reason)}`);
    }
    return next(new ErrorResponse(reason, 400));
  }

  const invoice = await loadInvoiceByReference(reference);
  if (!invoice) {
    const reason = 'Invoice not found';
    const fallbackBaseUrl = getFrontendBaseUrl(req);
    if (fallbackBaseUrl) {
      return res.redirect(`${fallbackBaseUrl}/invoice/failed/unknown?reason=${encodeURIComponent(reason)}`);
    }
    return next(new ErrorResponse(reason, 404));
  }

  const business = await loadBusinessWithSecret(invoice.business?._id || invoice.business);
  let secretKey = '';

  try {
    ({ secretKey } = validateBusinessPaystackConnection(business));
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
    const response = await verifyBusinessTransaction(secretKey, reference);
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

// @desc    Paystack webhook for business-owned invoice payments
// @route   POST /api/v1/webhooks/paystack
// @access  Public
exports.paystackInvoiceWebhook = asyncHandler(async (req, res) => {
  const event = req.body || {};
  const eventType = event?.event;
  const payload = event?.data || {};
  const reference = String(payload?.reference || '').trim();

  if (!reference) {
    return res.status(200).json({ success: true, message: 'No reference in webhook payload' });
  }

  const invoice = await loadInvoiceByReference(reference);
  if (!invoice) {
    return res.status(200).json({ success: true, message: 'Invoice not found for reference' });
  }

  const business = await loadBusinessWithSecret(invoice.business?._id || invoice.business);
  if (!business) {
    return res.status(200).json({ success: true, message: 'Business not found for invoice' });
  }

  let secretKey = '';
  try {
    secretKey = business.getPaystackSecretKey();
  } catch (error) {
    console.error('Unable to decrypt business Paystack key for webhook:', error?.message || error);
    return res.status(500).json({ success: false, error: 'Unable to verify webhook' });
  }

  const signature = req.headers['x-paystack-signature'];
  const isValid = verifyPaystackSignatureWithSecret(req.rawBody, signature, secretKey);
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
