const nodemailer = require('nodemailer');
const axios = require('axios');
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

const toRecipientList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeText(entry))
      .filter(Boolean);
  }
  const normalized = sanitizeText(value);
  if (!normalized) return [];
  return normalized
    .split(',')
    .map((entry) => sanitizeText(entry))
    .filter(Boolean);
};

const uniqueNonEmpty = (values) => {
  const output = [];
  const seen = new Set();
  values.forEach((value) => {
    const normalized = sanitizeText(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(normalized);
  });
  return output;
};

const toBase64Content = (value) => {
  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }
  if (value === undefined || value === null) {
    return '';
  }
  return Buffer.from(String(value), 'utf8').toString('base64');
};

const resolvePreferredProvider = () =>
  sanitizeText(process.env.EMAIL_DELIVERY_PROVIDER || process.env.EMAIL_PROVIDER).toLowerCase();

const getResendConfig = (defaultFrom = '') => {
  const apiKey = sanitizeText(process.env.RESEND_API_KEY);
  if (!apiKey) {
    return null;
  }
  return {
    apiKey,
    apiBaseUrl: sanitizeText(process.env.RESEND_API_BASE_URL) || 'https://api.resend.com',
    from: sanitizeText(process.env.RESEND_FROM) || sanitizeText(defaultFrom)
  };
};

const parseSenderAddress = (value, fallbackName = 'Ledgerly') => {
  const normalized = sanitizeText(value);
  if (!normalized) {
    return {
      email: '',
      name: fallbackName
    };
  }

  const match = normalized.match(/^(.*)<([^>]+)>$/);
  if (match) {
    const name = sanitizeText(match[1]) || fallbackName;
    const email = sanitizeText(match[2]).toLowerCase();
    return { name, email };
  }

  return {
    email: normalized.toLowerCase(),
    name: fallbackName
  };
};

const getBrevoConfig = (defaultFrom = '') => {
  const apiKey = sanitizeText(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY);
  if (!apiKey) {
    return null;
  }

  const configuredSender = sanitizeText(
    process.env.BREVO_FROM
    || process.env.BREVO_SENDER
    || process.env.BREVO_SENDER_EMAIL
    || defaultFrom
  );
  const sender = parseSenderAddress(configuredSender, sanitizeText(process.env.BREVO_SENDER_NAME) || 'Ledgerly');

  if (!sender.email) {
    return null;
  }

  return {
    apiKey,
    apiBaseUrl: sanitizeText(process.env.BREVO_API_BASE_URL) || 'https://api.brevo.com/v3',
    sender
  };
};

const buildResendAttachments = (attachments = []) =>
  (Array.isArray(attachments) ? attachments : [])
    .map((attachment) => {
      const filename = sanitizeText(attachment?.filename || attachment?.name);
      const content = toBase64Content(attachment?.content);
      if (!filename || !content) {
        return null;
      }
      const mapped = {
        filename,
        content
      };
      const contentType = sanitizeText(attachment?.contentType || attachment?.type);
      if (contentType) {
        mapped.content_type = contentType;
      }
      return mapped;
    })
    .filter(Boolean);

const buildBrevoAttachments = (attachments = []) =>
  (Array.isArray(attachments) ? attachments : [])
    .map((attachment) => {
      const name = sanitizeText(attachment?.filename || attachment?.name);
      const content = toBase64Content(attachment?.content);
      if (!name || !content) {
        return null;
      }
      return {
        name,
        content
      };
    })
    .filter(Boolean);

const parseHttpErrorMessage = (error, fallback) => {
  const responseData = error?.response?.data;
  const responseMessage =
    typeof responseData === 'string'
      ? responseData
      : responseData?.message || responseData?.error || responseData?.details;
  const status = error?.response?.status;
  const detail = responseMessage || error?.message || fallback;
  return status ? `${detail} (status ${status})` : detail;
};

const sendViaResend = async ({ resendConfig, message, defaultFrom }) => {
  const to = toRecipientList(message?.to);
  if (!to.length) {
    throw new Error('No recipient email address provided');
  }

  const senderCandidates = uniqueNonEmpty([
    message?.from,
    resendConfig?.from,
    defaultFrom
  ]);
  if (!senderCandidates.length) {
    throw new Error('No sender email configured for Resend delivery');
  }

  const payloadBase = {
    to,
    subject: sanitizeText(message?.subject) || 'Ledgerly notification',
    html: sanitizeText(message?.html),
    text: sanitizeText(message?.text),
    attachments: buildResendAttachments(message?.attachments)
  };

  if (!payloadBase.html && !payloadBase.text) {
    payloadBase.text = payloadBase.subject;
  }

  const timeout = toPositiveInt(process.env.RESEND_TIMEOUT_MS, 30000);
  let lastError = null;

  for (const from of senderCandidates) {
    try {
      const payload = {
        ...payloadBase,
        from
      };
      const response = await axios.post(
        `${resendConfig.apiBaseUrl.replace(/\/+$/, '')}/emails`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${resendConfig.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout
        }
      );

      const messageId = response?.data?.id || response?.headers?.['x-request-id'] || '';
      console.log('Email sent (Resend API):', messageId || '(no id)');
      return {
        messageId,
        accepted: to,
        rejected: []
      };
    } catch (error) {
      lastError = new Error(parseHttpErrorMessage(error, 'Resend API request failed'));
      const looksLikeSenderIssue = /from|sender|domain|verify|not allowed|forbidden/i.test(
        String(lastError.message || '')
      );
      if (!looksLikeSenderIssue) {
        break;
      }
    }
  }

  throw lastError || new Error('Resend API request failed');
};

const sendViaBrevo = async ({ brevoConfig, message, defaultFrom }) => {
  const recipients = toRecipientList(message?.to).map((email) => ({ email }));
  if (!recipients.length) {
    throw new Error('No recipient email address provided');
  }

  const senderCandidates = uniqueNonEmpty([
    message?.from,
    `${brevoConfig?.sender?.name || 'Ledgerly'} <${brevoConfig?.sender?.email || ''}>`,
    defaultFrom
  ]);

  const timeout = toPositiveInt(process.env.BREVO_TIMEOUT_MS, 30000);
  let lastError = null;

  for (const candidate of senderCandidates) {
    const sender = parseSenderAddress(candidate, brevoConfig?.sender?.name || 'Ledgerly');
    if (!sender.email) {
      continue;
    }

    const payload = {
      sender,
      to: recipients,
      subject: sanitizeText(message?.subject) || 'Ledgerly notification',
      htmlContent: sanitizeText(message?.html),
      textContent: sanitizeText(message?.text),
      attachment: buildBrevoAttachments(message?.attachments)
    };

    if (!payload.htmlContent && !payload.textContent) {
      payload.textContent = payload.subject;
    }

    if (!payload.attachment.length) {
      delete payload.attachment;
    }

    try {
      const response = await axios.post(
        `${brevoConfig.apiBaseUrl.replace(/\/+$/, '')}/smtp/email`,
        payload,
        {
          headers: {
            'api-key': brevoConfig.apiKey,
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          timeout
        }
      );

      const messageId = response?.data?.messageId || response?.headers?.['x-message-id'] || '';
      console.log('Email sent (Brevo API):', messageId || '(no id)');
      return {
        messageId,
        accepted: recipients.map((recipient) => recipient.email),
        rejected: []
      };
    } catch (error) {
      lastError = new Error(parseHttpErrorMessage(error, 'Brevo API request failed'));
      const looksLikeSenderIssue = /from|sender|domain|forbidden|unauthorized|invalid/i.test(
        String(lastError.message || '')
      );
      if (!looksLikeSenderIssue) {
        break;
      }
    }
  }

  throw lastError || new Error('Brevo API request failed');
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

const shouldTryDefaultTransportFallback = (error) => {
  const text = String(error?.message || '').toLowerCase();
  return /econn|enotfound|ehostunreach|eai_again|etimedout|timeout|connection|network|socket|greeting|tls|ssl|auth|invalid login|credentials|535|534/.test(text);
};

const assertEmailAccepted = (info) => {
  if (Array.isArray(info?.rejected) && info.rejected.length > 0) {
    throw new Error(`Email rejected for recipient(s): ${info.rejected.join(', ')}`);
  }
  if (Array.isArray(info?.accepted) && info.accepted.length === 0) {
    throw new Error('Email was not accepted by SMTP provider');
  }
};

const isGmailTransportConfig = (config = {}) => {
  const host = String(config.host || '').toLowerCase();
  const service = String(config.service || '').toLowerCase();
  const user = String(config.user || '').toLowerCase();
  return host.includes('gmail') || service.includes('gmail') || user.endsWith('@gmail.com');
};

const buildGmailFallbackTransports = (defaultEmailConfig = {}) => {
  const user = sanitizeText(defaultEmailConfig.user);
  const pass = sanitizeText(defaultEmailConfig.pass);
  if (!user || !pass || !isGmailTransportConfig(defaultEmailConfig)) {
    return [];
  }

  const connectionTimeout = toPositiveInt(defaultEmailConfig.connectionTimeout, 20000);
  const greetingTimeout = toPositiveInt(defaultEmailConfig.greetingTimeout, 20000);
  const socketTimeout = toPositiveInt(defaultEmailConfig.socketTimeout, 25000);

  const baseTransport = {
    host: 'smtp.gmail.com',
    auth: { user, pass },
    connectionTimeout,
    greetingTimeout,
    socketTimeout,
    family: 4,
    tls: { minVersion: 'TLSv1.2' }
  };

  const candidates = [
    {
      ...baseTransport,
      port: 587,
      secure: false,
      requireTLS: true
    },
    {
      ...baseTransport,
      port: 465,
      secure: true
    }
  ];

  return candidates;
};

const tryAlternativeDefaultTransport = async ({ defaultEmailConfig, message }) => {
  const candidates = buildGmailFallbackTransports(defaultEmailConfig);
  let lastError = null;

  for (const transportConfig of candidates) {
    try {
      console.warn(
        `Retrying email with alternate Gmail transport (port=${transportConfig.port}, secure=${transportConfig.secure})`
      );
      const transporter = nodemailer.createTransport(transportConfig);
      const info = await transporter.sendMail({
        ...message,
        from: message.from || defaultEmailConfig.from
      });
      assertEmailAccepted(info);
      console.log('Email sent (alternate SMTP transport):', info.messageId);
      return info;
    } catch (error) {
      lastError = error;
      console.error(
        `Alternate Gmail transport failed (port=${transportConfig.port}, secure=${transportConfig.secure}):`,
        error?.message || error
      );
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
};

// Send email function
const sendEmail = async (options) => {
  const defaultEmailConfig = getEmailConfig();
  const preferredProvider = resolvePreferredProvider();
  const prefersBrevo = ['brevo', 'sendinblue', 'sib'].includes(preferredProvider);
  const brevoConfig = getBrevoConfig(defaultEmailConfig.from);
  const resendConfig = getResendConfig(defaultEmailConfig.from);
  const businessTransport = await getBusinessTransport(options?.businessId);
  const defaultTransporter = getTransporter();

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

  if (prefersBrevo && brevoConfig) {
    try {
      return await sendViaBrevo({
        brevoConfig,
        message,
        defaultFrom: defaultEmailConfig.from
      });
    } catch (brevoError) {
      console.error('Preferred Brevo provider failed, falling back to SMTP:', brevoError);
    }
  }

  if (preferredProvider === 'resend' && resendConfig) {
    try {
      return await sendViaResend({
        resendConfig,
        message,
        defaultFrom: defaultEmailConfig.from
      });
    } catch (resendError) {
      console.error('Preferred Resend provider failed, falling back to SMTP:', resendError);
    }
  }

  const transporter = businessTransport?.transporter || defaultTransporter;
  if (!transporter) {
    if (brevoConfig) {
      return sendViaBrevo({
        brevoConfig,
        message,
        defaultFrom: defaultEmailConfig.from
      });
    }
    if (resendConfig) {
      return sendViaResend({
        resendConfig,
        message,
        defaultFrom: defaultEmailConfig.from
      });
    }
    throw new Error(
      'Email service is not configured. Set BREVO_API_KEY or RESEND_API_KEY (recommended on Render Free), or add MAIL_*/EMAIL_*/SMTP_* credentials.'
    );
  }

  try {
    const info = await transporter.sendMail(message);
    assertEmailAccepted(info);
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    const canFallbackToDefault =
      Boolean(businessTransport?.transporter)
      && Boolean(defaultTransporter)
      && businessTransport.transporter !== defaultTransporter
      && shouldTryDefaultTransportFallback(error);

    if (canFallbackToDefault) {
      try {
        const fallbackMessage = {
          ...message,
          from: options.from || defaultEmailConfig.from
        };
        console.warn('Business SMTP failed, retrying with global SMTP transport');
        const info = await defaultTransporter.sendMail(fallbackMessage);
        assertEmailAccepted(info);
        console.log('Email sent (global fallback):', info.messageId);
        return info;
      } catch (fallbackError) {
        if (shouldTryDefaultTransportFallback(fallbackError)) {
          const info = await tryAlternativeDefaultTransport({
            defaultEmailConfig,
            message
          });
          if (info) {
            return info;
          }
        }

        if (brevoConfig && shouldTryDefaultTransportFallback(fallbackError)) {
          try {
            console.warn('Global SMTP fallback failed, retrying with Brevo HTTP API');
            return await sendViaBrevo({
              brevoConfig,
              message,
              defaultFrom: defaultEmailConfig.from
            });
          } catch (brevoError) {
            console.error('Brevo fallback failed:', brevoError);
          }
        }

        if (resendConfig && shouldTryDefaultTransportFallback(fallbackError)) {
          try {
            console.warn('Global SMTP fallback failed, retrying with Resend HTTP API');
            return await sendViaResend({
              resendConfig,
              message,
              defaultFrom: defaultEmailConfig.from
            });
          } catch (resendError) {
            console.error('Resend fallback failed:', resendError);
          }
        }

        console.error('Global SMTP fallback failed:', fallbackError);
        throw fallbackError;
      }
    }

    const canRetryDefaultTransport =
      transporter === defaultTransporter
      && shouldTryDefaultTransportFallback(error);
    if (canRetryDefaultTransport) {
      const info = await tryAlternativeDefaultTransport({
        defaultEmailConfig,
        message
      });
      if (info) {
        return info;
      }
    }

    if (brevoConfig && shouldTryDefaultTransportFallback(error)) {
      try {
        console.warn('SMTP delivery failed, retrying with Brevo HTTP API');
        return await sendViaBrevo({
          brevoConfig,
          message,
          defaultFrom: defaultEmailConfig.from
        });
      } catch (brevoError) {
        console.error('Brevo fallback failed:', brevoError);
      }
    }

    if (resendConfig && shouldTryDefaultTransportFallback(error)) {
      try {
        console.warn('SMTP delivery failed, retrying with Resend HTTP API');
        return await sendViaResend({
          resendConfig,
          message,
          defaultFrom: defaultEmailConfig.from
        });
      } catch (resendError) {
        console.error('Resend fallback failed:', resendError);
      }
    }

    console.error('Error sending email:', error);
    throw error;
  }
};

module.exports = sendEmail;
