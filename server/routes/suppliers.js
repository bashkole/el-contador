const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email || '',
    address: row.address || '',
    phone: row.phone || '',
    vatNumber: row.vat_number || '',
    companyNumber: row.company_number || '',
    accountNumber: row.account_number || '',
    notes: row.notes || '',
    categoryId: row.category_id || null,
    categoryName: row.category_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Get all suppliers (with category when category_id column exists)
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.id, s.name, s.email, s.address, s.phone, s.vat_number, s.company_number, s.account_number, s.notes, s.category_id, s.created_at, s.updated_at,
              c.name AS category_name
       FROM suppliers s
       LEFT JOIN expense_categories c ON c.id = s.category_id
       ORDER BY s.name ASC`
    );
    return res.json(r.rows.map(mapRow));
  } catch (err) {
    if (err.code === '42703') {
      const r = await pool.query(
        'SELECT id, name, email, address, phone, vat_number, company_number, account_number, notes, created_at, updated_at FROM suppliers ORDER BY name ASC'
      );
      return res.json(r.rows.map(row => mapRow({ ...row, category_id: null, category_name: null })));
    }
    throw err;
  }
});

// Get a single supplier
router.get('/:id', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.id, s.name, s.email, s.address, s.phone, s.vat_number, s.company_number, s.account_number, s.notes, s.category_id, s.created_at, s.updated_at,
              c.name AS category_name
       FROM suppliers s
       LEFT JOIN expense_categories c ON c.id = s.category_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    return res.json(mapRow(r.rows[0]));
  } catch (err) {
    if (err.code === '42703') {
      const r = await pool.query(
        'SELECT id, name, email, address, phone, vat_number, company_number, account_number, notes, created_at, updated_at FROM suppliers WHERE id = $1',
        [req.params.id]
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ error: 'Supplier not found' });
      }
      return res.json({ ...mapRow(r.rows[0]), categoryId: null, categoryName: null });
    }
    throw err;
  }
});

// Create a new supplier
router.post('/', async (req, res) => {
  const { name, email, address, phone, vatNumber, companyNumber, accountNumber, notes, categoryId } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    let r = await pool.query(
      `INSERT INTO suppliers (name, email, address, phone, vat_number, company_number, account_number, notes, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, email, address, phone, vat_number, company_number, account_number, notes, category_id, created_at, updated_at`,
      [
        name.trim(),
        (email || '').trim() || null,
        (address || '').trim() || null,
        (phone || '').trim() || null,
        (vatNumber || '').trim() || null,
        (companyNumber || '').trim() || null,
        (accountNumber || '').trim() || null,
        (notes || '').trim() || null,
        categoryId || null,
      ]
    );
    let row = r.rows[0];
    if (row.category_id) {
      const cat = await pool.query('SELECT name FROM expense_categories WHERE id = $1', [row.category_id]);
      row.category_name = cat.rows[0]?.name || null;
    } else {
      row.category_name = null;
    }
    res.status(201).json(mapRow(row));
  } catch (err) {
    if (err.code === '42703') {
      const r2 = await pool.query(
        `INSERT INTO suppliers (name, email, address, phone, vat_number, company_number, account_number, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, email, address, phone, vat_number, company_number, account_number, notes, created_at, updated_at`,
        [
          name.trim(),
          (email || '').trim() || null,
          (address || '').trim() || null,
          (phone || '').trim() || null,
          (vatNumber || '').trim() || null,
          (companyNumber || '').trim() || null,
          (accountNumber || '').trim() || null,
          (notes || '').trim() || null,
        ]
      );
      row = { ...r2.rows[0], category_id: null, category_name: null };
      res.status(201).json(mapRow(row));
    } else {
      throw err;
    }
  }
});

// Update a supplier
router.put('/:id', async (req, res) => {
  const id = req.params.id;
  const { name, email, address, phone, vatNumber, companyNumber, accountNumber, notes, categoryId } = req.body || {};

  const updates = [];
  const values = [];
  let pos = 1;

  if (name !== undefined) {
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    updates.push(`name = $${pos++}`);
    values.push(name.trim());
  }
  if (email !== undefined) {
    updates.push(`email = $${pos++}`);
    values.push((email || '').trim() || null);
  }
  if (address !== undefined) {
    updates.push(`address = $${pos++}`);
    values.push((address || '').trim() || null);
  }
  if (phone !== undefined) {
    updates.push(`phone = $${pos++}`);
    values.push((phone || '').trim() || null);
  }
  if (vatNumber !== undefined) {
    updates.push(`vat_number = $${pos++}`);
    values.push((vatNumber || '').trim() || null);
  }
  if (companyNumber !== undefined) {
    updates.push(`company_number = $${pos++}`);
    values.push((companyNumber || '').trim() || null);
  }
  if (accountNumber !== undefined) {
    updates.push(`account_number = $${pos++}`);
    values.push((accountNumber || '').trim() || null);
  }
  if (notes !== undefined) {
    updates.push(`notes = $${pos++}`);
    values.push((notes || '').trim() || null);
  }
  if (categoryId !== undefined) {
    updates.push(`category_id = $${pos++}`);
    values.push(categoryId || null);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push(`updated_at = $${pos++}`);
  values.push(new Date());
  values.push(id);

  try {
    const r = await pool.query(
      `UPDATE suppliers SET ${updates.join(', ')} WHERE id = $${pos}
       RETURNING id, name, email, address, phone, vat_number, company_number, account_number, notes, category_id, created_at, updated_at`,
      values
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    const row = r.rows[0];
    if (row.category_id) {
      const cat = await pool.query('SELECT name FROM expense_categories WHERE id = $1', [row.category_id]);
      row.category_name = cat.rows[0]?.name || null;
    } else {
      row.category_name = null;
    }
    return res.json(mapRow(row));
  } catch (err) {
    if (err.code === '42703') {
      const updatesWithoutCategory = updates.filter(u => !u.startsWith('category_id'));
      if (updatesWithoutCategory.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      const categoryIdx = updates.findIndex(u => u.startsWith('category_id'));
      const valuesWithoutCategory = categoryIdx >= 0
        ? values.filter((_, i) => i !== categoryIdx)
        : values;
      let p = 1;
      const renumbered = updatesWithoutCategory.map(u => u.replace(/\$\d+/, `$${p++}`));
      const r = await pool.query(
        `UPDATE suppliers SET ${renumbered.join(', ')} WHERE id = $${p} RETURNING id, name, email, address, phone, vat_number, company_number, account_number, notes, created_at, updated_at`,
        valuesWithoutCategory
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ error: 'Supplier not found' });
      }
      const row = { ...r.rows[0], category_id: null, category_name: null };
      return res.json(mapRow(row));
    }
    throw err;
  }
});

// Delete a supplier
router.delete('/:id', async (req, res) => {
  const r = await pool.query('DELETE FROM suppliers WHERE id = $1 RETURNING id', [req.params.id]);
  if (r.rows.length === 0) {
    return res.status(404).json({ error: 'Supplier not found' });
  }
  res.json({ success: true });
});

module.exports = router;
