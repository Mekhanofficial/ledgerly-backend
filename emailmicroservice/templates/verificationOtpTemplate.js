const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildVerificationOtpEmail = ({ name, otp, expiresInMinutes = 10 }) => {
  const safeName = escapeHtml(name || 'there');
  const safeOtp = escapeHtml(String(otp || ''));

  return {
    subject: 'Your Ledgerly verification code',
    text: `Hi ${name || 'there'},\n\nYour Ledgerly verification code is: ${otp}\nThis code expires in ${expiresInMinutes} minutes.\n\nIf you did not create this account, please ignore this email.`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Ledgerly Email Verification</title>
      </head>
      <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#1f2937;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding:24px;">
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background:#ffffff;border-radius:10px;padding:28px;">
                <tr>
                  <td style="font-size:24px;font-weight:700;color:#111827;padding-bottom:10px;">Verify your Ledgerly account</td>
                </tr>
                <tr>
                  <td style="font-size:15px;line-height:1.6;padding-bottom:18px;">Hi ${safeName},</td>
                </tr>
                <tr>
                  <td style="font-size:15px;line-height:1.6;padding-bottom:18px;">Use this one-time code to verify your email:</td>
                </tr>
                <tr>
                  <td style="padding-bottom:18px;">
                    <div style="display:inline-block;font-size:30px;letter-spacing:8px;font-weight:700;background:#eef2ff;color:#1d4ed8;padding:12px 18px;border-radius:8px;">${safeOtp}</div>
                  </td>
                </tr>
                <tr>
                  <td style="font-size:14px;line-height:1.6;color:#4b5563;padding-bottom:20px;">This code expires in ${expiresInMinutes} minutes.</td>
                </tr>
                <tr>
                  <td style="font-size:12px;line-height:1.6;color:#6b7280;">If you did not create this account, you can safely ignore this email.</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `
  };
};

module.exports = {
  buildVerificationOtpEmail
};
