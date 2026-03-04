/**
 * Batch import expenses from invoice files in a folder.
 * For each file: extracts data (Gemini), creates expense, copies file to uploads.
 *
 * Usage from project host (httpdocs = project root with docker-compose.yml):
 *   cd httpdocs
 *   docker compose run --rm \
 *     -v "$(pwd)/server/scripts:/app/scripts:ro" \
 *     -v "/path/to/your/invoices:/tmp/invoices:ro" \
 *     backend node scripts/batch-import-expenses.js /tmp/invoices
 *
 * Example for "temp transactions" folder next to httpdocs:
 *   docker compose run --rm \
 *     -v "$(pwd)/server/scripts:/app/scripts:ro" \
 *     -v "$(pwd)/../temp transactions:/tmp/invoices:ro" \
 *     backend node scripts/batch-import-expenses.js /tmp/invoices
 */

const path = require('path');
const fs = require('fs');

// Load env from project root when run from server/scripts
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { pool } = require('../db/pool');
const { extractInvoiceData } = require('../services/invoice-extraction');

const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif'];
const uploadDir = path.join(__dirname, '..', 'uploads', 'expenses');

async function checkDuplicateInvoiceNumber(invoiceNumber, supplierId = null) {
  const normalized = (invoiceNumber || '').trim();
  if (!normalized) return { sameSupplierDuplicate: false };

  const r = await pool.query(
    `SELECT id, supplier_id FROM expenses WHERE LOWER(TRIM(invoice_number)) = LOWER(TRIM($1)) AND invoice_number IS NOT NULL AND TRIM(invoice_number) != ''`,
    [normalized]
  );
  if (r.rows.length === 0) return { sameSupplierDuplicate: false };

  const sameSupplier = r.rows.some(
    (row) =>
      (row.supplier_id === null && supplierId === null) ||
      (row.supplier_id && supplierId && row.supplier_id === supplierId)
  );
  return { sameSupplierDuplicate: sameSupplier };
}

function safeFilename(originalName) {
  return Buffer.from(originalName, 'latin1')
    .toString('utf8')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getCategoryIdOther() {
  return pool
    .query(`SELECT id FROM expense_categories WHERE name = 'Other' LIMIT 1`)
    .then((r) => (r.rows[0] ? r.rows[0].id : null));
}

async function processFile(filePath) {
  const originalName = path.basename(filePath);
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return { skipped: true, reason: 'unsupported extension' };

  let data = null;
  try {
    data = await extractInvoiceData(filePath);
  } catch (err) {
    console.error(`  Extract failed for ${originalName}:`, err.message);
    data = {
      vendor: 'Unknown',
      date: new Date().toISOString().slice(0, 10),
      netAmount: 0,
      vatAmount: 0,
      vatRate: 21,
      invoiceNumber: null,
      description: null,
    };
  }

  const vendor = (data.vendor || 'Unknown').trim();
  const date = data.date || new Date().toISOString().slice(0, 10);
  const amount = Number(data.netAmount) || 0;
  const vat = Number(data.vatAmount) || 0;
  const vatRate = data.vatRate != null ? Number(data.vatRate) : 21;
  const invoiceNumber = (data.invoiceNumber || '').trim() || null;
  const notes = (data.description || '').trim() || '';

  const duplicate = await checkDuplicateInvoiceNumber(invoiceNumber, null);
  if (duplicate.sameSupplierDuplicate) {
    return { skipped: true, reason: 'duplicate invoice number', invoiceNumber };
  }

  const categoryIdOther = await getCategoryIdOther();
  const storedFilename = `${Date.now()}_${safeFilename(originalName)}`;
  const destPath = path.join(uploadDir, storedFilename);

  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  fs.copyFileSync(filePath, destPath);

  const r = await pool.query(
    `INSERT INTO expenses (date, vendor, category, category_id, amount, vat, vat_rate, notes, file_name, file_path, supplier_id, invoice_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      date,
      vendor,
      'Other',
      categoryIdOther,
      amount,
      vat,
      vatRate,
      notes,
      originalName,
      storedFilename,
      null,
      invoiceNumber,
    ]
  );
  const id = r.rows[0].id;
  return { created: true, id, vendor, date, amount, fileName: originalName };
}

async function main() {
  const dir = process.argv[2] || path.join(__dirname, '..', '..', 'temp transactions');
  if (!fs.existsSync(dir)) {
    console.error('Directory not found:', dir);
    process.exit(1);
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && ALLOWED_EXT.includes(path.extname(e.name).toLowerCase()))
    .map((e) => path.join(dir, e.name))
    .sort();

  if (files.length === 0) {
    console.log('No supported invoice files found.');
    process.exit(0);
  }

  console.log(`Processing ${files.length} file(s) from ${dir}\n`);

  let created = 0;
  let skipped = 0;
  for (const filePath of files) {
    const name = path.basename(filePath);
    try {
      const result = await processFile(filePath);
      if (result.created) {
        created++;
        console.log(`[OK] ${name} -> expense ${result.id} (${result.vendor}, ${result.date}, ${result.amount})`);
      } else {
        skipped++;
        console.log(`[SKIP] ${name}: ${result.reason}${result.invoiceNumber ? ` (${result.invoiceNumber})` : ''}`);
      }
    } catch (err) {
      skipped++;
      console.error(`[ERR] ${name}:`, err.message);
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
