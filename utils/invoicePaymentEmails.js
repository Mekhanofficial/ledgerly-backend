const sendEmail = require('./email');

const formatAmount = (amount, currency = 'NGN') => {
  const value = Number(amount || 0);
  const code = String(currency || 'NGN').toUpperCase();

  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: code
    }).format(value);
  } catch (error) {
    return `${code} ${value.toFixed(2)}`;
  }
};

const toDateText = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
};
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const resolveBusinessId = (invoice, business) => (
  business?._id
  || business?.id
  || invoice?.business?._id
  || invoice?.business?.id
  || invoice?.business
  || null
);

const sendInvoicePaymentLinkEmail = async ({ invoice, business, customerEmail, customerName, paymentLink }) => {
  if (!customerEmail) return null;

  const invoiceNumber = invoice?.invoiceNumber || 'Invoice';
  const businessName = business?.name || 'Business';
  const amountText = formatAmount(invoice?.balance ?? invoice?.total ?? 0, invoice?.currency);
  const businessId = resolveBusinessId(invoice, business);

  return sendEmail({
    businessId,
    to: customerEmail,
    subject: `Invoice ${invoiceNumber} from ${businessName}`,
    html: `
      <h2>Invoice from ${businessName}</h2>
      <p>Hello ${customerName || 'Customer'},</p>
      <p>Invoice Number: <strong>${invoiceNumber}</strong></p>
      <p>Amount Due: <strong>${amountText}</strong></p>
      <p>Due Date: <strong>${toDateText(invoice?.dueDate)}</strong></p>
      <p>
        <a href="${paymentLink}" style="padding:10px 16px;background:#000;color:#fff;text-decoration:none;border-radius:4px;display:inline-block;">
          Pay Now
        </a>
      </p>
    `
  });
};

const sendInvoicePaymentConfirmationEmails = async ({
  invoice,
  business,
  reference,
  amount,
  notifyCustomer = true,
  notifyBusiness = true
}) => {
  const invoiceNumber = invoice?.invoiceNumber || 'Invoice';
  const businessName = business?.name || 'Business';
  const amountText = formatAmount(amount ?? invoice?.total ?? 0, invoice?.currency);
  const clientEmail = normalizeEmail(invoice?.clientEmail || invoice?.customer?.email);
  const businessEmail = normalizeEmail(business?.email);
  const businessId = resolveBusinessId(invoice, business);

  const jobs = [];

  if (notifyCustomer && clientEmail) {
    jobs.push(sendEmail({
      businessId,
      to: clientEmail,
      subject: `Payment Received for Invoice ${invoiceNumber}`,
      html: `
        <h2>Payment Successful</h2>
        <p>We received your payment of <strong>${amountText}</strong>.</p>
        <p>Invoice Number: <strong>${invoiceNumber}</strong></p>
        <p>Thank you for your payment.</p>
      `
    }));
  }

  if (notifyBusiness && businessEmail && businessEmail !== clientEmail) {
    jobs.push(sendEmail({
      businessId,
      to: businessEmail,
      subject: `Invoice Paid - ${invoiceNumber}`,
      html: `
        <h2>Invoice Paid</h2>
        <p>The client has paid <strong>${amountText}</strong>.</p>
        <p>Invoice Number: <strong>${invoiceNumber}</strong></p>
        <p>Reference: <strong>${reference || invoice?.transactionReference || ''}</strong></p>
      `
    }));
  }

  if (jobs.length === 0) return null;
  return Promise.allSettled(jobs);
};

module.exports = {
  sendInvoicePaymentLinkEmail,
  sendInvoicePaymentConfirmationEmails
};
