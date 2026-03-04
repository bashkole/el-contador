const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

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

router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ userId: req.session.userId });
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
    'INSERT INTO users (email, password_hash) VALUES ($1, $2)',
    [normalizedEmail, hash]
  );
  res.json({ ok: true });
});

module.exports = router;
