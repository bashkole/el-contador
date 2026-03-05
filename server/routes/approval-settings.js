const express = require('express');
const { pool } = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const MAX_APPROVERS = 5;

router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT enabled, approvers FROM approval_settings WHERE id = 1');
    const row = r.rows[0];
    const enabled = row ? !!row.enabled : false;
    let approvers = row && row.approvers ? row.approvers : [];
    if (!Array.isArray(approvers)) approvers = [];
    approvers = approvers.slice(0, MAX_APPROVERS).map((a) => ({
      userId: a.userId || a.user_id,
      level: typeof a.level === 'number' ? a.level : parseInt(a.level, 10) || 0,
    }));
    res.json({ enabled, approvers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', requireAuth, requireAdmin, async (req, res) => {
  const { enabled, approvers } = req.body || {};
  let approversList = Array.isArray(approvers) ? approvers : [];
  if (approversList.length > MAX_APPROVERS) {
    return res.status(400).json({ error: `Maximum ${MAX_APPROVERS} approvers allowed` });
  }
  const normalized = approversList.map((a) => {
    const userId = a.userId || a.user_id;
    const level = typeof a.level === 'number' ? a.level : parseInt(a.level, 10);
    return { userId, level: isNaN(level) || level < 0 ? 0 : level };
  });
  for (const a of normalized) {
    if (!a.userId) {
      return res.status(400).json({ error: 'Each approver must have a userId' });
    }
    const check = await pool.query('SELECT id FROM users WHERE id = $1', [a.userId]);
    if (check.rows.length === 0) {
      return res.status(400).json({ error: `User not found: ${a.userId}` });
    }
  }
  try {
    await pool.query(
      `INSERT INTO approval_settings (id, enabled, approvers)
       VALUES (1, $1, $2::jsonb)
       ON CONFLICT (id) DO UPDATE SET enabled = $1, approvers = $2::jsonb`,
      [!!enabled, JSON.stringify(normalized)]
    );
    res.json({ enabled: !!enabled, approvers: normalized });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
