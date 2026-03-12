const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { pool } = require('../db/pool');

const router = express.Router();
const DEFAULT_COMPANY_NAME = 'El Contador';
const logoDir = path.join(__dirname, '..', 'uploads', 'logo');

router.get('/company-name', async (req, res) => {
  try {
    const r = await pool.query('SELECT data FROM invoice_settings WHERE id = 1');
    const raw = r.rows[0]?.data || {};
    const companyName = (raw.companyName && String(raw.companyName).trim()) || DEFAULT_COMPANY_NAME;
    const logoPath = raw.logoPath;
    const hasLogo = !!(logoPath && fs.existsSync(path.join(logoDir, logoPath)));
    res.json({ companyName, hasLogo });
  } catch (err) {
    res.json({ companyName: DEFAULT_COMPANY_NAME, hasLogo: false });
  }
});

router.get('/logo', (req, res) => {
  pool.query('SELECT data FROM invoice_settings WHERE id = 1').then((r) => {
    const data = r.rows[0]?.data || {};
    const logoPath = data.logoPath;
    if (!logoPath) return res.status(404).end();
    const filePath = path.join(logoDir, logoPath);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    res.sendFile(path.resolve(filePath), { headers: { 'Cache-Control': 'no-store' } });
  }).catch(() => res.status(500).end());
});

router.get('/favicon', async (req, res) => {
  process.stderr.write(`[public] GET /favicon logoDir=${logoDir}\n`);
  try {
    const r = await pool.query('SELECT data FROM invoice_settings WHERE id = 1');
    const data = r.rows[0]?.data || {};
    const logoPath = data.logoPath;
    if (!logoPath) {
      process.stderr.write(`[public] GET /favicon -> 404 (no logoPath in settings)\n`);
      return res.status(404).end();
    }
    const logoFilePath = path.join(logoDir, logoPath);
    if (!fs.existsSync(logoFilePath)) {
      process.stderr.write(`[public] GET /favicon -> 404 (logo file not found: ${logoFilePath})\n`);
      return res.status(404).end();
    }
    const pngBuffer = await sharp(logoFilePath).resize(32, 32).png().toBuffer();
    res.set({
      'Cache-Control': 'public, max-age=86400',
      'Content-Type': 'image/png',
    });
    res.send(pngBuffer);
    process.stderr.write(`[public] GET /favicon -> 200 (generated from ${logoPath})\n`);
  } catch (err) {
    process.stderr.write(`[public] GET /favicon -> 500 ${err.message}\n`);
    res.status(500).end();
  }
});

module.exports = router;
