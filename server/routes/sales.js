const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../db/pool');

const uploadDir = path.join(__dirname, '..', 'uploads', 'invoices');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const router = express.Router();

function lineVat(amount, rate) {
  return Math.round(amount * (Number(rate) / 100) * 100) / 100;
}

function mapRow(row) {
  return {
    id: row.id,
    invoiceNo: row.invoice_no,
    customer: row.customer,
    customerEmail: row.customer_email || '',
    customerAddress: row.customer_address || '',
    customerId: row.customer_id || null,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    subtotal: Number(row.subtotal),
    vat: Number(row.vat),
    total: Number(row.total),
    description: row.description,
    lines: Array.isArray(row.lines) ? row.lines : [],
    voided: Boolean(row.voided),
    voidedAt: row.voided_at || null,
    reconciled: row.reconciled,
    reconciledAt: row.reconciled_at,
    fileName: row.file_name,
    createdAt: row.created_at,
  };
}

router.get('/', async (req, res) => {
  const r = await pool.query(
    'SELECT id, invoice_no, customer, customer_email, customer_address, customer_id, issue_date, due_date, subtotal, vat, total, description, lines, voided, voided_at, reconciled, reconciled_at, file_name, created_at FROM sales ORDER BY issue_date DESC'
  );
  res.json(r.rows.map(mapRow));
});

router.post('/', upload.single('file'), async (req, res) => {
  const { invoiceNo, customer, customerEmail, customerAddress, customerId, issueDate, dueDate, lines: linesRaw } = req.body || {};
  const file = req.file;

  // FormData sends all fields as strings; parse lines if it's JSON
  let lines = linesRaw;
  if (typeof lines === 'string' && lines.trim()) {
    try {
      lines = JSON.parse(lines);
    } catch (_) {
      lines = [];
    }
  }

  let subtotal = 0;
  let vat = 0;
  const normalizedLines = Array.isArray(lines) && lines.length > 0
    ? lines.map((l) => {
        const amount = Number(l.amount) || 0;
        const rate = Number(l.vatRate) || 0;
        const lineVatAmount = lineVat(amount, rate);
        subtotal += amount;
        vat += lineVatAmount;
        return { description: String(l.description || '').trim() || '-', amount, vatRate: rate };
      })
    : [];
  if (normalizedLines.length === 0) {
    return res.status(400).json({ error: 'At least one line (description, amount, vat rate) required' });
  }
  const total = Math.round((subtotal + vat) * 100) / 100;
  subtotal = Math.round(subtotal * 100) / 100;
  vat = Math.round(vat * 100) / 100;

  // Validate customerId if provided
  let validCustomerId = null;
  if (customerId) {
    const customerCheck = await pool.query('SELECT id FROM customers WHERE id = $1', [customerId]);
    if (customerCheck.rows.length > 0) {
      validCustomerId = customerId;
    }
  }

  try {
    const r = await pool.query(
      `INSERT INTO sales (invoice_no, customer, customer_email, customer_address, customer_id, issue_date, due_date, subtotal, vat, total, description, lines, file_name, file_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)
       RETURNING id, invoice_no, customer, customer_email, customer_address, customer_id, issue_date, due_date, subtotal, vat, total, description, lines, voided, voided_at, reconciled, reconciled_at, file_name, created_at`,
      [
        (invoiceNo || '').trim(),
        (customer || '').trim(),
        (customerEmail || '').trim() || null,
        (customerAddress || '').trim() || null,
        validCustomerId,
        issueDate,
        dueDate,
        subtotal,
        vat,
        total,
        normalizedLines.map((l) => l.description).join('; ') || '',
        JSON.stringify(normalizedLines),
        file ? file.originalname : null,
        file ? file.filename : null,
      ]
    );
    const row = r.rows[0];
    res.status(201).json(mapRow(row));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Invoice number already in use' });
    }
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const id = req.params.id;
  let { invoiceNo, customer, customerEmail, customerAddress, customerId, issueDate, dueDate, voided, lines: linesRaw } = req.body || {};
  const updates = [];
  const values = [];
  let pos = 1;

  // Parse lines if provided (may be JSON string from client)
  let lines = linesRaw;
  if (typeof lines === 'string' && lines.trim()) {
    try {
      lines = JSON.parse(lines);
    } catch (_) {
      lines = [];
    }
  }
  if (Array.isArray(lines) && lines.length > 0) {
    let subtotal = 0;
    let vat = 0;
    const normalizedLines = lines.map((l) => {
      const amount = Number(l.amount) || 0;
      const rate = Number(l.vatRate) || 0;
      const lineVatAmount = lineVat(amount, rate);
      subtotal += amount;
      vat += lineVatAmount;
      return { description: String(l.description || '').trim() || '-', amount, vatRate: rate };
    });
    const total = Math.round((subtotal + vat) * 100) / 100;
    subtotal = Math.round(subtotal * 100) / 100;
    vat = Math.round(vat * 100) / 100;
    const description = normalizedLines.map((l) => l.description).join('; ') || '';
    updates.push(`subtotal = $${pos++}`);
    values.push(subtotal);
    updates.push(`vat = $${pos++}`);
    values.push(vat);
    updates.push(`total = $${pos++}`);
    values.push(total);
    updates.push(`description = $${pos++}`);
    values.push(description);
    updates.push(`lines = $${pos++}::jsonb`);
    values.push(JSON.stringify(normalizedLines));
  }

  if (invoiceNo !== undefined) {
    updates.push(`invoice_no = $${pos++}`);
    values.push((invoiceNo || '').trim());
  }
  if (customer !== undefined) {
    updates.push(`customer = $${pos++}`);
    values.push((customer || '').trim());
  }
  if (customerEmail !== undefined) {
    updates.push(`customer_email = $${pos++}`);
    values.push((customerEmail || '').trim() || null);
  }
  if (customerAddress !== undefined) {
    updates.push(`customer_address = $${pos++}`);
    values.push((customerAddress || '').trim() || null);
  }
  if (customerId !== undefined) {
    if (customerId) {
      const customerCheck = await pool.query('SELECT id FROM customers WHERE id = $1', [customerId]);
      if (customerCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Customer not found' });
      }
    }
    updates.push(`customer_id = $${pos++}`);
    values.push(customerId || null);
  }
  if (issueDate !== undefined) {
    updates.push(`issue_date = $${pos++}`);
    values.push(issueDate);
  }
  if (dueDate !== undefined) {
    updates.push(`due_date = $${pos++}`);
    values.push(dueDate);
  }
  if (voided !== undefined) {
    updates.push(`voided = $${pos++}`);
    values.push(Boolean(voided));
    updates.push(`voided_at = $${pos++}`);
    values.push(voided ? new Date() : null);
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  values.push(id);
  try {
    const r = await pool.query(
      `UPDATE sales SET ${updates.join(', ')} WHERE id = $${pos} RETURNING id, invoice_no, customer, customer_email, customer_address, customer_id, issue_date, due_date, subtotal, vat, total, description, lines, voided, voided_at, reconciled, reconciled_at, created_at`,
      values
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    res.json(mapRow(r.rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Invoice number already in use' });
    }
    throw err;
  }
});

router.get('/:id/file', async (req, res) => {
  const r = await pool.query('SELECT file_path, file_name FROM sales WHERE id = $1', [req.params.id]);
  if (r.rows.length === 0 || !r.rows[0].file_path) {
    return res.status(404).end();
  }
  const filePath = path.join(uploadDir, r.rows[0].file_path);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const disposition = req.query.preview === '1' ? 'inline' : 'attachment';
  res.sendFile(path.resolve(filePath), {
    headers: { 'Content-Disposition': `${disposition}; filename="${r.rows[0].file_name || 'file'}"` }
  });
});

// Get file info and mime type for preview
router.get('/:id/file-info', async (req, res) => {
  const r = await pool.query('SELECT file_path, file_name FROM sales WHERE id = $1', [req.params.id]);
  if (r.rows.length === 0 || !r.rows[0].file_path) {
    return res.status(404).json({ error: 'File not found' });
  }
  const filePath = path.join(uploadDir, r.rows[0].file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  const ext = path.extname(r.rows[0].file_name || '').toLowerCase();
  let mimeType = 'application/octet-stream';
  if (ext === '.pdf') mimeType = 'application/pdf';
  else if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
  else if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.webp') mimeType = 'image/webp';
  else if (ext === '.gif') mimeType = 'image/gif';

  res.json({
    fileName: r.rows[0].file_name,
    mimeType,
    url: `/api/sales/${req.params.id}/file?preview=1`,
  });
});

module.exports = router;
