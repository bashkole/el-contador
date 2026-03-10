const express = require('express');
const multer = require('multer');
const { pool } = require('../db/pool');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const ASSET_ACCOUNT_CODE_MIN = 100;
const ASSET_ACCOUNT_CODE_MAX = 199;
const DEFAULT_BANK_ACCOUNT_CODE = 100;

/** Resolve account id for code 100 (default bank). Returns null if not found. */
async function getDefaultBankAccountId() {
  const r = await pool.query('SELECT id FROM accounts WHERE code = $1 AND active = true', [DEFAULT_BANK_ACCOUNT_CODE]);
  return r.rows.length ? r.rows[0].id : null;
}

/** Validate that accountId is an active asset account (code 100-199). Returns { valid, id } or { valid: false, error }. */
async function validateAssetAccountId(accountId) {
  if (!accountId) return { valid: false, error: 'accountId required' };
  const r = await pool.query(
    'SELECT a.id, a.code FROM accounts a JOIN account_groups ag ON ag.id = a.account_group_id WHERE a.id = $1 AND a.active = true AND ag.code_min = $2 AND ag.code_max = $3',
    [accountId, ASSET_ACCOUNT_CODE_MIN, ASSET_ACCOUNT_CODE_MAX]
  );
  if (r.rows.length === 0) {
    return { valid: false, error: 'Account not found or not an asset account (code 100-199)' };
  }
  return { valid: true, id: r.rows[0].id };
}

/** Resolve account_id for bank: use provided accountId if valid, else default to code 100. */
async function resolveBankAccountId(accountId) {
  if (accountId) {
    const v = await validateAssetAccountId(accountId);
    if (!v.valid) return { error: v.error };
    return { accountId: v.id };
  }
  const defaultId = await getDefaultBankAccountId();
  if (!defaultId) return { error: 'Default bank account (code 100) not found' };
  return { accountId: defaultId };
}

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
  const yyyymmdd = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmdd) return yyyymmdd[1] + '-' + yyyymmdd[2] + '-' + yyyymmdd[3];
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

/** Extract /REMI/ value from SEPA-style description (up to next /KEY/ or end). */
function extractRemi(description) {
  if (!description || typeof description !== 'string') return '';
  const match = description.match(/\/REMI\/(.*?)(?=\/(?:EREF|IBAN|BIC|NAME|TRTP|CSID|MARF)\/|$)/s);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

/** Parse description: use REMI as primary label when present; otherwise full description. */
function normalizeDescriptionAndReference(rawDescription, explicitReference) {
  const remi = extractRemi(rawDescription);
  const reference = (explicitReference && String(explicitReference).trim()) || remi;
  const description = remi || (rawDescription && rawDescription.trim()) || 'Imported';
  return { description, reference };
}

/** Parse CSV text into normalized rows for import. Returns { rows } or { error }. */
function parseCsvToRows(text) {
  const lines = text.split(/\n/).filter((l) => l.trim());
  if (lines.length === 0) return { error: 'CSV is empty' };
  const rows = lines.map(parseCsvLine);
  let start = 0;
  let dateCol = 0;
  let typeCol = 1;
  let amountCol = 2;
  let descCol = 3;
  let refCol = 4;
  const first = rows[0].map((c) => c.toLowerCase());
  if (first.some((c) => c.includes('date') || c.includes('amount') || c === 'type' || c === 'description') ||
      first.some((c) => c.includes('transactiondate') || c.includes('valuedate') || c.includes('bedrag'))) {
    const headers = rows[0];
    dateCol = findColumnIndex(headers, ['transactiondate', 'valuedate', 'date', 'datum', 'booking']);
    if (dateCol < 0) dateCol = 0;
    typeCol = findColumnIndex(headers, ['type', 'credit', 'debit', 'in', 'out']);
    if (typeCol < 0) typeCol = -1;
    amountCol = findColumnIndex(headers, ['amount', 'bedrag', 'value']);
    if (amountCol < 0) amountCol = 2;
    descCol = findColumnIndex(headers, ['description', 'desc', 'omschrijving', 'name', 'counterparty']);
    if (descCol < 0) descCol = 3;
    refCol = findColumnIndex(headers, ['reference', 'ref', 'referentie']);
    if (refCol < 0) refCol = -1;
    start = 1;
  }
  const toInsert = [];
  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    const date = parseDate(row[dateCol]);
    if (!date) continue;
    let amount = parseAmount(row[amountCol] != null ? row[amountCol] : row[2]);
    const typeVal = typeCol >= 0 ? (row[typeCol] || '').trim().toLowerCase() : '';
    let type = typeCol >= 0 ? parseType(row[typeCol]) : (amount < 0 ? 'out' : 'in');
    if (typeVal !== 'in' && typeVal !== 'out' && typeVal !== 'credit' && typeVal !== 'debit' && typeVal !== '+' && typeVal !== '-' && typeVal !== 'cr' && typeVal !== 'dr') {
      if (amount < 0) {
        type = 'out';
        amount = Math.abs(amount);
      } else {
        type = 'in';
      }
    }
    const rawDescription = (row[descCol] != null ? row[descCol] : row[3] != null ? row[3] : '') || '';
    const explicitRef = refCol >= 0 ? (row[refCol] || '').trim() : '';
    const { description, reference } = normalizeDescriptionAndReference(rawDescription, explicitRef);
    toInsert.push({ date, type, amount, reference, description });
  }
  if (toInsert.length === 0) {
    return { error: 'No valid rows found. CSV should have columns: date, type, amount, description, reference (or use this order without header).' };
  }
  return { rows: toInsert };
}

router.post('/import/preview', upload.single('file'), (req, res) => {
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const text = req.file.buffer.toString('utf8');
  const result = parseCsvToRows(text);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.json({ preview: result.rows });
});

router.post('/import/confirm', async (req, res) => {
  const rows = req.body && req.body.rows;
  const accountId = req.body && req.body.accountId;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No rows to import. Send { rows: [{ date, type, amount, description, reference }, ...] }.' });
  }
  const resolved = await resolveBankAccountId(accountId || null);
  if (resolved.error) {
    return res.status(400).json({ error: resolved.error });
  }
  const client = await pool.connect();
  try {
    let inserted = 0;
    for (const row of rows) {
      const date = row.date && String(row.date).trim();
      const type = row.type === 'in' ? 'in' : 'out';
      const amount = Math.round((Number(row.amount) || 0) * 100) / 100;
      const description = (row.description != null ? String(row.description) : '').trim() || 'Imported';
      const reference = (row.reference != null ? String(row.reference) : '').trim();
      if (!date) continue;
      await client.query(
        'INSERT INTO bank_transactions (date, type, amount, reference, description, account_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [date, type, amount, reference, description, resolved.accountId]
      );
      inserted++;
    }
    res.json({ imported: inserted });
  } finally {
    client.release();
  }
});

function mapBankRow(row) {
  const out = {
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
    accountType: row.account_type ?? null,
    accountNote: row.account_note ?? null,
    createdAt: row.created_at,
  };
  if (row.account_id != null) {
    out.accountId = row.account_id;
    out.accountCode = row.account_code != null ? Number(row.account_code) : null;
    out.accountName = row.account_name ?? null;
  }
  return out;
}

router.get('/', async (req, res) => {
  let r;
  try {
    r = await pool.query(
      `SELECT bt.id, bt.date, bt.type, bt.amount, bt.reference, bt.description, bt.reconciled, bt.reconciliation_ref_type, bt.reconciliation_ref_id, bt.reconciled_at, bt.adjustment_amount, bt.account_type, bt.account_note, bt.created_at,
              bt.account_id, a.code AS account_code, a.name AS account_name
       FROM bank_transactions bt
       LEFT JOIN accounts a ON a.id = bt.account_id
       ORDER BY bt.date DESC`
    );
  } catch (err) {
    if (err.code === '42703') {
      r = await pool.query(
        'SELECT id, date, type, amount, reference, description, reconciled, reconciliation_ref_type, reconciliation_ref_id, reconciled_at, adjustment_amount, account_type, account_note, created_at FROM bank_transactions ORDER BY date DESC'
      );
    } else throw err;
  }
  res.json(r.rows.map(mapBankRow));
});

router.post('/', async (req, res) => {
  const { date, type, amount, reference, description, accountId } = req.body || {};
  const resolved = await resolveBankAccountId(accountId || null);
  if (resolved.error) {
    return res.status(400).json({ error: resolved.error });
  }
  const r = await pool.query(
    `INSERT INTO bank_transactions (date, type, amount, reference, description, account_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, date, type, amount, reference, description, reconciled, reconciliation_ref_type, reconciliation_ref_id, reconciled_at, account_id, created_at`,
    [
      date,
      type === 'in' ? 'in' : 'out',
      Math.round((Number(amount) || 0) * 100) / 100,
      (reference || '').trim(),
      (description || '').trim(),
      resolved.accountId,
    ]
  );
  const row = r.rows[0];
  const acc = row.account_id ? (await pool.query('SELECT code, name FROM accounts WHERE id = $1', [row.account_id])).rows[0] : null;
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
    accountId: row.account_id,
    accountCode: acc ? Number(acc.code) : null,
    accountName: acc ? acc.name : null,
    createdAt: row.created_at,
  });
});

/** Update a bank transaction (date, type, amount, reference, description, accountId). */
router.patch('/:id', async (req, res) => {
  const id = req.params.id;
  const { date, type, amount, reference, description, accountId } = req.body || {};
  const r = await pool.query('SELECT id FROM bank_transactions WHERE id = $1', [id]);
  if (r.rows.length === 0) {
    return res.status(404).json({ error: 'Bank transaction not found' });
  }
  const updates = [];
  const values = [];
  let pos = 1;
  if (date != null) {
    updates.push(`date = $${pos++}`);
    values.push(String(date).trim().slice(0, 10));
  }
  if (type != null) {
    updates.push(`type = $${pos++}`);
    values.push(type === 'in' ? 'in' : 'out');
  }
  if (amount != null) {
    updates.push(`amount = $${pos++}`);
    values.push(Math.round((Number(amount) || 0) * 100) / 100);
  }
  if (reference !== undefined) {
    updates.push(`reference = $${pos++}`);
    values.push((reference || '').trim());
  }
  if (description !== undefined) {
    updates.push(`description = $${pos++}`);
    values.push((description || '').trim());
  }
  if (accountId !== undefined) {
    const v = await validateAssetAccountId(accountId);
    if (!v.valid) {
      return res.status(400).json({ error: v.error });
    }
    updates.push(`account_id = $${pos++}`);
    values.push(v.id);
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  values.push(id);
  await pool.query(
    `UPDATE bank_transactions SET ${updates.join(', ')} WHERE id = $${pos}`,
    values
  );
  const out = await pool.query(
    `SELECT bt.id, bt.date, bt.type, bt.amount, bt.reference, bt.description, bt.reconciled, bt.reconciliation_ref_type, bt.reconciliation_ref_id, bt.reconciled_at, bt.adjustment_amount, bt.account_type, bt.account_note, bt.created_at, bt.account_id, a.code AS account_code, a.name AS account_name
     FROM bank_transactions bt LEFT JOIN accounts a ON a.id = bt.account_id WHERE bt.id = $1`,
    [id]
  );
  const row = out.rows[0];
  if (!row) return res.status(404).json({ error: 'Bank transaction not found' });
  res.json(mapBankRow(row));
});

/** Delete a bank transaction (e.g. to remove duplicated import). Only allowed for unpaired lines. */
router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  const r = await pool.query(
    'SELECT id, reconciled FROM bank_transactions WHERE id = $1',
    [id]
  );
  if (r.rows.length === 0) {
    return res.status(404).json({ error: 'Bank transaction not found' });
  }
  if (r.rows[0].reconciled) {
    return res.status(400).json({ error: 'Cannot delete a paired transaction. Unmatch it first.' });
  }
  await pool.query('DELETE FROM bank_transactions WHERE id = $1', [id]);
  res.json({ ok: true });
});

module.exports = router;
