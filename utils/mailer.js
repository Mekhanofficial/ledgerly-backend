const nodemailer = require('nodemailer');

const resolveMailConfig = () => {
  const host = process.env.MAIL_HOST || process.env.EMAIL_HOST;
  const user = process.env.MAIL_USER || process.env.EMAIL_USER;
  const pass = process.env.MAIL_PASS || process.env.EMAIL_PASS;
  const portValue = process.env.MAIL_PORT || process.env.EMAIL_PORT;
  const port = Number.parseInt(portValue, 10) || 587;
  const secureFlag = process.env.MAIL_SECURE || process.env.EMAIL_SECURE;
  const secure = secureFlag !== undefined
    ? String(secureFlag).trim().toLowerCase() === 'true'
    : port === 465;

  if (!host || !user || !pass) {
    return null;
  }

  return {
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  };
};

const mailConfig = resolveMailConfig();

if (!mailConfig) {
  console.warn(
    'Mailer not configured. Set MAIL_HOST/MAIL_PORT/MAIL_USER/MAIL_PASS (or EMAIL_* equivalents) to enable email delivery.'
  );
}

const transporter = mailConfig ? nodemailer.createTransport(mailConfig) : null;

module.exports = transporter;
