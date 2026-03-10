const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

router.get('/', async (req, res) => {
  const r = await pool.query(
    'SELECT id, name, code_min, code_max, sort_order, created_at FROM account_groups ORDER BY sort_order, code_min'
  );
  res.json(r.rows.map(row => ({
    id: row.id,
    name: row.name,
    codeMin: row.code_min,
    codeMax: row.code_max,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  })));
});

module.exports = router;
