const sendEmail = require('../utils/email');
const { isEmailConfigured } = require('../config/email');
const { buildVerificationOtpEmail } = require('./templates/verificationOtpTemplate');

const OTP_EXPIRY_MINUTES = 10;

const sendVerificationOtpEmail = async ({ to, name, otp }) => {
  if (!isEmailConfigured()) {
    throw new Error(
      'Email service is not configured. Set MAIL_*/EMAIL_*/SMTP_* credentials (host/service + user + pass).'
    );
  }

  const message = buildVerificationOtpEmail({
    name,
    otp,
    expiresInMinutes: OTP_EXPIRY_MINUTES
  });

  const result = await sendEmail({
    to,
    subject: message.subject,
    text: message.text,
    html: message.html
  });

  if (!result) {
    throw new Error('Failed to send verification OTP email.');
  }

  return result;
};

module.exports = {
  OTP_EXPIRY_MINUTES,
  sendVerificationOtpEmail
};
