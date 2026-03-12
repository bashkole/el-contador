const express = require('express');
const { pool } = require('../db/pool');
const fiscal = require('../lib/fiscal');

const router = express.Router();

function mapRow(row) {
  return {
    id: row.id,
    accountGroupId: row.account_group_id == null ? null : String(row.account_group_id),
    accountGroupName: row.account_group_name,
    code: row.code,
    name: row.name,
    description: row.description,
    defaultVatRate: row.default_vat_rate != null ? Number(row.default_vat_rate) : null,
    sortOrder: row.sort_order,
    active: row.active,
    createdAt: row.created_at,
  };
}

router.get('/', async (req, res) => {
  const { group_id: groupId, type } = req.query || {};
  let query = `
    SELECT a.id, a.account_group_id, ag.name as account_group_name, a.code, a.name, a.description,
           a.default_vat_rate, a.sort_order, a.active, a.created_at
    FROM accounts a
    JOIN account_groups ag ON ag.id = a.account_group_id
    WHERE a.active = true`;
  const params = [];
  let pos = 1;

  if (groupId) {
    query += ` AND a.account_group_id = $${pos++}`;
    params.push(groupId);
  }
  if (type === 'expense') {
    query += ` AND a.code >= 400 AND a.code < 800`;
  }

  query += ` ORDER BY ag.sort_order, a.code`;

  const r = await pool.query(query, params);
  res.json(r.rows.map(mapRow));
});

router.get('/all', async (req, res) => {
  const r = await pool.query(
    `SELECT a.id, a.account_group_id, ag.name as account_group_name, a.code, a.name, a.description,
            a.default_vat_rate, a.sort_order, a.active, a.created_at
     FROM accounts a
     JOIN account_groups ag ON ag.id = a.account_group_id
     ORDER BY ag.sort_order, a.code`
  );
  res.json(r.rows.map(mapRow));
});

router.get('/:id', async (req, res) => {
  const id = req.params.id;
  const r = await pool.query(
    `SELECT a.id, a.account_group_id, ag.name as account_group_name, a.code, a.name, a.description,
            a.default_vat_rate, a.sort_order, a.active, a.created_at
     FROM accounts a
     JOIN account_groups ag ON ag.id = a.account_group_id
     WHERE a.id = $1`,
    [id]
  );
  if (r.rows.length === 0) {
    return res.status(404).json({ error: 'Account not found' });
  }
  res.json(mapRow(r.rows[0]));
});

/** GET /accounts/:id/ledger - journal lines for this account with optional year, quarter, month filter (fiscal). ytd=1 = fiscal year start to today. */
router.get('/:id/ledger', async (req, res) => {
  const accountId = req.params.id;
  const { year, quarter, month, ytd } = req.query || {};
  const accountCheck = await pool.query(
    'SELECT id FROM accounts WHERE id = $1 AND active = true',
    [accountId]
  );
  if (accountCheck.rows.length === 0) {
    return res.status(404).json({ error: 'Account not found' });
  }
  let dateCondition = '';
  const params = [accountId];
  let pos = 2;
  const today = new Date().toISOString().slice(0, 10);

  if (year && year !== 'all') {
    const y = parseInt(String(year), 10);
    if (Number.isNaN(y) || y < 1900 || y > 2100) {
      return res.status(400).json({ error: 'Invalid year' });
    }
    const config = await fiscal.getFiscalConfig();
    const currentFiscalYear = fiscal.getFiscalYearContainingDateSync(today, config);

    if (quarter && quarter !== 'all') {
      const q = parseInt(String(quarter), 10);
      if (q < 1 || q > 4) return res.status(400).json({ error: 'Quarter must be 1-4' });
      const { startDate, endDate } = fiscal.getFiscalQuarterBounds(y, q, config);
      dateCondition = ` AND je.date >= $${pos}::date AND je.date <= $${pos + 1}::date`;
      params.push(startDate, endDate);
      pos += 2;
    } else if (month && month !== 'all') {
      const m = parseInt(String(month), 10);
      if (m < 1 || m > 12) return res.status(400).json({ error: 'Month must be 1-12' });
      const { startDate, endDate } = fiscal.getFiscalMonthBounds(y, m, config);
      dateCondition = ` AND je.date >= $${pos}::date AND je.date <= $${pos + 1}::date`;
      params.push(startDate, endDate);
      pos += 2;
    } else {
      const useYtd = ytd === '1' || ytd === 'true';
      const { startDate, endDate } = fiscal.getFiscalYearBounds(y, config);
      if (useYtd && y === currentFiscalYear) {
        dateCondition = ` AND je.date >= $${pos}::date AND je.date <= $${pos + 1}::date`;
        params.push(startDate, today <= endDate ? today : endDate);
        pos += 2;
      } else {
        dateCondition = ` AND je.date >= $${pos}::date AND je.date <= $${pos + 1}::date`;
        params.push(startDate, endDate);
        pos += 2;
      }
    }
  }

  const r = await pool.query(
    `SELECT jl.id AS line_id, je.id AS journal_entry_id, je.date, je.description, je.source_ref_type,
            jl.debit_amount, jl.credit_amount
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE jl.account_id = $1 ${dateCondition}
     ORDER BY je.date ASC, je.id ASC`,
    params
  );
  let periodSum = 0;
  const lines = r.rows.map((row) => {
    const debit = Number(row.debit_amount);
    const credit = Number(row.credit_amount);
    periodSum += debit - credit;
    return {
      lineId: row.line_id,
      journalEntryId: row.journal_entry_id,
      date: row.date,
      description: row.description || null,
      debitAmount: debit,
      creditAmount: credit,
      sourceRefType: row.source_ref_type || null,
    };
  });
  res.json({ lines, periodSum });
});

router.post('/', async (req, res) => {
  const { accountGroupId, code, name, description, defaultVatRate, sortOrder } = req.body || {};
  if (!accountGroupId || code == null || code === '' || !name || !name.trim()) {
    return res.status(400).json({ error: 'accountGroupId, code and name are required' });
  }
  const codeNum = parseInt(String(code), 10);
  if (Number.isNaN(codeNum)) {
    return res.status(400).json({ error: 'code must be a number' });
  }
  try {
    const r = await pool.query(
      `INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, account_group_id, code, name, description, default_vat_rate, sort_order, active, created_at`,
      [
        accountGroupId,
        codeNum,
        name.trim(),
        (description || '').trim() || null,
        defaultVatRate != null ? Number(defaultVatRate) : null,
        Number(sortOrder) || 0,
      ]
    );
    const row = r.rows[0];
    const ag = await pool.query('SELECT name FROM account_groups WHERE id = $1', [row.account_group_id]);
    res.status(201).json(mapRow({
      ...row,
      account_group_name: ag.rows[0]?.name || null,
    }));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: `Account code ${codeNum} already exists. Choose a different code within the group range.`,
      });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Invalid account group' });
    }
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const id = req.params.id;
  const { accountGroupId, code, name, description, defaultVatRate, sortOrder, active } = req.body || {};
  const updates = [];
  const values = [];
  let pos = 1;

  if (accountGroupId !== undefined) {
    updates.push(`account_group_id = $${pos++}`);
    values.push(accountGroupId);
  }
  if (code !== undefined) {
    const codeNum = parseInt(String(code), 10);
    if (Number.isNaN(codeNum)) {
      return res.status(400).json({ error: 'code must be a number' });
    }
    updates.push(`code = $${pos++}`);
    values.push(codeNum);
  }
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'name is required' });
    updates.push(`name = $${pos++}`);
    values.push(name.trim());
  }
  if (description !== undefined) {
    updates.push(`description = $${pos++}`);
    values.push((description || '').trim() || null);
  }
  if (defaultVatRate !== undefined) {
    updates.push(`default_vat_rate = $${pos++}`);
    values.push(defaultVatRate != null ? Number(defaultVatRate) : null);
  }
  if (sortOrder !== undefined) {
    updates.push(`sort_order = $${pos++}`);
    values.push(Number(sortOrder) || 0);
  }
  if (active !== undefined) {
    updates.push(`active = $${pos++}`);
    values.push(Boolean(active));
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(id);
  try {
    const r = await pool.query(
      `UPDATE accounts SET ${updates.join(', ')} WHERE id = $${pos}
       RETURNING id, account_group_id, code, name, description, default_vat_rate, sort_order, active, created_at`,
      values
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    const row = r.rows[0];
    const ag = await pool.query('SELECT name FROM account_groups WHERE id = $1', [row.account_group_id]);
    res.json(mapRow({
      ...row,
      account_group_name: ag.rows[0]?.name || null,
    }));
  } catch (err) {
    if (err.code === '23505') {
      const dupCode = code !== undefined ? parseInt(String(code), 10) : '';
      return res.status(409).json({
        error: Number.isNaN(dupCode) ? 'Account code already exists. Choose a different code.' : `Account code ${dupCode} already exists. Choose a different code.`,
      });
    }
    throw err;
  }
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  const r = await pool.query('DELETE FROM accounts WHERE id = $1 RETURNING id', [id]);
  if (r.rows.length === 0) {
    return res.status(404).json({ error: 'Account not found' });
  }
  res.json({ deleted: true });
});

module.exports = router;
