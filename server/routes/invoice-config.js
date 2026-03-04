const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../db/pool');

const router = express.Router();
const logoDir = path.join(__dirname, '..', 'uploads', 'logo');
if (!fs.existsSync(logoDir)) {
  fs.mkdirSync(logoDir, { recursive: true });
}

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, logoDir),
  filename: (req, file, cb) => {
    const ext = (file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/jpeg' ? '.jpg' : '.png');
    cb(null, 'logo' + ext);
  },
});
const logoUpload = multer({ storage: logoStorage, limits: { fileSize: 2 * 1024 * 1024 } });

const DEFAULTS = {
  companyName: 'El Contador',
  tagline: 'Finance Administration',
  address: '',
  vatNumber: '',
  companyNumber: '',
  email: 'accounts@example.com',
  footer: 'Thank you for your business.',
  logoPath: '',
};

router.get('/', async (req, res) => {
  const r = await pool.query('SELECT data FROM invoice_settings WHERE id = 1');
  const raw = r.rows[0]?.data || {};
  const data = { ...DEFAULTS, ...raw };
  if (!data.footer && (raw.footerLine1 || raw.footerLine2)) {
    data.footer = [raw.footerLine1, raw.footerLine2].filter(Boolean).join('\n');
  }
  res.json(data);
});

router.put('/', async (req, res) => {
  const body = req.body || {};
  const r = await pool.query('SELECT data FROM invoice_settings WHERE id = 1');
  const existing = r.rows[0]?.data || {};
  const data = {
    companyName: String(body.companyName ?? existing.companyName ?? '').trim() || DEFAULTS.companyName,
    tagline: String(body.tagline ?? existing.tagline ?? '').trim() || DEFAULTS.tagline,
    address: String(body.address ?? existing.address ?? '').trim(),
    vatNumber: String(body.vatNumber ?? existing.vatNumber ?? '').trim(),
    companyNumber: String(body.companyNumber ?? existing.companyNumber ?? '').trim(),
    email: String(body.email ?? existing.email ?? '').trim() || DEFAULTS.email,
    footer: String(body.footer ?? existing.footer ?? '').trim() || DEFAULTS.footer,
    logoPath: existing.logoPath || '',
  };
  await pool.query(
    'INSERT INTO invoice_settings (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = $1::jsonb',
    [JSON.stringify(data)]
  );
  res.json(data);
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

router.post('/logo', logoUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext = path.extname(req.file.filename);
  const logoPath = 'logo' + ext;
  const r = await pool.query('SELECT data FROM invoice_settings WHERE id = 1');
  const existing = r.rows[0]?.data ? { ...r.rows[0].data } : {};
  existing.logoPath = logoPath;
  await pool.query(
    'INSERT INTO invoice_settings (id, data) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET data = $1::jsonb',
    [JSON.stringify(existing)]
  );
  res.json({ logoPath });
});

module.exports = router;
