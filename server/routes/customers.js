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
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Get all customers
router.get('/', async (req, res) => {
  const r = await pool.query(
    'SELECT id, name, email, address, phone, vat_number, company_number, notes, created_at, updated_at FROM customers ORDER BY name ASC'
  );
  res.json(r.rows.map(mapRow));
});

// Get a single customer
router.get('/:id', async (req, res) => {
  const r = await pool.query(
    'SELECT id, name, email, address, phone, vat_number, company_number, notes, created_at, updated_at FROM customers WHERE id = $1',
    [req.params.id]
  );
  if (r.rows.length === 0) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json(mapRow(r.rows[0]));
});

// Create a new customer
router.post('/', async (req, res) => {
  const { name, email, address, phone, vatNumber, companyNumber, notes } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const r = await pool.query(
      `INSERT INTO customers (name, email, address, phone, vat_number, company_number, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, address, phone, vat_number, company_number, notes, created_at, updated_at`,
      [
        name.trim(),
        (email || '').trim() || null,
        (address || '').trim() || null,
        (phone || '').trim() || null,
        (vatNumber || '').trim() || null,
        (companyNumber || '').trim() || null,
        (notes || '').trim() || null,
      ]
    );
    res.status(201).json(mapRow(r.rows[0]));
  } catch (err) {
    throw err;
  }
});

// Update a customer
router.put('/:id', async (req, res) => {
  const id = req.params.id;
  const { name, email, address, phone, vatNumber, companyNumber, notes } = req.body || {};

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
  if (notes !== undefined) {
    updates.push(`notes = $${pos++}`);
    values.push((notes || '').trim() || null);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push(`updated_at = $${pos++}`);
  values.push(new Date());
  values.push(id);

  const r = await pool.query(
    `UPDATE customers SET ${updates.join(', ')} WHERE id = $${pos} RETURNING id, name, email, address, phone, vat_number, company_number, notes, created_at, updated_at`,
    values
  );

  if (r.rows.length === 0) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  res.json(mapRow(r.rows[0]));
});

// Delete a customer
router.delete('/:id', async (req, res) => {
  const r = await pool.query('DELETE FROM customers WHERE id = $1 RETURNING id', [req.params.id]);
  if (r.rows.length === 0) {
    return res.status(404).json({ error: 'Customer not found' });
  }
  res.json({ success: true });
});

module.exports = router;
