const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

router.get('/', async (req, res) => {
  const r = await pool.query('SELECT data FROM integration_settings WHERE id = 1');
  const data = r.rows[0]?.data || {};
  res.json(data);
});

router.put('/', async (req, res) => {
  const body = req.body || {};
  const r = await pool.query('SELECT data FROM integration_settings WHERE id = 1');
  const existing = r.rows[0]?.data || {};
  const data = {
    stripeEnabled: Boolean(body.stripeEnabled ?? existing.stripeEnabled),
    stripeSecretKey: typeof body.stripeSecretKey === 'string' ? body.stripeSecretKey.trim() : (existing.stripeSecretKey || ''),
    stripeWebhookSecret: typeof body.stripeWebhookSecret === 'string' ? body.stripeWebhookSecret.trim() : (existing.stripeWebhookSecret || ''),
    paddleEnabled: Boolean(body.paddleEnabled ?? existing.paddleEnabled),
    paddleApiKey: typeof body.paddleApiKey === 'string' ? body.paddleApiKey.trim() : (existing.paddleApiKey || ''),
    paddleWebhookSecret: typeof body.paddleWebhookSecret === 'string' ? body.paddleWebhookSecret.trim() : (existing.paddleWebhookSecret || ''),
  };
  await pool.query(
    'INSERT INTO integration_settings (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = $1::jsonb',
    [JSON.stringify(data)]
  );
  res.json(data);
});

module.exports = router;
