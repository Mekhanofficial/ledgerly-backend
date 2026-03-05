const sendEmail = require('../utils/email');
const { isEmailConfigured } = require('../config/email');
const { buildVerificationOtpEmail } = require('./templates/verificationOtpTemplate');

const OTP_EXPIRY_MINUTES = 10;

const sendVerificationOtpEmail = async ({ to, name, otp }) => {
  const hasBrevoApiKey = Boolean(
    String(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim()
  );
  const hasResendApiKey = Boolean(String(process.env.RESEND_API_KEY || '').trim());
  if (!isEmailConfigured() && !hasBrevoApiKey && !hasResendApiKey) {
    throw new Error(
      'Email service is not configured. Set BREVO_API_KEY or RESEND_API_KEY (recommended on Render Free), or MAIL_*/EMAIL_*/SMTP_* credentials.'
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
