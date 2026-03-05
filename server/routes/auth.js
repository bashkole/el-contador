const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const r = await pool.query(
    'SELECT id, password_hash FROM users WHERE email = $1',
    [String(email).trim().toLowerCase()]
  );
  if (r.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const user = r.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  req.session.userId = user.id;
  req.session.save((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    res.json({ ok: true });
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const r = await pool.query(
    'SELECT id, role, hierarchy_level FROM users WHERE id = $1',
    [req.session.userId]
  );
  if (r.rows.length === 0) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const u = r.rows[0];
  res.json({
    userId: u.id,
    role: u.role || 'user',
    hierarchyLevel: u.hierarchy_level != null ? u.hierarchy_level : 1,
  });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  const r = await pool.query(
    'SELECT id, password_hash FROM users WHERE id = $1',
    [req.session.userId]
  );
  if (r.rows.length === 0) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const user = r.rows[0];
  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, user.id]);
  res.json({ ok: true });
});

router.get('/users', requireAuth, async (req, res) => {
  const r = await pool.query(
    'SELECT id, email, created_at, role, hierarchy_level FROM users ORDER BY email'
  );
  res.json(r.rows.map(row => ({
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
    role: row.role || 'user',
    hierarchyLevel: row.hierarchy_level != null ? row.hierarchy_level : 1,
  })));
});

router.post('/create-user', requireAuth, async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = email ? String(email).trim().toLowerCase() : '';
  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length > 0) {
    return res.status(400).json({ error: 'A user with this email already exists' });
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    "INSERT INTO users (email, password_hash, role, hierarchy_level) VALUES ($1, $2, 'user', 1)",
    [normalizedEmail, hash]
  );
  res.json({ ok: true });
});

router.patch('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const targetId = req.params.id;
  const { role, hierarchyLevel } = req.body || {};
  const updates = [];
  const values = [];
  let pos = 1;
  if (role !== undefined) {
    if (role !== 'admin' && role !== 'user') {
      return res.status(400).json({ error: 'Role must be admin or user' });
    }
    updates.push(`role = $${pos++}`);
    values.push(role);
  }
  if (hierarchyLevel !== undefined) {
    const level = parseInt(hierarchyLevel, 10);
    if (isNaN(level) || level < 0) {
      return res.status(400).json({ error: 'Hierarchy level must be a non-negative integer' });
    }
    updates.push(`hierarchy_level = $${pos++}`);
    values.push(level);
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  values.push(targetId);
  const r = await pool.query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${pos} RETURNING id, email, role, hierarchy_level`,
    values
  );
  if (r.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  const row = r.rows[0];
  res.json({
    id: row.id,
    email: row.email,
    role: row.role,
    hierarchyLevel: row.hierarchy_level,
  });
});

router.delete('/users/:id', requireAuth, async (req, res) => {
  const targetId = req.params.id;
  if (targetId === req.session.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }
  const r = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [targetId]);
  if (r.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ deleted: true });
});

module.exports = router;
