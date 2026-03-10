const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

// GET /api/integrations
// Fetch integration settings (Stripe/Paddle credentials and toggles)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM integration_settings WHERE id = 1');
    if (result.rows.length === 0) {
      return res.json({});
    }
    
    // Mask secrets if needed before sending to frontend, but usually admins need to see if it's set
    // For now we'll just send the raw JSON data so the frontend can populate fields.
    // In a more secure implementation, you might mask keys (e.g. sk_test_...****)
    res.json(result.rows[0].data || {});
  } catch (error) {
    console.error('Failed to get integration settings:', error);
    res.status(500).json({ error: 'Server error fetching integration settings' });
  }
});

// PUT /api/integrations
// Update integration settings
router.put('/', async (req, res) => {
  try {
    const data = req.body;
    
    await pool.query(`
      INSERT INTO integration_settings (id, data)
      VALUES (1, $1)
      ON CONFLICT (id) DO UPDATE SET data = $1
    `, [data]);
    
    res.json({ message: 'Integration settings updated successfully' });
  } catch (error) {
    console.error('Failed to update integration settings:', error);
    res.status(500).json({ error: 'Server error updating integration settings' });
  }
});

module.exports = router;
