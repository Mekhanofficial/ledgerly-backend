const nodemailer = require('nodemailer');
const Settings = require('../models/Settings');
const { getTransporter } = require('./mailer');
const { getEmailConfig } = require('../config/email');

const businessTransportCache = new Map();
const PLACEHOLDER_VALUES = new Set([
  'value',
  'your_value',
  'yourvalue',
  'your_email',
  'your-email',
  'your_password',
  'your-password',
  'changeme',
  'replace_me',
  'replace-me',
  'null',
  'undefined'
]);

const toPositiveInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const sanitizeText = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  if (PLACEHOLDER_VALUES.has(normalized.toLowerCase())) return '';
  return normalized;
};

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
};

const buildBusinessEmailConfig = (integrationEmail = {}) => {
  if (!integrationEmail || integrationEmail.enabled !== true) {
    return null;
  }

  const host = sanitizeText(integrationEmail.host);
  const provider = sanitizeText(integrationEmail.provider).toLowerCase();
  const service = sanitizeText(integrationEmail.service || (provider === 'gmail' ? 'gmail' : ''));
  const user = sanitizeText(integrationEmail.username || integrationEmail.user);
  const pass = sanitizeText(integrationEmail.password || integrationEmail.pass);
  const fromEmail = sanitizeText(integrationEmail.fromEmail);
  const fromName = sanitizeText(integrationEmail.fromName) || 'Ledgerly';
  const explicitFrom = sanitizeText(integrationEmail.from);
  const port = toPositiveInt(integrationEmail.port, 587);
  const secure = toBoolean(integrationEmail.secure, port === 465);

  if ((!host && !service) || !user || !pass) {
    return null;
  }

  const transport = {
    secure,
    auth: {
      user,
      pass
    }
  };

  if (host) {
    transport.host = host;
  }
  if (service) {
    transport.service = service;
  }
  if (port) {
    transport.port = port;
  }

  const from = explicitFrom || (fromEmail ? `${fromName} <${fromEmail}>` : `Ledgerly <${user}>`);

  return {
    transport,
    from
  };
};

const getBusinessTransport = async (businessId) => {
  const normalizedBusinessId = String(businessId || '').trim();
  if (!normalizedBusinessId) {
    return null;
  }

  try {
    const settings = await Settings.findOne({ business: normalizedBusinessId })
      .select('integrations.email')
      .lean();

    const resolvedConfig = buildBusinessEmailConfig(settings?.integrations?.email);
    if (!resolvedConfig) {
      return null;
    }

    const cacheKey = JSON.stringify(resolvedConfig.transport);
    const cached = businessTransportCache.get(normalizedBusinessId);

    if (cached && cached.key === cacheKey) {
      return {
        transporter: cached.transporter,
        from: resolvedConfig.from
      };
    }

    const transporter = nodemailer.createTransport(resolvedConfig.transport);
    businessTransportCache.set(normalizedBusinessId, {
      key: cacheKey,
      transporter
    });

    return {
      transporter,
      from: resolvedConfig.from
    };
  } catch (error) {
    console.error('Unable to resolve business email integration config:', error?.message || error);
    return null;
  }
};

// Email templates
const templates = {
  invoice: `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { max-width: 150px; }
        .invoice-details { background: #f9f9f9; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .button { display: inline-block; background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
        .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          {{#if businessLogo}}<img src="{{businessLogo}}" alt="{{businessName}}" class="logo">{{/if}}
          <h1>{{businessName}}</h1>
        </div>
        
        <p>Dear {{customerName}},</p>
        
        <p>Please find attached your invoice <strong>{{invoiceNumber}}</strong> for {{totalAmount}} {{currency}}.</p>
        
        <div class="invoice-details">
          <p><strong>Invoice Number:</strong> {{invoiceNumber}}</p>
          <p><strong>Invoice Date:</strong> {{invoiceDate}}</p>
          <p><strong>Due Date:</strong> {{dueDate}}</p>
          <p><strong>Amount Due:</strong> {{totalAmount}} {{currency}}</p>
        </div>
        
        <p>You can view the invoice online by clicking the button below:</p>
        <p><a href="{{invoiceUrl}}" class="button">View Invoice</a></p>
        
        {{#if payNowUrl}}
        <p>To pay online, click the button below:</p>
        <p><a href="{{payNowUrl}}" class="button">Pay Now</a></p>
        {{/if}}
        
        <p>If you have any questions, please contact us.</p>
        
        <div class="footer">
          <p>This is an automated email from {{businessName}}.</p>
        </div>
      </div>
    </body>
    </html>
  `,
  receipt: `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { max-width: 150px; }
        .receipt-details { background: #f9f9f9; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          {{#if businessLogo}}<img src="{{businessLogo}}" alt="{{businessName}}" class="logo">{{/if}}
          <h1>{{businessName}}</h1>
        </div>
        
        <h2>Payment Receipt</h2>
        
        <p>Dear {{customerName}},</p>
        
        <p>Thank you for your payment. Here are your payment details:</p>
        
        <div class="receipt-details">
          <p><strong>Receipt Number:</strong> {{receiptNumber}}</p>
          <p><strong>Invoice Number:</strong> {{invoiceNumber}}</p>
          <p><strong>Payment Date:</strong> {{paymentDate}}</p>
          <p><strong>Amount Paid:</strong> {{amountPaid}}</p>
          <p><strong>Payment Method:</strong> {{paymentMethod}}</p>
        </div>
        
        <p>A copy of your receipt is attached to this email for your records.</p>
        
        <p>Thank you for your business!</p>
        
        <div class="footer">
          <p>This is an automated email from {{businessName}}.</p>
        </div>
      </div>
    </body>
    </html>
  `,
  'payment-reminder': `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { max-width: 150px; }
        .reminder-details { background: #fff3cd; padding: 20px; border-radius: 5px; margin-bottom: 20px; border: 1px solid #ffeaa7; }
        .button { display: inline-block; background: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
        .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          {{#if businessLogo}}<img src="{{businessLogo}}" alt="{{businessName}}" class="logo">{{/if}}
          <h1>{{businessName}}</h1>
        </div>
        
        <h2>Payment Reminder</h2>
        
        <p>Dear {{customerName}},</p>
        
        <div class="reminder-details">
          <p>This is a friendly reminder that your invoice <strong>{{invoiceNumber}}</strong> 
          {{#if overdueDays}}is <strong>{{overdueDays}} days</strong> overdue{{else}}is due soon{{/if}}.</p>
          
          <p><strong>Amount Due:</strong> {{amountDue}} {{currency}}</p>
          <p><strong>Due Date:</strong> {{dueDate}}</p>
          
          {{#if lateFeeMessage}}
          <p><strong>Note:</strong> {{lateFeeMessage}}</p>
          {{/if}}
        </div>
        
        <p>Please make payment at your earliest convenience.</p>
        
        <p>You can view and pay the invoice online:</p>
        <p><a href="{{invoiceUrl}}" class="button">View Invoice</a></p>
        
        {{#if payNowUrl}}
        <p><a href="{{payNowUrl}}" class="button">Pay Now</a></p>
        {{/if}}
        
        <div class="footer">
          <p>This is an automated reminder from {{businessName}}.</p>
        </div>
      </div>
    </body>
    </html>
  `
};

// Send email function
const sendEmail = async (options) => {
  const defaultEmailConfig = getEmailConfig();
  const businessTransport = await getBusinessTransport(options?.businessId);

  const message = {
    from: options.from || businessTransport?.from || defaultEmailConfig.from,
    to: options.to,
    subject: options.subject,
    text: options.text || options.subject,
    html: options.html
  };

  // Use template if specified
  if (options.template && templates[options.template]) {
    let html = templates[options.template];
    
    // Minimal conditional support for {{#if key}}...{{/if}}
    html = html.replace(/{{#if\s+([a-zA-Z0-9_]+)}}([\s\S]*?){{\/if}}/g, (match, key, content) => {
      const value = options.context?.[key];
      return value ? content : '';
    });

    // Replace template variables
    if (options.context) {
      Object.keys(options.context).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        html = html.replace(regex, options.context[key]);
      });
    }

    // Remove any unreplaced template tags left behind
    html = html.replace(/{{[^}]+}}/g, '');
    
    message.html = html;
  }

  // Add attachments
  if (options.attachments) {
    message.attachments = options.attachments;
  }

  const transporter = businessTransport?.transporter || getTransporter();
  if (!transporter) {
    throw new Error(
      'Email service is not configured. Add SMTP credentials in Settings > Integrations (Email) or set MAIL_*/EMAIL_*/SMTP_* env variables.'
    );
  }

  try {
    const info = await transporter.sendMail(message);
    if (Array.isArray(info?.rejected) && info.rejected.length > 0) {
      throw new Error(`Email rejected for recipient(s): ${info.rejected.join(', ')}`);
    }
    if (Array.isArray(info?.accepted) && info.accepted.length === 0) {
      throw new Error('Email was not accepted by SMTP provider');
    }
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

module.exports = sendEmail;
