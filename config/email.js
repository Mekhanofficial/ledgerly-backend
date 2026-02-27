const parsePort = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const PLACEHOLDER_VALUES = new Set([
  'value',
  'your_value',
  'yourvalue',
  'your_email',
  'your-email',
  'your password',
  'your_password',
  'your-password',
  'changeme',
  'replace_me',
  'replace-me',
  'null',
  'undefined'
]);

const isPlaceholderValue = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return PLACEHOLDER_VALUES.has(normalized);
};

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (!normalized || isPlaceholderValue(normalized)) continue;
    return normalized;
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
  const connectionTimeout = parsePositiveInt(
    firstNonEmpty(
      process.env.MAIL_CONNECTION_TIMEOUT,
      process.env.EMAIL_CONNECTION_TIMEOUT,
      process.env.SMTP_CONNECTION_TIMEOUT,
      process.env.MAILER_CONNECTION_TIMEOUT,
      process.env.MAIL_TIMEOUT,
      process.env.EMAIL_TIMEOUT,
      process.env.SMTP_TIMEOUT
    ),
    8000
  );
  const greetingTimeout = parsePositiveInt(
    firstNonEmpty(
      process.env.MAIL_GREETING_TIMEOUT,
      process.env.EMAIL_GREETING_TIMEOUT,
      process.env.SMTP_GREETING_TIMEOUT,
      process.env.MAILER_GREETING_TIMEOUT,
      process.env.MAIL_TIMEOUT,
      process.env.EMAIL_TIMEOUT,
      process.env.SMTP_TIMEOUT
    ),
    8000
  );
  const socketTimeout = parsePositiveInt(
    firstNonEmpty(
      process.env.MAIL_SOCKET_TIMEOUT,
      process.env.EMAIL_SOCKET_TIMEOUT,
      process.env.SMTP_SOCKET_TIMEOUT,
      process.env.MAILER_SOCKET_TIMEOUT,
      process.env.MAIL_TIMEOUT,
      process.env.EMAIL_TIMEOUT,
      process.env.SMTP_TIMEOUT
    ),
    12000
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

  return {
    host,
    service: inferredService,
    port,
    secure,
    user,
    pass,
    from: normalizedFrom,
    connectionTimeout,
    greetingTimeout,
    socketTimeout
  };
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
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    },
    connectionTimeout: config.connectionTimeout,
    greetingTimeout: config.greetingTimeout,
    socketTimeout: config.socketTimeout
  };

  if (config.host) {
    transport.host = config.host;
  }

  if (config.port) {
    transport.port = config.port;
  }

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
