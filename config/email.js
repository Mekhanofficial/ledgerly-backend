const parsePort = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return '';
};

const resolveSecureFlag = (value, port) => {
  if (value === undefined || value === null || value === '') {
    return port === 465;
  }
  return String(value).trim().toLowerCase() === 'true';
};

const extractEmailAddress = (value) => {
  const input = String(value || '').trim();
  if (!input) return '';
  const match = input.match(/<([^>]+)>/);
  return (match ? match[1] : input).trim().toLowerCase();
};

const isGmailTransport = ({ host, service, user }) => {
  const hostValue = String(host || '').toLowerCase();
  const serviceValue = String(service || '').toLowerCase();
  const userValue = String(user || '').toLowerCase();
  return hostValue.includes('gmail')
    || serviceValue.includes('gmail')
    || userValue.endsWith('@gmail.com');
};

const getEmailConfig = () => {
  const host = firstNonEmpty(
    process.env.MAIL_HOST,
    process.env.EMAIL_HOST,
    process.env.SMTP_HOST,
    process.env.MAILER_HOST
  );
  const service = firstNonEmpty(
    process.env.MAIL_SERVICE,
    process.env.EMAIL_SERVICE,
    process.env.SMTP_SERVICE,
    process.env.MAILER_SERVICE
  );
  const user = firstNonEmpty(
    process.env.MAIL_USER,
    process.env.EMAIL_USER,
    process.env.MAIL_USERNAME,
    process.env.EMAIL_USERNAME,
    process.env.SMTP_USER,
    process.env.SMTP_USERNAME,
    process.env.GMAIL_USER,
    process.env.MAILER_USER,
    process.env.MAILER_EMAIL,
    process.env.SMTP_LOGIN
  );
  const pass = firstNonEmpty(
    process.env.MAIL_PASS,
    process.env.EMAIL_PASS,
    process.env.MAIL_PASSWORD,
    process.env.EMAIL_PASSWORD,
    process.env.SMTP_PASS,
    process.env.SMTP_PASSWORD,
    process.env.GMAIL_APP_PASSWORD,
    process.env.MAILER_PASS,
    process.env.MAILER_PASSWORD,
    process.env.SMTP_KEY
  );
  const port = parsePort(
    firstNonEmpty(
      process.env.MAIL_PORT,
      process.env.EMAIL_PORT,
      process.env.SMTP_PORT,
      process.env.MAILER_PORT
    ),
    587
  );
  const secure = resolveSecureFlag(
    firstNonEmpty(
      process.env.MAIL_SECURE,
      process.env.EMAIL_SECURE,
      process.env.SMTP_SECURE,
      process.env.MAILER_SECURE
    ),
    port
  );
  const from = firstNonEmpty(
    process.env.MAIL_FROM,
    process.env.EMAIL_FROM,
    process.env.SMTP_FROM,
    process.env.MAILER_FROM,
    process.env.FROM_EMAIL,
    user
  ) ||
    'Ledgerly <no-reply@ledgerly.com>';

  const inferredService = service || (!host && String(user || '').toLowerCase().endsWith('@gmail.com') ? 'gmail' : '');
  const gmailMode = isGmailTransport({ host, service: inferredService, user });
  const fromEmail = extractEmailAddress(from);
  const userEmail = extractEmailAddress(user);
  const normalizedFrom = gmailMode && userEmail && fromEmail && fromEmail !== userEmail
    ? `Ledgerly <${userEmail}>`
    : from;

  return { host, service: inferredService, port, secure, user, pass, from: normalizedFrom };
};

const isEmailConfigured = () => {
  const { host, service, user, pass } = getEmailConfig();
  return Boolean((host || service) && user && pass);
};

const getMailerTransportConfig = () => {
  const config = getEmailConfig();
  if ((!config.host && !config.service) || !config.user || !config.pass) {
    return null;
  }

  const transport = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  };

  if (config.service) {
    transport.service = config.service;
  }

  return transport;
};

module.exports = {
  getEmailConfig,
  isEmailConfigured,
  getMailerTransportConfig
};
