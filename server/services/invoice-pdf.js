const PDFDocument = require('pdfkit');
const { pool } = require('../db/pool');

function money(n) {
  return '€' + (Number(n) ?? 0).toFixed(2);
}

function lineVat(amount, rate) {
  return Math.round(amount * (Number(rate) / 100) * 100) / 100;
}

async function getInvoiceConfig() {
  const r = await pool.query('SELECT data FROM invoice_settings WHERE id = 1');
  const raw = r.rows[0]?.data || {};
  return {
    companyName: raw.companyName || 'El Contador',
    tagline: raw.tagline || '',
    address: raw.address || '',
    vatNumber: raw.vatNumber || '',
    companyNumber: raw.companyNumber || '',
    email: raw.email || '',
    footer: raw.footer || 'Thank you for your business.',
  };
}

async function getSale(id) {
  const r = await pool.query(
    'SELECT id, invoice_no, customer, customer_email, customer_address, issue_date, due_date, subtotal, vat, total, description, lines, voided FROM sales WHERE id = $1',
    [id]
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  let lines = row.lines;
  if (Array.isArray(lines)) {
    // already array
  } else if (lines && typeof lines === 'object') {
    lines = Object.values(lines);
  } else {
    lines = [];
  }
  return {
    invoiceNo: row.invoice_no,
    customer: row.customer,
    customerEmail: row.customer_email || '',
    customerAddress: row.customer_address || '',
    issueDate: row.issue_date,
    dueDate: row.due_date,
    subtotal: Number(row.subtotal),
    vat: Number(row.vat),
    total: Number(row.total),
    description: row.description,
    lines: lines.map((l) => ({
      description: l.description || '-',
      amount: Number(l.amount) || 0,
      vatRate: Number(l.vatRate) || 0,
      vatAmount: lineVat(Number(l.amount) || 0, Number(l.vatRate) || 0),
    })),
    voided: Boolean(row.voided),
  };
}

async function buildInvoicePdf(saleId, outputStream) {
  const [config, sale] = await Promise.all([getInvoiceConfig(), getSale(saleId)]);
  if (!sale) return false;

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(outputStream);

  const pageW = 595.28;
  const margin = 50;
  const rightCol = 380;
  const barH = 28;

  doc.rect(0, 0, pageW, barH).fill('black');
  doc.fillColor('white').font('Helvetica-Bold').fontSize(18);
  doc.text('INVOICE', 0, barH / 2 - 6, { width: pageW, align: 'center' });
  doc.fillColor('black').font('Helvetica');

  let y = barH + 20;
  doc.fontSize(10);
  if (config.address) {
    doc.text(config.address, rightCol, y, { width: pageW - margin - rightCol });
    y += doc.heightOfString(config.address, { width: pageW - margin - rightCol }) + 4;
  }
  if (config.vatNumber) {
    doc.text('BTW ' + config.vatNumber, rightCol, y);
    y += 14;
  }
  if (config.companyNumber) {
    doc.text('KVK ' + config.companyNumber, rightCol, y);
    y += 14;
  }
  doc.text(config.email || '', rightCol, y);
  y += 24;

  doc.font('Helvetica-Bold').text('Bill to', margin, y);
  doc.text('Invoice details', rightCol, y);
  y += 14;
  const rightColY = y;
  doc.font('Helvetica');
  doc.text(sale.customer, margin, y);
  y += 12;
  if (sale.customerAddress) {
    const addrLines = doc.splitTextToSize(sale.customerAddress, 220);
    addrLines.forEach((line) => {
      doc.text(line, margin, y);
      y += 12;
    });
  }
  if (sale.customerEmail) {
    doc.text(sale.customerEmail, margin, y);
    y += 12;
  }
  const issueStr = (sale.issueDate || '').toString().slice(0, 10);
  const dueStr = (sale.dueDate || '').toString().slice(0, 10);
  doc.text('Invoice: ' + sale.invoiceNo, rightCol, rightColY);
  doc.text('Order date: ' + issueStr, rightCol, rightColY + 12);
  doc.text('Due date: ' + dueStr, rightCol, rightColY + 24);
  y = Math.max(y, rightColY + 40) + 12;

  const col1 = margin;
  const col2 = 380;
  const col3 = 495;
  const tableW = pageW - 2 * margin;
  const rowH = 18;

  doc.rect(col1, y, tableW, rowH).fill('#333');
  doc.fillColor('white').font('Helvetica-Bold').fontSize(10);
  doc.text('Description', col1 + 6, y + 12);
  doc.text('Amount', col2 + 4, y + 12);
  doc.text('VAT', col3, y + 12);
  y += rowH;
  doc.fillColor('black').font('Helvetica');

  let netSum = 0, vatSum = 0;
  const lines = sale.lines.length ? sale.lines : [{ description: sale.description || 'Invoice items', amount: sale.subtotal, vatRate: 21, vatAmount: sale.vat }];
  lines.forEach((l) => {
    netSum += l.amount;
    vatSum += l.vatAmount;
  });
  netSum = Math.round(netSum * 100) / 100;
  vatSum = Math.round(vatSum * 100) / 100;

  doc.strokeColor('#ddd');
  lines.forEach((line) => {
    const descLines = doc.splitTextToSize(line.description, col2 - col1 - 12);
    const dataRowH = Math.max(rowH, descLines.length * 12 + 18);
    doc.rect(col1, y, tableW, dataRowH).stroke();
    doc.text(descLines, col1 + 6, y + 10);
    doc.text(money(line.amount), col2 + 4, y + dataRowH / 2 - 6);
    doc.text(money(line.vatAmount), col3, y + dataRowH / 2 - 6);
    y += dataRowH;
  });
  doc.strokeColor('black');
  y += 20;

  const sumRight = margin + tableW - 10;
  doc.text('Net amount ' + money(netSum), sumRight, y, { align: 'right' });
  y += 16;
  doc.text('VAT ' + money(vatSum), sumRight, y, { align: 'right' });
  y += 16;
  doc.font('Helvetica-Bold');
  doc.text('Total ' + money(netSum + vatSum), sumRight, y, { align: 'right' });
  y += 28;

  doc.font('Helvetica').fontSize(9).fillColor('#555');
  const footerLines = (config.footer || '').split(/\r?\n/).filter(Boolean);
  let footerY = 800;
  footerLines.forEach((line) => {
    doc.text(line, pageW / 2, footerY, { align: 'center' });
    footerY += 11;
  });

  if (sale.voided) {
    doc.fontSize(48).fillColor('#b00').font('Helvetica-Bold');
    doc.text('VOIDED', pageW / 2, 400, { align: 'center' });
  }

  doc.end();
  return true;
}

module.exports = { buildInvoicePdf };
