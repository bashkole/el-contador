const express = require('express');
const multer = require('multer');
const { pool } = require('../db/pool');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === ',' && !inQuotes) || (c === '\r' && !inQuotes)) {
      out.push(cur.trim());
      cur = '';
    } else if (c !== '\r') {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseDate(s) {
  if (!s || typeof s !== 'string') return null;
  const t = s.trim();
  const dmy = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10) - 1;
    const y = parseInt(dmy[3], 10) < 100 ? 2000 + parseInt(dmy[3], 10) : parseInt(dmy[3], 10);
    const date = new Date(y, m, d);
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const iso = t.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  return null;
}

function parseType(s) {
  if (!s) return 'out';
  const t = String(s).trim().toLowerCase();
  if (t === 'in' || t === 'credit' || t === '+' || t === 'cr') return 'in';
  return 'out';
}

function parseAmount(s) {
  if (s === '' || s == null) return 0;
  const n = Number(String(s).replace(/,/g, '.').replace(/\s/g, ''));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function findColumnIndex(headers, names) {
  const h = headers.map((x) => x.toLowerCase().trim());
  for (const name of names) {
    const i = h.findIndex((x) => x.includes(name) || name.includes(x));
    if (i >= 0) return i;
  }
  return -1;
}

router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const text = req.file.buffer.toString('utf8');
  const lines = text.split(/\n/).filter((l) => l.trim());
  if (lines.length === 0) {
    return res.status(400).json({ error: 'CSV is empty' });
  }
  const rows = lines.map(parseCsvLine);
  let start = 0;
  let dateCol = 0;
  let typeCol = 1;
  let amountCol = 2;
  let descCol = 3;
  let refCol = 4;
  const first = rows[0].map((c) => c.toLowerCase());
  if (first.some((c) => c.includes('date') || c.includes('amount') || c === 'type' || c === 'description')) {
    const headers = rows[0];
    dateCol = findColumnIndex(headers, ['date', 'datum', 'booking']) >= 0 ? findColumnIndex(headers, ['date', 'datum', 'booking']) : 0;
    typeCol = findColumnIndex(headers, ['type', 'credit', 'debit', 'in', 'out']) >= 0 ? findColumnIndex(headers, ['type', 'credit', 'debit', 'in', 'out']) : 1;
    amountCol = findColumnIndex(headers, ['amount', 'bedrag', 'value']) >= 0 ? findColumnIndex(headers, ['amount', 'bedrag', 'value']) : 2;
    descCol = findColumnIndex(headers, ['description', 'desc', 'omschrijving', 'name', 'counter']) >= 0 ? findColumnIndex(headers, ['description', 'desc', 'omschrijving', 'name', 'counter']) : 3;
    refCol = findColumnIndex(headers, ['reference', 'ref', 'referentie']) >= 0 ? findColumnIndex(headers, ['reference', 'ref', 'referentie']) : 4;
    start = 1;
  }
  const toInsert = [];
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    const date = parseDate(row[dateCol]);
    if (!date) continue;
    let amount = parseAmount(row[amountCol]);
    const typeVal = (row[typeCol] || '').trim().toLowerCase();
    let type = parseType(row[typeCol]);
    if (typeVal !== 'in' && typeVal !== 'out' && typeVal !== 'credit' && typeVal !== 'debit' && typeVal !== '+' && typeVal !== '-' && typeVal !== 'cr' && typeVal !== 'dr') {
      if (amount < 0) {
        type = 'out';
        amount = Math.abs(amount);
      } else {
        type = 'in';
      }
    }
    const description = (row[descCol] || '').trim() || 'Imported';
    const reference = (row[refCol] || '').trim();
    toInsert.push({ date, type, amount, reference, description });
  }
  if (toInsert.length === 0) {
    return res.status(400).json({ error: 'No valid rows found. CSV should have columns: date, type, amount, description, reference (or use this order without header).' });
  }
  const client = await pool.connect();
  try {
    let inserted = 0;
    for (const row of toInsert) {
      await client.query(
        'INSERT INTO bank_transactions (date, type, amount, reference, description) VALUES ($1, $2, $3, $4, $5)',
        [row.date, row.type, row.amount, row.reference, row.description]
      );
      inserted++;
    }
    res.json({ imported: inserted });
  } finally {
    client.release();
  }
});

router.get('/', async (req, res) => {
  let r;
  try {
    r = await pool.query(
      'SELECT id, date, type, amount, reference, description, reconciled, reconciliation_ref_type, reconciliation_ref_id, reconciled_at, adjustment_amount, created_at FROM bank_transactions ORDER BY date DESC'
    );
  } catch (err) {
    if (err.code === '42703') {
      r = await pool.query(
        'SELECT id, date, type, amount, reference, description, reconciled, reconciliation_ref_type, reconciliation_ref_id, reconciled_at, created_at FROM bank_transactions ORDER BY date DESC'
      );
    } else throw err;
  }
  res.json(r.rows.map(row => ({
    id: row.id,
    date: row.date,
    type: row.type,
    amount: Number(row.amount),
    reference: row.reference,
    description: row.description,
    reconciled: row.reconciled,
    reconciliationRefType: row.reconciliation_ref_type,
    reconciliationRefId: row.reconciliation_ref_id,
    reconciledAt: row.reconciled_at,
    adjustmentAmount: row.adjustment_amount != null ? Number(row.adjustment_amount) : 0,
    createdAt: row.created_at,
  })));
});

router.post('/', async (req, res) => {
  const { date, type, amount, reference, description } = req.body || {};
  const r = await pool.query(
    `INSERT INTO bank_transactions (date, type, amount, reference, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, date, type, amount, reference, description, reconciled, reconciliation_ref_type, reconciliation_ref_id, reconciled_at, created_at`,
    [
      date,
      type === 'in' ? 'in' : 'out',
      Number(amount) || 0,
      (reference || '').trim(),
      (description || '').trim(),
    ]
  );
  const row = r.rows[0];
  res.status(201).json({
    id: row.id,
    date: row.date,
    type: row.type,
    amount: Number(row.amount),
    reference: row.reference,
    description: row.description,
    reconciled: row.reconciled,
    reconciliationRefType: row.reconciliation_ref_type,
    reconciliationRefId: row.reconciliation_ref_id,
    reconciledAt: row.reconciled_at,
    createdAt: row.created_at,
  });
});

module.exports = router;
