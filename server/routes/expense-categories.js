const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

router.get('/', async (req, res) => {
  const r = await pool.query(
    'SELECT id, name, description, default_vat_rate, account_code, sort_order, active, created_at FROM expense_categories ORDER BY sort_order, name'
  );
  res.json(r.rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    defaultVatRate: Number(row.default_vat_rate),
    accountCode: row.account_code,
    sortOrder: row.sort_order,
    active: row.active,
    createdAt: row.created_at,
  })));
});

router.post('/', async (req, res) => {
  const { name, description, defaultVatRate, accountCode, sortOrder } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }
  try {
    const r = await pool.query(
      `INSERT INTO expense_categories (name, description, default_vat_rate, account_code, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, description, default_vat_rate, account_code, sort_order, active, created_at`,
      [
        name.trim(),
        (description || '').trim(),
        Number(defaultVatRate) || 21.00,
        (accountCode || '').trim(),
        Number(sortOrder) || 0,
      ]
    );
    const row = r.rows[0];
    res.status(201).json({
      id: row.id,
      name: row.name,
      description: row.description,
      defaultVatRate: Number(row.default_vat_rate),
      accountCode: row.account_code,
      sortOrder: row.sort_order,
      active: row.active,
      createdAt: row.created_at,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Category name already exists' });
    }
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const id = req.params.id;
  const { name, description, defaultVatRate, accountCode, sortOrder, active } = req.body || {};
  const updates = [];
  const values = [];
  let pos = 1;

  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'Category name is required' });
    updates.push(`name = $${pos++}`);
    values.push(name.trim());
  }
  if (description !== undefined) {
    updates.push(`description = $${pos++}`);
    values.push(description.trim());
  }
  if (defaultVatRate !== undefined) {
    updates.push(`default_vat_rate = $${pos++}`);
    values.push(Number(defaultVatRate) || 0);
  }
  if (accountCode !== undefined) {
    updates.push(`account_code = $${pos++}`);
    values.push(accountCode.trim());
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
      `UPDATE expense_categories SET ${updates.join(', ')} WHERE id = $${pos}
       RETURNING id, name, description, default_vat_rate, account_code, sort_order, active, created_at`,
      values
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    const row = r.rows[0];
    res.json({
      id: row.id,
      name: row.name,
      description: row.description,
      defaultVatRate: Number(row.default_vat_rate),
      accountCode: row.account_code,
      sortOrder: row.sort_order,
      active: row.active,
      createdAt: row.created_at,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Category name already exists' });
    }
    throw err;
  }
});

router.delete('/:id', async (req, res) => {
  const id = req.params.id;
  await pool.query('DELETE FROM expense_categories WHERE id = $1', [id]);
  res.json({ deleted: true });
});

module.exports = router;
