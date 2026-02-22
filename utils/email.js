const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Create transporter if credentials exist
let transporter = null;

if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_PORT === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  // Verify connection
  transporter.verify((error, success) => {
    if (error) {
      console.error('Email connection error:', error);
    } else {
      console.log('Email server is ready to send messages');
    }
  });
} else {
  console.warn('Email transporter not configured. Set EMAIL_HOST/EMAIL_USER/EMAIL_PASS to enable delivery.');
}

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
  const message = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'Ledgerly <no-reply@ledgerly.com>',
    to: options.to,
    subject: options.subject,
    text: options.text || options.subject,
    html: options.html
  };

  // Use template if specified
  if (options.template && templates[options.template]) {
    let html = templates[options.template];
    
    // Replace template variables
    if (options.context) {
      Object.keys(options.context).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        html = html.replace(regex, options.context[key]);
      });
    }
    
    message.html = html;
  }

  // Add attachments
  if (options.attachments) {
    message.attachments = options.attachments;
  }

  if (!transporter) {
    console.warn('Skipping email send because transporter is not configured. Message details:', message);
    return null;
  }

  try {
    const info = await transporter.sendMail(message);
    console.log('Email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

module.exports = sendEmail;
