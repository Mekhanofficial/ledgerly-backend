const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const templates = require('../data/templates');

const DEFAULT_RECEIPT_COLORS = {
  primary: [41, 128, 185],
  secondary: [52, 152, 219],
  accent: [236, 240, 241],
  text: [44, 62, 80]
};

const normalizeColor = (value, fallback) => {
  if (Array.isArray(value) && value.length === 3) {
    return value;
  }
  return fallback;
};

const resolveReceiptTemplate = (receipt) => {
  const templateId = receipt?.templateStyle || receipt?.templateId || receipt?.template;
  if (templateId) {
    const found = templates.find((template) => template.id === templateId);
    if (found) {
      return found;
    }
  }
  return templates.find((template) => template.id === 'standard') || templates[0] || {};
};

// Generate invoice PDF
exports.invoice = async (invoice) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Header
      doc
        .fontSize(20)
        .text(invoice.business.name, { align: 'center' })
        .moveDown(0.5);
      
      doc
        .fontSize(10)
        .text(invoice.business.address?.street || '', { align: 'center' })
        .text(`${invoice.business.address?.city || ''}, ${invoice.business.address?.state || ''} ${invoice.business.address?.postalCode || ''}`, { align: 'center' })
        .text(`Phone: ${invoice.business.phone} | Email: ${invoice.business.email}`, { align: 'center' })
        .moveDown(1);

      // Invoice title
      doc
        .fontSize(16)
        .text('INVOICE', { align: 'center', underline: true })
        .moveDown(1);

      // Invoice details
      const invoiceDetailsTop = doc.y;
      
      doc
        .fontSize(10)
        .text('Invoice Number:', 50, invoiceDetailsTop)
        .text(invoice.invoiceNumber, 150, invoiceDetailsTop)
        .text('Invoice Date:', 50, invoiceDetailsTop + 15)
        .text(invoice.date.toLocaleDateString(), 150, invoiceDetailsTop + 15)
        .text('Due Date:', 50, invoiceDetailsTop + 30)
        .text(invoice.dueDate.toLocaleDateString(), 150, invoiceDetailsTop + 30)
        .text('Status:', 50, invoiceDetailsTop + 45)
        .text(invoice.status.toUpperCase(), 150, invoiceDetailsTop + 45);

      // Customer details
      const customerDetailsTop = invoiceDetailsTop;
      
      doc
        .text('Bill To:', 350, customerDetailsTop)
        .fontSize(9)
        .text(invoice.customer.name, 350, customerDetailsTop + 15);
      
      if (invoice.customer.company) {
        doc.text(invoice.customer.company, 350, customerDetailsTop + 30);
      }
      
      if (invoice.customer.address?.street) {
        doc.text(invoice.customer.address.street, 350, customerDetailsTop + 45);
        doc.text(`${invoice.customer.address.city}, ${invoice.customer.address.state} ${invoice.customer.address.postalCode}`, 350, customerDetailsTop + 60);
      }
      
      if (invoice.customer.email) {
        doc.text(`Email: ${invoice.customer.email}`, 350, customerDetailsTop + 75);
      }
      
      if (invoice.customer.phone) {
        doc.text(`Phone: ${invoice.customer.phone}`, 350, customerDetailsTop + 90);
      }

      doc.moveDown(8);

      // Items table
      const tableTop = doc.y;
      const itemHeaderY = tableTop;
      
      // Table headers
      doc
        .fontSize(9)
        .text('#', 50, itemHeaderY)
        .text('Description', 70, itemHeaderY)
        .text('Qty', 300, itemHeaderY)
        .text('Unit Price', 340, itemHeaderY)
        .text('Amount', 400, itemHeaderY, { width: 90, align: 'right' });
      
      // Horizontal line
      doc.moveTo(50, itemHeaderY + 15).lineTo(500, itemHeaderY + 15).stroke();

      // Table rows
      let y = itemHeaderY + 25;
      invoice.items.forEach((item, index) => {
        doc
          .text((index + 1).toString(), 50, y)
          .text(item.description, 70, y, { width: 220 })
          .text(item.quantity.toString(), 300, y)
          .text(`${invoice.currency} ${item.unitPrice.toFixed(2)}`, 340, y)
          .text(`${invoice.currency} ${item.total.toFixed(2)}`, 400, y, { width: 90, align: 'right' });
        
        y += 20;
        
        // Check for page break
        if (y > 700) {
          doc.addPage();
          y = 50;
        }
      });

      // Summary
      const summaryY = Math.max(y + 20, 550);
      
      doc
        .fontSize(10)
        .text('Subtotal:', 350, summaryY)
        .text(`${invoice.currency} ${invoice.subtotal.toFixed(2)}`, 450, summaryY, { width: 90, align: 'right' })
        .text('Discount:', 350, summaryY + 15)
        .text(`${invoice.currency} ${invoice.discount.amount.toFixed(2)}`, 450, summaryY + 15, { width: 90, align: 'right' })
        .text('Tax:', 350, summaryY + 30)
        .text(`${invoice.currency} ${invoice.tax.amount.toFixed(2)}`, 450, summaryY + 30, { width: 90, align: 'right' });
      
      // Horizontal line
      doc.moveTo(350, summaryY + 45).lineTo(500, summaryY + 45).stroke();
      
      doc
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Total:', 350, summaryY + 55)
        .text(`${invoice.currency} ${invoice.total.toFixed(2)}`, 450, summaryY + 55, { width: 90, align: 'right' })
        .font('Helvetica');

      // Amount paid and balance
      doc
        .fontSize(10)
        .text('Amount Paid:', 350, summaryY + 80)
        .text(`${invoice.currency} ${invoice.amountPaid.toFixed(2)}`, 450, summaryY + 80, { width: 90, align: 'right' })
        .text('Balance Due:', 350, summaryY + 95)
        .text(`${invoice.currency} ${invoice.balance.toFixed(2)}`, 450, summaryY + 95, { width: 90, align: 'right' });

      // Notes and terms
      if (invoice.notes || invoice.terms) {
        doc.moveDown(3);
        
        if (invoice.notes) {
          doc
            .fontSize(9)
            .text('Notes:', 50, doc.y)
            .text(invoice.notes, 50, doc.y + 15, { width: 500 });
        }
        
        if (invoice.terms) {
          doc.moveDown(1);
          doc
            .fontSize(9)
            .text('Terms & Conditions:', 50, doc.y)
            .text(invoice.terms, 50, doc.y + 15, { width: 500 });
        }
      }

      // Footer
      doc
        .fontSize(8)
        .text('Thank you for your business!', { align: 'center' })
        .text(invoice.business.name, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// Generate receipt PDF
exports.receipt = async (receipt) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A6', margin: 20 });
      const buffers = [];
      const template = resolveReceiptTemplate(receipt);
      const colors = template.colors || {};
      const primaryColor = normalizeColor(colors.primary, DEFAULT_RECEIPT_COLORS.primary);
      const secondaryColor = normalizeColor(colors.secondary, DEFAULT_RECEIPT_COLORS.secondary);
      const accentColor = normalizeColor(colors.accent, DEFAULT_RECEIPT_COLORS.accent);
      const textColor = normalizeColor(colors.text, DEFAULT_RECEIPT_COLORS.text);
      const pageWidth = doc.page.width;
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Header
      const headerHeight = template?.layout?.showHeaderBorder ? 28 : 0;
      if (headerHeight) {
        doc.rect(0, 0, pageWidth, headerHeight).fill(primaryColor);
        doc.fillColor('white')
          .fontSize(12)
          .text(receipt.business.name, 0, 10, { align: 'center', width: pageWidth });
        doc.fillColor(textColor);
        doc.y = headerHeight + 6;
      } else {
        doc
          .fillColor(primaryColor)
          .fontSize(14)
          .text(receipt.business.name, { align: 'center' })
          .moveDown(0.2);
      }

      doc
        .fillColor(textColor)
        .fontSize(8)
        .text(receipt.business.address?.street || '', { align: 'center' })
        .text(`Phone: ${receipt.business.phone}`, { align: 'center' })
        .moveDown(0.5);

      // Title
      doc
        .fontSize(12)
        .fillColor(primaryColor)
        .text('RECEIPT', { align: 'center', underline: true })
        .moveDown(0.5);

      // Receipt details
      doc
        .fontSize(8)
        .fillColor(textColor)
        .text(`Receipt No: ${receipt.receiptNumber}`)
        .text(`Date: ${new Date(receipt.date || Date.now()).toLocaleDateString()}`)
        .text(`Invoice No: ${receipt.invoice?.invoiceNumber || 'N/A'}`)
        .moveDown(0.5);

      // Customer
      doc
        .text(`Customer: ${receipt.customer.name}`)
        .moveDown(0.5);

      // Items
      const currency = receipt.currency || receipt.invoice?.currency || 'USD';
      doc.text('Items:');
      receipt.items.forEach(item => {
        doc.text(`  ${item.description} x${item.quantity} - ${currency} ${item.total.toFixed(2)}`);
      });

      doc.moveDown(0.5);

      // Summary
      doc.text(`Subtotal: ${currency} ${receipt.subtotal.toFixed(2)}`);
      doc.text(`Tax: ${currency} ${receipt.tax.amount.toFixed(2)}`);
      doc.text(`Total: ${currency} ${receipt.total.toFixed(2)}`);
      doc.moveDown(0.5);
      doc.text(`Payment Method: ${receipt.paymentMethod}`);
      doc.text(`Amount Paid: ${currency} ${receipt.amountPaid.toFixed(2)}`);
      doc.text(`Change: ${currency} ${(receipt.amountPaid - receipt.total).toFixed(2)}`);

      // Footer
      doc.moveDown(1);
      doc
        .fontSize(7)
        .fillColor(textColor)
        .text('Thank you for your purchase!', { align: 'center' })
        .text(receipt.business.name, { align: 'center' })
        .text(new Date().toLocaleString(), { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};
