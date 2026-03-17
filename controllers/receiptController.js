const Receipt = require('../models/Receipt');
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Business = require('../models/Business');
const InventoryTransaction = require('../models/InventoryTransaction');
const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../utils/asyncHandler');
const sendEmail = require('../utils/email');
const generatePDF = require('../utils/generatePDF');
const { calculateInvoiceTotals, toNumber } = require('../utils/invoiceCalculator');
const { getTaxSettings } = require('../utils/taxSettings');
const { getPlanDefinition } = require('../utils/planConfig');
const invoiceTemplates = require('../data/templates');

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeTemplateStyle = (value) => String(value || '').trim();

const TEMPLATE_STYLE_ALIASES = {
  modern: 'modernCorporate',
  clean: 'cleanBilling',
  retail: 'retailReceipt',
  elegant: 'simpleElegant',
  urban: 'urbanEdge',
  creative: 'creativeFlow',
  professionalclassic: 'professionalClassic',
  moderncorporate: 'modernCorporate',
  cleanbilling: 'cleanBilling',
  retailreceipt: 'retailReceipt',
  simpleelegant: 'simpleElegant',
  urbanedge: 'urbanEdge',
  creativeflow: 'creativeFlow',
  neobrutalist: 'neoBrutalist',
  minimaldark: 'minimalistDark',
  minimalistdark: 'minimalistDark',
  organiceco: 'organicEco',
  corporatepro: 'corporatePro',
  creativestudio: 'creativeStudio',
  techmodern: 'techModern'
};

const normalizeTemplateLookupValue = (value) => {
  const normalized = normalizeTemplateStyle(value).toLowerCase();
  if (!normalized) return '';
  const aliased = TEMPLATE_STYLE_ALIASES[normalized] || normalized;
  return normalizeTemplateStyle(aliased).toLowerCase();
};

const resolveTemplateMeta = (templateStyle) => {
  const normalized = normalizeTemplateLookupValue(templateStyle);
  if (normalized) {
    const matched = invoiceTemplates.find((template) =>
      normalizeTemplateLookupValue(template.id) === normalized
      || normalizeTemplateLookupValue(template.templateStyle) === normalized
    );
    if (matched) return matched;
  }
  return invoiceTemplates.find((template) => template.id === 'standard') || invoiceTemplates[0] || {};
};

const resolveCanonicalTemplateStyle = (templateStyle, fallback = 'standard') => {
  const meta = resolveTemplateMeta(templateStyle || fallback);
  return meta?.id || normalizeTemplateStyle(templateStyle) || fallback;
};

const resolveCssColor = (color, fallback) => {
  if (Array.isArray(color) && color.length === 3) {
    return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  }
  return fallback;
};

const formatDisplayDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString();
};

const resolveBusinessLogoUrl = (business = {}) => {
  const status = String(business?.subscription?.status || 'active').trim().toLowerCase();
  const plan = status === 'expired' ? 'starter' : business?.subscription?.plan;
  const planDefinition = getPlanDefinition(plan);
  if (!planDefinition.allowCustomLogo) return '';
  return String(business?.logo || '').trim();
};

const buildReceiptEmailHtml = ({ receipt, context, templateMeta }) => {
  const colors = templateMeta?.colors || {};
  const primary = resolveCssColor(colors.primary, '#2563eb');
  const secondary = resolveCssColor(colors.secondary, '#3b82f6');
  const accent = resolveCssColor(colors.accent, '#eff6ff');
  const text = resolveCssColor(colors.text, '#1f2937');
  const templateName = templateMeta?.name || 'Standard';
  const logoUrl = resolveBusinessLogoUrl(receipt?.business);
  const logoMarkup = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(context.businessName)} logo" style="display:block;max-width:140px;max-height:56px;width:auto;height:auto;margin-left:auto;" />`
    : '';

  return `
    <div style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:20px;background:linear-gradient(90deg, ${primary} 0%, ${secondary} 100%);">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="vertical-align:top;padding-right:16px;">
                  <div style="font-size:22px;font-weight:700;color:#fff;">${escapeHtml(context.businessName)}</div>
                  <div style="font-size:12px;color:#dbeafe;margin-top:6px;">Receipt Template: ${escapeHtml(templateName)}</div>
                </td>
                ${logoMarkup ? `<td style="width:160px;text-align:right;vertical-align:top;">${logoMarkup}</td>` : ''}
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px;">
            <p style="margin:0 0 10px 0;color:#334155;line-height:1.6;">Dear ${escapeHtml(context.customerName)},</p>
            <p style="margin:0;color:#334155;line-height:1.6;">Thank you for your payment. Your receipt details are below.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 20px 20px 20px;">
            <div style="border:1px solid #dbeafe;background:${accent};border-radius:8px;padding:14px;">
              <div style="font-size:13px;color:${text};margin-bottom:6px;"><strong>Receipt:</strong> ${escapeHtml(context.receiptNumber)}</div>
              <div style="font-size:13px;color:${text};margin-bottom:6px;"><strong>Invoice:</strong> ${escapeHtml(context.invoiceNumber)}</div>
              <div style="font-size:13px;color:${text};margin-bottom:6px;"><strong>Payment Date:</strong> ${escapeHtml(context.paymentDate)}</div>
              <div style="font-size:13px;color:${text};margin-bottom:6px;"><strong>Payment Method:</strong> ${escapeHtml(context.paymentMethod)}</div>
              <div style="font-size:13px;color:${text};"><strong>Amount Paid:</strong> ${escapeHtml(context.amountPaid)} ${escapeHtml(context.currency)}</div>
            </div>
          </td>
        </tr>
      </table>
    </div>
  `;
};

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

const ensureWalkInCustomer = async (req, fallbackName = 'Walk-in Customer') => {
  const existing = await Customer.findOne({
    business: req.user.business,
    name: fallbackName
  });

  if (existing) {
    return existing._id;
  }

  const generatedEmail = `walkin-${Date.now()}@Ledgerly.local`;
  const newCustomer = await Customer.create({
    business: req.user.business,
    name: fallbackName,
    email: generatedEmail,
    phone: '0000000000',
    createdBy: req.user.id
  });

  return newCustomer._id;
};

// @desc    Get all receipts
// @route   GET /api/v1/receipts
// @access  Private
exports.getReceipts = asyncHandler(async (req, res, next) => {
  const {
    customer,
    startDate,
    endDate,
    paymentMethod,
    search,
    page = 1,
    limit = 20
  } = req.query;
  const parsedPage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
  
  let query = { business: req.user.business, isVoid: false };
  
  if (customer) query.customer = customer;
  if (paymentMethod) query.paymentMethod = paymentMethod;
  
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }
  
  if (search) {
    query.$or = [
      { receiptNumber: { $regex: search, $options: 'i' } },
      { 'customer.name': { $regex: search, $options: 'i' } },
      { paymentReference: { $regex: search, $options: 'i' } }
    ];
  }
  
  const receipts = await Receipt.find(query)
    .populate('customer', 'name email phone')
    .populate('cashier', 'name')
    .sort({ date: -1 })
    .skip((parsedPage - 1) * parsedLimit)
    .limit(parsedLimit);
    
  const total = await Receipt.countDocuments(query);
  
  // Calculate totals
  const totals = await Receipt.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$total' },
        totalReceipts: { $sum: 1 }
      }
    }
  ]);
  
  res.status(200).json({
    success: true,
    count: receipts.length,
    total,
    pages: Math.ceil(total / parsedLimit),
    summary: totals[0] || { totalAmount: 0, totalReceipts: 0 },
    data: receipts
  });
});

// @desc    Create receipt (POS)
// @route   POST /api/v1/receipts
// @access  Private
exports.createReceipt = asyncHandler(async (req, res, next) => {
  const { customer, items, paymentMethod, amountPaid, notes, templateStyle } = req.body;
  
  // Calculate totals
  const processedItems = [];
  
  for (const item of items) {
    let product = null;
    if (item.product) {
      product = await Product.findById(item.product);
    }
    
    const unitPrice = item.unitPrice || (product ? product.sellingPrice : 0);
    const quantity = item.quantity || 1;
    const itemTotal = unitPrice * quantity;
    
    processedItems.push({
      description: item.description || (product ? product.name : 'Item'),
      quantity,
      unitPrice,
      total: itemTotal,
      taxRate: 0,
      discount: 0,
      discountType: 'fixed',
      taxAmount: 0
    });
    
    // Update inventory if product exists and tracks inventory
    if (product && product.trackInventory) {
      product.stock.quantity -= quantity;
      product.stock.available = product.stock.quantity - product.stock.reserved;
      await product.save();
      
      // Create inventory transaction
      await InventoryTransaction.create({
        business: req.user.business,
        product: product._id,
        type: 'sale',
        quantity: -quantity,
        reference: `Receipt`,
        notes: 'POS sale',
        createdBy: req.user.id
      });
    }
  }
  
  const taxSettings = await getTaxSettings({ businessId: req.user.business });
  const taxRateUsed = taxSettings.taxEnabled ? toNumber(taxSettings.taxRate, 0) : 0;
  const taxName = taxSettings.taxName || 'VAT';
  let computedTotals;
  try {
    computedTotals = calculateInvoiceTotals({
      items: processedItems,
      taxRateUsed,
      amountPaid
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
  const subtotal = computedTotals.subtotal;
  const taxAmount = computedTotals.taxAmount;
  const total = computedTotals.total;
  const paidAmount = toNumber(amountPaid, 0);
  const change = paidAmount - total;
  
  // Handle customer
  let customerId = customer;
  if (!customerId && req.body.customerEmail) {
    // Find or create customer
    let existingCustomer = await Customer.findOne({
      business: req.user.business,
      email: req.body.customerEmail
    });
    
    if (!existingCustomer) {
      existingCustomer = await Customer.create({
        business: req.user.business,
        name: req.body.customerName || 'Walk-in Customer',
        email: req.body.customerEmail,
        phone: req.body.customerPhone,
        createdBy: req.user.id
      });
    }
    
    customerId = existingCustomer._id;
  }

  if (!customerId) {
    customerId = await ensureWalkInCustomer(req, req.body.customerName || 'Walk-in Customer');
  }
  
  const business = await Business.findById(req.user.business);
  if (!business) {
    return next(new ErrorResponse('Business not found', 404));
  }

  const receiptNumber = await business.getNextReceiptNumber();

  // Create receipt
  let receipt;
  try {
    receipt = await Receipt.create({
      business: req.user.business,
      customer: customerId,
      items: computedTotals.items,
      subtotal,
      tax: {
        amount: taxAmount,
        percentage: taxRateUsed,
        description: taxName
      },
      taxName,
      taxRateUsed,
      taxAmount,
      isTaxOverridden: false,
      total,
      amountPaid: paidAmount,
      change,
      paymentMethod,
      cashier: req.user.id,
      notes,
      receiptNumber,
      templateStyle: templateStyle || req.body.templateId || req.body.template,
      createdBy: req.user.id
    });
  } catch (error) {
    console.error('Receipt creation failed', {
      message: error.message,
      body: req.body,
      stack: error.stack
    });
    return next(new ErrorResponse(error.message || 'Unable to create receipt', 400));
  }
  
  // Update customer stats
  if (customerId) {
    await Customer.updateCustomerStats(customerId);
  }

  const populatedReceipt = await Receipt.findById(receipt._id)
    .populate('customer', 'name email phone')
    .populate('invoice', 'invoiceNumber currency')
    .populate('cashier', 'name');
  
  res.status(201).json({
    success: true,
    data: populatedReceipt || receipt,
    change
  });
});

// @desc    Create receipt from invoice
// @route   POST /api/v1/receipts/from-invoice/:invoiceId
// @access  Private
exports.createReceiptFromInvoice = asyncHandler(async (req, res, next) => {
  const invoice = await Invoice.findOne({
    _id: req.params.invoiceId,
    business: req.user.business
  }).populate('customer');
  
  if (!invoice) {
    return next(new ErrorResponse(`Invoice not found with id ${req.params.invoiceId}`, 404));
  }
  
  if (invoice.status !== 'paid') {
    return next(new ErrorResponse('Invoice is not paid', 400));
  }
  
  // Create receipt from invoice
  const receipt = await Receipt.create({
    business: req.user.business,
    invoice: invoice._id,
    customer: invoice.customer._id,
    items: invoice.items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      taxRate: item.taxRate,
      taxAmount: item.taxAmount
    })),
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    taxName: invoice.taxName || invoice.tax?.description,
    taxRateUsed: invoice.taxRateUsed ?? invoice.tax?.percentage,
    taxAmount: invoice.taxAmount ?? invoice.tax?.amount,
    isTaxOverridden: invoice.isTaxOverridden,
    total: invoice.total,
    amountPaid: invoice.amountPaid,
    paymentMethod: invoice.paymentMethod,
    templateStyle: req.body.templateStyle || req.body.templateId || req.body.template,
    createdBy: req.user.id
  });

  const populatedReceipt = await Receipt.findById(receipt._id)
    .populate('customer', 'name email phone')
    .populate('invoice', 'invoiceNumber currency')
    .populate('cashier', 'name');
  
  res.status(201).json({
    success: true,
    data: populatedReceipt || receipt
  });
});

// @desc    Void receipt
// @route   POST /api/v1/receipts/:id/void
// @access  Private
exports.voidReceipt = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;
  
  const receipt = await Receipt.findOne({
    _id: req.params.id,
    business: req.user.business
  });
  
  if (!receipt) {
    return next(new ErrorResponse(`Receipt not found with id ${req.params.id}`, 404));
  }
  
  if (receipt.isVoid) {
    return next(new ErrorResponse('Receipt is already voided', 400));
  }
  
  // Restore inventory
  for (const item of receipt.items) {
    if (item.product) {
      const product = await Product.findById(item.product);
      
      if (product && product.trackInventory) {
        product.stock.quantity += item.quantity;
        product.stock.available = product.stock.quantity - product.stock.reserved;
        await product.save();
        
        // Create inventory transaction
        await InventoryTransaction.create({
          business: req.user.business,
          product: product._id,
          type: 'return',
          quantity: item.quantity,
          reference: `Receipt Voided: ${receipt.receiptNumber}`,
          notes: `Voided: ${reason}`,
          createdBy: req.user.id
        });
      }
    }
  }
  
  // Update receipt
  receipt.isVoid = true;
  receipt.voidReason = reason;
  receipt.voidedBy = req.user.id;
  receipt.voidedAt = new Date();
  await receipt.save();
  
  // Update customer stats
  await Customer.updateCustomerStats(receipt.customer);
  
  res.status(200).json({
    success: true,
    message: 'Receipt voided successfully',
    data: receipt
  });
});

// @desc    Get receipt PDF
// @route   GET /api/v1/receipts/:id/pdf
// @access  Private
exports.getReceiptPDF = asyncHandler(async (req, res, next) => {
  const receipt = await Receipt.findById(req.params.id)
    .populate('customer')
    .populate('business');
  
  if (!receipt) {
    return next(new ErrorResponse(`Receipt not found with id ${req.params.id}`, 404));
  }
  
  if (receipt.business._id.toString() !== req.user.business.toString()) {
    return next(new ErrorResponse('Not authorized to access this receipt', 403));
  }
  
  const pdfBuffer = await generatePDF.receipt(receipt);
  
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename=receipt-${receipt.receiptNumber}.pdf`,
    'Content-Length': pdfBuffer.length
  });
  
  res.send(pdfBuffer);
});

// @desc    Email receipt
// @route   POST /api/v1/receipts/:id/email
// @access  Private
exports.emailReceipt = asyncHandler(async (req, res, next) => {
  const receipt = await Receipt.findById(req.params.id)
    .populate('customer')
    .populate('business')
    .populate('invoice', 'invoiceNumber currency');
  
  if (!receipt) {
    return next(new ErrorResponse(`Receipt not found with id ${req.params.id}`, 404));
  }
  
  const requestEmail = String(req.body?.customerEmail || '').trim().toLowerCase();
  const storedCustomerEmail = String(receipt.customer?.email || '').trim().toLowerCase();
  const recipientEmail = requestEmail || storedCustomerEmail;

  if (!recipientEmail) {
    return next(new ErrorResponse('Customer email is required to send this receipt', 400));
  }

  const hasValidRecipientEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail);
  if (!hasValidRecipientEmail) {
    return next(new ErrorResponse(`Invalid customer email address: ${recipientEmail}`, 400));
  }

  const requestedTemplateStyle = resolveCanonicalTemplateStyle(
    req.body?.templateStyle || req.body?.templateId || req.body?.template || receipt.templateStyle || 'standard',
    receipt.templateStyle || 'standard'
  );
  const defaultAttachmentFileName = sanitizeAttachmentFileName(`receipt-${receipt.receiptNumber}.pdf`);
  const frontendPdfAttachment = resolveFrontendPdfAttachment(req.body, defaultAttachmentFileName);
  const attachmentFileName = frontendPdfAttachment?.fileName || defaultAttachmentFileName;
  const pdfBuffer = frontendPdfAttachment?.buffer || null;
  if (!pdfBuffer) {
    console.warn('Sending receipt email without PDF attachment because frontend receipt PDF payload is missing.', {
      receiptId: receipt._id?.toString?.() || receipt._id
    });
  }

  const templateMeta = resolveTemplateMeta(requestedTemplateStyle);
  const mailContext = {
    customerName: receipt.customer?.name || req.body?.customerName || 'Customer',
    businessName: receipt.business?.name || 'Business',
    receiptNumber: receipt.receiptNumber || '',
    invoiceNumber: receipt.invoice?.invoiceNumber || receipt.invoice || 'N/A',
    paymentDate: formatDisplayDate(receipt.date || receipt.createdAt),
    amountPaid: Number(receipt.amountPaid || 0).toFixed(2),
    paymentMethod: receipt.paymentMethod || 'manual',
    currency: receipt.currency || receipt.invoice?.currency || receipt.business?.currency || 'USD'
  };

  try {
    await sendEmail({
      businessId: req.user.business,
      to: recipientEmail,
      subject: `Receipt ${receipt.receiptNumber} from ${receipt.business.name}`,
      text: `Receipt ${mailContext.receiptNumber}. Amount paid: ${mailContext.amountPaid} ${mailContext.currency}.`,
      html: buildReceiptEmailHtml({
        receipt,
        context: mailContext,
        templateMeta
      }),
      attachments: pdfBuffer
        ? [{
          filename: attachmentFileName,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }]
        : undefined
    });
  } catch (error) {
    return next(new ErrorResponse(error?.message || 'Unable to send receipt email', 502));
  }

  if (requestedTemplateStyle && requestedTemplateStyle !== receipt.templateStyle) {
    receipt.templateStyle = requestedTemplateStyle;
    await receipt.save();
  }
  
  res.status(200).json({
    success: true,
    message: 'Receipt emailed successfully'
  });
});
