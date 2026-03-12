const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

/** Return whether account is asset (true) or liability/equity (false) by group code range */
async function isAssetAccount(accountId) {
  const r = await pool.query(
    `SELECT ag.code_min FROM accounts a
     JOIN account_groups ag ON ag.id = a.account_group_id
     WHERE a.id = $1`,
    [accountId]
  );
  if (r.rows.length === 0) return null;
  const codeMin = Number(r.rows[0].code_min);
  return codeMin >= 100 && codeMin < 200;
}

/**
 * POST /journal/manual - create a manual journal entry (pay to / pay from account).
 * Body: { accountId, counterAccountId, amount, date, description?, direction: 'pay_to' | 'pay_from' }
 */
router.post('/manual', async (req, res) => {
  const { accountId, counterAccountId, amount, date, description, direction } = req.body || {};
  if (!accountId || !counterAccountId || amount == null || !date || !['pay_to', 'pay_from'].includes(direction)) {
    return res.status(400).json({
      error: 'accountId, counterAccountId, amount, date and direction (pay_to|pay_from) are required',
    });
  }
  if (accountId === counterAccountId) {
    return res.status(400).json({ error: 'Account and counter account must be different' });
  }
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (amt <= 0) {
    return res.status(400).json({ error: 'Amount must be positive' });
  }
  const entryDate = date; // YYYY-MM-DD
  const desc = (description && String(description).trim()) || 'Manual entry';

  const accCheck = await pool.query(
    'SELECT id FROM accounts WHERE id IN ($1, $2) AND active = true',
    [accountId, counterAccountId]
  );
  if (accCheck.rows.length !== 2) {
    return res.status(400).json({ error: 'One or both accounts not found or inactive' });
  }

  const thisAsset = await isAssetAccount(accountId);
  const counterAsset = await isAssetAccount(counterAccountId);
  if (thisAsset === null || counterAsset === null) {
    return res.status(400).json({ error: 'Account group could not be determined' });
  }

  let accountDebit = 0;
  let accountCredit = 0;
  let counterDebit = 0;
  let counterCredit = 0;
  if (direction === 'pay_to') {
    if (thisAsset) {
      accountDebit = amt;
      counterCredit = amt;
    } else {
      accountCredit = amt;
      counterDebit = amt;
    }
  } else {
    if (thisAsset) {
      accountCredit = amt;
      counterDebit = amt;
    } else {
      accountDebit = amt;
      counterCredit = amt;
    }
  }

  const client = await pool.connect();
  try {
    const je = await client.query(
      `INSERT INTO journal_entries (date, description, source_ref_type, source_ref_id)
       VALUES ($1, $2, 'manual', NULL)
       RETURNING id`,
      [entryDate, desc.slice(0, 500)]
    );
    const entryId = je.rows[0].id;
    await client.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
       VALUES ($1, $2, $3, $4), ($1, $5, $6, $7)`,
      [entryId, accountId, accountDebit, accountCredit, counterAccountId, counterDebit, counterCredit]
    );
    res.status(201).json({ id: entryId, date: entryDate, description: desc });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/** GET /journal/entries/:id - get one journal entry with lines (for edit). Only manual entries editable. */
router.get('/entries/:id', async (req, res) => {
  const id = req.params.id;
  const r = await pool.query(
    `SELECT je.id, je.date, je.description, je.source_ref_type
     FROM journal_entries je WHERE je.id = $1`,
    [id]
  );
  if (r.rows.length === 0) {
    return res.status(404).json({ error: 'Journal entry not found' });
  }
  const entry = r.rows[0];
  const linesR = await pool.query(
    `SELECT jl.id AS line_id, jl.account_id, jl.debit_amount, jl.credit_amount
     FROM journal_lines jl WHERE jl.journal_entry_id = $1 ORDER BY jl.debit_amount > 0 DESC`,
    [id]
  );
  const lines = linesR.rows.map((row) => ({
    lineId: row.line_id,
    accountId: row.account_id,
    debitAmount: Number(row.debit_amount),
    creditAmount: Number(row.credit_amount),
  }));
  res.json({
    id: entry.id,
    date: entry.date,
    description: entry.description || null,
    sourceRefType: entry.source_ref_type,
    lines,
  });
});

/** PATCH /journal/entries/:id - update manual journal entry (date, description only). */
router.patch('/entries/:id', async (req, res) => {
  const id = req.params.id;
  const { date, description } = req.body || {};
  const r = await pool.query(
    'SELECT id, source_ref_type FROM journal_entries WHERE id = $1',
    [id]
  );
  if (r.rows.length === 0) {
    return res.status(404).json({ error: 'Journal entry not found' });
  }
  if (r.rows[0].source_ref_type !== 'manual') {
    return res.status(400).json({ error: 'Only manual journal entries can be edited' });
  }
  const updates = [];
  const params = [];
  let pos = 1;
  if (date !== undefined && date !== '') {
    updates.push(`date = $${pos++}`);
    params.push(date);
  }
  if (description !== undefined) {
    updates.push(`description = $${pos++}`);
    params.push((description && String(description).trim()) || null);
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  params.push(id);
  await pool.query(
    `UPDATE journal_entries SET ${updates.join(', ')} WHERE id = $${pos}`,
    params
  );
  res.json({ ok: true });
});

/** DELETE /journal/entries/:id - delete manual journal entry (and its lines via cascade). */
router.delete('/entries/:id', async (req, res) => {
  const id = req.params.id;
  const r = await pool.query(
    'SELECT id, source_ref_type FROM journal_entries WHERE id = $1',
    [id]
  );
  if (r.rows.length === 0) {
    return res.status(404).json({ error: 'Journal entry not found' });
  }
  if (r.rows[0].source_ref_type !== 'manual') {
    return res.status(400).json({ error: 'Only manual journal entries can be deleted' });
  }
  await pool.query('DELETE FROM journal_entries WHERE id = $1', [id]);
  res.json({ deleted: true });
});

module.exports = router;
