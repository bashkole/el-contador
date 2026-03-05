const { pool } = require('../db/pool');

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/login');
}

async function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/login');
  }
  try {
    const r = await pool.query(
      'SELECT id, role FROM users WHERE id = $1',
      [req.session.userId]
    );
    if (r.rows.length === 0 || r.rows[0].role !== 'admin') {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ error: 'Admin required' });
      }
      return res.status(403).send('Admin required');
    }
    return next();
  } catch (err) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ error: err.message });
    }
    return res.status(500).send('Server error');
  }
}

module.exports = { requireAuth, requireAdmin };
