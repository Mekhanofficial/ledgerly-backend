const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const templates = require('../data/templates');

const DEFAULT_INVOICE_COLORS = {
  primary: [37, 99, 235],
  secondary: [59, 130, 246],
  accent: [239, 246, 255],
  text: [30, 41, 59],
  border: [203, 213, 225]
};

const DEFAULT_RECEIPT_COLORS = {
  primary: [41, 128, 185],
  secondary: [52, 152, 219],
  accent: [236, 240, 241],
  text: [44, 62, 80]
};

const PDF_FONT_MAP = {
  helvetica: 'Helvetica',
  'helvetica-bold': 'Helvetica-Bold',
  'helvetica-oblique': 'Helvetica-Oblique',
  'helvetica-light': 'Helvetica',
  times: 'Times-Roman',
  'times-bold': 'Times-Bold',
  courier: 'Courier',
  roboto: 'Helvetica',
  georgia: 'Times-Roman',
  garamond: 'Times-Roman'
};

const normalizeTemplateId = (value) => String(value || '').trim().toLowerCase();

const TEMPLATE_STYLE_ALIASES = {
  modern: 'modernCorporate',
  clean: 'cleanBilling',
  retail: 'retailReceipt',
  elegant: 'simpleElegant',
  urban: 'urbanEdge',
  creative: 'creativeFlow',
  professionalclassic: 'professionalClassic',
  moderncorporate: 'modernCorporate',
  cleanbilling: 'cleanBilling',
  retailreceipt: 'retailReceipt',
  simpleelegant: 'simpleElegant',
  urbanedge: 'urbanEdge',
  creativeflow: 'creativeFlow',
  neobrutalist: 'neoBrutalist',
  minimaldark: 'minimalistDark',
  minimalistdark: 'minimalistDark',
  organiceco: 'organicEco',
  corporatepro: 'corporatePro',
  creativestudio: 'creativeStudio',
  techmodern: 'techModern'
};

const normalizeTemplateLookupValue = (value) => {
  const normalized = normalizeTemplateId(value);
  if (!normalized) return '';
  const aliased = TEMPLATE_STYLE_ALIASES[normalized] || normalized;
  return normalizeTemplateId(aliased);
};

const normalizeColor = (value, fallback) => {
  if (Array.isArray(value) && value.length === 3) {
    return value;
  }
  return fallback;
};

const resolveTemplateRecord = (value, fallback = 'standard') => {
  const normalized = normalizeTemplateLookupValue(value);
  if (normalized) {
    const found = templates.find((template) => {
      const id = normalizeTemplateId(template.id);
      const style = normalizeTemplateId(template.templateStyle);
      return id === normalized || style === normalized;
    });
    if (found) return found;
  }
  return (
    templates.find((template) => normalizeTemplateId(template.id) === normalizeTemplateLookupValue(fallback)) ||
    templates[0] ||
    {}
  );
};

const resolvePdfFont = (value, fallback = 'Helvetica') => {
  const normalized = normalizeTemplateId(value);
  if (!normalized) return fallback;
  return PDF_FONT_MAP[normalized] || fallback;
};

const toDateLabel = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
};

const normalizeNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const truncateText = (value, maxLength) => {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
};

const resolveInvoiceTemplate = (invoice, overrideTemplateStyle) => {
  const templateId =
    overrideTemplateStyle ||
    invoice?.templateStyle ||
    invoice?.templateId ||
    invoice?.template;
  return resolveTemplateRecord(templateId, 'standard');
};

const resolveReceiptTemplate = (receipt) => {
  const templateId = receipt?.templateStyle || receipt?.templateId || receipt?.template;
  return resolveTemplateRecord(templateId, 'standard');
};

// Generate invoice PDF
exports.invoice = async (invoice, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];
      const template = resolveInvoiceTemplate(
        invoice,
        options.templateStyle || options.templateId || options.template
      );
      const colors = template.colors || {};
      const layout = template.layout || {};
      const fonts = template.fonts || {};
      const primaryColor = normalizeColor(colors.primary, DEFAULT_INVOICE_COLORS.primary);
      const secondaryColor = normalizeColor(colors.secondary, DEFAULT_INVOICE_COLORS.secondary);
      const accentColor = normalizeColor(colors.accent, DEFAULT_INVOICE_COLORS.accent);
      const textColor = normalizeColor(colors.text, DEFAULT_INVOICE_COLORS.text);
      const borderColor = normalizeColor(colors.border, DEFAULT_INVOICE_COLORS.border);
      const titleFont = resolvePdfFont(fonts.title, 'Helvetica-Bold');
      const bodyFont = resolvePdfFont(fonts.body, 'Helvetica');
      const accentFont = resolvePdfFont(fonts.accent, 'Helvetica-Bold');
      const business = typeof invoice.business === 'object' ? invoice.business : {};
      const customer = typeof invoice.customer === 'object' ? invoice.customer : {};
      const currency = invoice.currency || 'USD';
      const leftX = 50;
      const rightX = 500;
      
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      if (layout.showWatermark) {
        const watermarkText = String(layout.watermarkText || template.name || 'INVOICE').toUpperCase();
        doc.save();
        doc.opacity(0.06);
        doc.fillColor(secondaryColor).font(titleFont).fontSize(68);
        doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
        doc.text(watermarkText, -80, doc.page.height / 2 - 30, {
          width: doc.page.width + 160,
          align: 'center',
        });
        doc.restore();
        doc.opacity(1);
      }

      // Header
      if (layout.showHeaderBorder) {
        doc.rect(0, 0, doc.page.width, 72).fill(primaryColor);
        doc
          .fillColor([255, 255, 255])
          .font(titleFont)
          .fontSize(20)
          .text(business.name || '', 0, 18, { align: 'center', width: doc.page.width });
        doc
          .font(bodyFont)
          .fontSize(9)
          .text(
            `${business.address?.street || ''} ${business.address?.city || ''}`.trim(),
            0,
            44,
            { align: 'center', width: doc.page.width }
          );
        doc.y = 88;
      } else {
        doc
          .fillColor(primaryColor)
          .font(titleFont)
          .fontSize(20)
          .text(business.name || '', { align: 'center' })
          .moveDown(0.3);
      }
      
      doc
        .fillColor(textColor)
        .font(bodyFont)
        .fontSize(10)
        .text(business.address?.street || '', { align: 'center' })
        .text(
          `${business.address?.city || ''}, ${business.address?.state || ''} ${business.address?.postalCode || ''}`.trim(),
          { align: 'center' }
        )
        .text(`Phone: ${business.phone || ''} | Email: ${business.email || ''}`, { align: 'center' })
        .moveDown(1);

      // Invoice title
      doc
        .fillColor(primaryColor)
        .font(accentFont)
        .fontSize(16)
        .text('INVOICE', { align: 'center', underline: true })
        .moveDown(1);

      doc
        .strokeColor(secondaryColor)
        .lineWidth(1)
        .moveTo(leftX, doc.y - 6)
        .lineTo(rightX, doc.y - 6)
        .stroke();
      doc.moveDown(0.4);

      // Invoice details
      const invoiceDetailsTop = doc.y;
      
      doc
        .fillColor(textColor)
        .font(accentFont)
        .fontSize(10)
        .text('Invoice Number:', 50, invoiceDetailsTop)
        .font(bodyFont)
        .text(invoice.invoiceNumber || '', 150, invoiceDetailsTop)
        .font(accentFont)
        .text('Invoice Date:', 50, invoiceDetailsTop + 15)
        .font(bodyFont)
        .text(toDateLabel(invoice.date), 150, invoiceDetailsTop + 15)
        .font(accentFont)
        .text('Due Date:', 50, invoiceDetailsTop + 30)
        .font(bodyFont)
        .text(toDateLabel(invoice.dueDate), 150, invoiceDetailsTop + 30)
        .font(accentFont)
        .text('Status:', 50, invoiceDetailsTop + 45)
        .font(bodyFont)
        .text(String(invoice.status || '').toUpperCase(), 150, invoiceDetailsTop + 45);

      // Customer details
      const customerDetailsTop = invoiceDetailsTop;
      
      doc
        .font(accentFont)
        .text('Bill To:', 350, customerDetailsTop)
        .font(bodyFont)
        .fontSize(9)
        .text(customer.name || '', 350, customerDetailsTop + 15);
      
      if (customer.company) {
        doc.text(customer.company, 350, customerDetailsTop + 30);
      }
      
      if (customer.address?.street) {
        doc.text(customer.address.street, 350, customerDetailsTop + 45);
        doc.text(
          `${customer.address.city || ''}, ${customer.address.state || ''} ${customer.address.postalCode || ''}`.trim(),
          350,
          customerDetailsTop + 60
        );
      }
      
      if (customer.email) {
        doc.text(`Email: ${customer.email}`, 350, customerDetailsTop + 75);
      }
      
      if (customer.phone) {
        doc.text(`Phone: ${customer.phone}`, 350, customerDetailsTop + 90);
      }

      doc.moveDown(8);

      // Items table
      const tableTop = doc.y;
      const itemHeaderY = tableTop;
      
      // Table headers
      doc.rect(leftX, itemHeaderY - 2, rightX - leftX, 18).fill(primaryColor);
      doc
        .fillColor([255, 255, 255])
        .font(accentFont)
        .fontSize(9)
        .text('#', 50, itemHeaderY + 3)
        .text('Description', 70, itemHeaderY + 3)
        .text('Qty', 300, itemHeaderY + 3)
        .text('Unit Price', 340, itemHeaderY + 3)
        .text('Amount', 400, itemHeaderY + 3, { width: 90, align: 'right' });
      
      // Horizontal line
      doc
        .strokeColor(borderColor)
        .moveTo(50, itemHeaderY + 16)
        .lineTo(500, itemHeaderY + 16)
        .stroke();

      // Table rows
      let y = itemHeaderY + 25;
      (invoice.items || []).forEach((item, index) => {
        const rowAmount = normalizeNumber(item.total, normalizeNumber(item.unitPrice) * normalizeNumber(item.quantity));
        const rowHeight = 20;
        if (index % 2 === 0) {
          doc.rect(leftX, y - 2, rightX - leftX, rowHeight).fill(accentColor);
        }

        doc
          .fillColor(textColor)
          .font(bodyFont)
          .fontSize(9)
          .text((index + 1).toString(), 50, y + 2)
          .text(truncateText(item.description, 52), 70, y + 2, { width: 220 })
          .text(String(normalizeNumber(item.quantity)), 300, y + 2)
          .text(`${currency} ${normalizeNumber(item.unitPrice).toFixed(2)}`, 340, y + 2)
          .text(`${currency} ${rowAmount.toFixed(2)}`, 400, y + 2, { width: 90, align: 'right' });
        
        y += rowHeight;
        
        // Check for page break
        if (y > 700) {
          doc.addPage();
          if (layout.showWatermark) {
            const watermarkText = String(layout.watermarkText || template.name || 'INVOICE').toUpperCase();
            doc.save();
            doc.opacity(0.06);
            doc.fillColor(secondaryColor).font(titleFont).fontSize(68);
            doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
            doc.text(watermarkText, -80, doc.page.height / 2 - 30, {
              width: doc.page.width + 160,
              align: 'center',
            });
            doc.restore();
            doc.opacity(1);
          }
          y = 50;
        }
      });

      // Summary
      const summaryY = Math.max(y + 20, 550);
      const taxRateUsed = normalizeNumber(invoice.taxRateUsed, normalizeNumber(invoice.tax?.percentage));
      const taxAmount = normalizeNumber(invoice.taxAmount, normalizeNumber(invoice.tax?.amount));
      const taxLabel = invoice.taxName || invoice.tax?.description || 'Tax';

      const summaryLines = [
        { label: 'Subtotal', value: normalizeNumber(invoice.subtotal) },
        { label: 'Discount', value: normalizeNumber(invoice.discount?.amount), skipWhenZero: true }
      ];

      if (taxAmount > 0 || taxRateUsed > 0) {
        summaryLines.push({
          label: `${taxLabel} (${taxRateUsed}%)`,
          value: taxAmount
        });
      }

      doc.rect(340, summaryY - 8, 170, Math.max(summaryLines.length * 15 + 58, 70)).fillAndStroke(accentColor, borderColor);
      doc.font(bodyFont).fillColor(textColor).fontSize(10);
      summaryLines.forEach((line, index) => {
        if (line.skipWhenZero && !line.value) {
          return;
        }
        const offset = index * 15;
        doc
          .text(`${line.label}:`, 350, summaryY + offset)
          .text(`${currency} ${normalizeNumber(line.value).toFixed(2)}`, 450, summaryY + offset, { width: 90, align: 'right' });
      });

      const lineOffset = summaryLines.filter(line => !(line.skipWhenZero && !line.value)).length * 15;
      const dividerY = summaryY + lineOffset;

      // Horizontal line
      doc.strokeColor(secondaryColor).moveTo(350, dividerY).lineTo(500, dividerY).stroke();

      doc
        .fontSize(12)
        .font(accentFont)
        .fillColor(primaryColor)
        .text('Total:', 350, dividerY + 10)
        .text(`${currency} ${normalizeNumber(invoice.total).toFixed(2)}`, 450, dividerY + 10, { width: 90, align: 'right' })
        .font(bodyFont)
        .fillColor(textColor);

      // Amount paid and balance
      const totalsFooterY = dividerY + 35;
      doc
        .fontSize(10)
        .font(bodyFont)
        .text('Amount Paid:', 350, totalsFooterY)
        .text(`${currency} ${normalizeNumber(invoice.amountPaid).toFixed(2)}`, 450, totalsFooterY, { width: 90, align: 'right' })
        .text('Balance Due:', 350, totalsFooterY + 15)
        .text(`${currency} ${normalizeNumber(invoice.balance).toFixed(2)}`, 450, totalsFooterY + 15, { width: 90, align: 'right' });

      // Notes and terms
      if (invoice.notes || invoice.terms) {
        doc.moveDown(3);
        
        if (invoice.notes) {
          doc
            .font(accentFont)
            .fontSize(9)
            .fillColor(primaryColor)
            .text('Notes:', 50, doc.y)
            .font(bodyFont)
            .fillColor(textColor)
            .text(invoice.notes, 50, doc.y + 15, { width: 500 });
        }
        
        if (invoice.terms) {
          doc.moveDown(1);
          doc
            .font(accentFont)
            .fontSize(9)
            .fillColor(primaryColor)
            .text('Terms & Conditions:', 50, doc.y)
            .font(bodyFont)
            .fillColor(textColor)
            .text(invoice.terms, 50, doc.y + 15, { width: 500 });
        }
      }

      // Footer
      if (layout.showFooter !== false) {
        doc
          .fontSize(8)
          .font(bodyFont)
          .fillColor(secondaryColor)
          .text('Thank you for your business!', { align: 'center' })
          .fillColor(textColor)
          .text(business.name || '', { align: 'center' });
      }

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
      const taxRateUsed = typeof receipt.taxRateUsed === 'number'
        ? receipt.taxRateUsed
        : (receipt.tax?.percentage || 0);
      const taxAmount = typeof receipt.taxAmount === 'number'
        ? receipt.taxAmount
        : (receipt.tax?.amount || 0);
      const taxLabel = receipt.taxName || receipt.tax?.description || 'Tax';

      doc.text(`Subtotal: ${currency} ${receipt.subtotal.toFixed(2)}`);
      if (taxAmount > 0 || taxRateUsed > 0) {
        doc.text(`${taxLabel} (${taxRateUsed}%): ${currency} ${taxAmount.toFixed(2)}`);
      }
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
