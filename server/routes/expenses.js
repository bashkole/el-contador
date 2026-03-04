const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../db/pool');
const { extractInvoiceData } = require('../services/invoice-extraction');

const uploadDir = path.join(__dirname, '..', 'uploads', 'expenses');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safe = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const router = express.Router();

/**
 * Check for duplicate invoice numbers. Returns:
 * - sameSupplierDuplicate: true if an expense exists with same supplier and invoice number (block save)
 * - otherSupplierDuplicate: true if an expense exists with same invoice number but different supplier (warn only)
 * - existingIds: array of existing expense ids with this invoice number (for messages)
 */
async function checkDuplicateInvoiceNumber(invoiceNumber, supplierId, excludeExpenseId = null) {
  const normalized = (invoiceNumber || '').trim();
  if (!normalized) return { sameSupplierDuplicate: false, otherSupplierDuplicate: false, existingIds: [] };

  const params = [normalized];
  let paramIdx = 2;
  let where = 'WHERE LOWER(TRIM(invoice_number)) = LOWER(TRIM($1)) AND invoice_number IS NOT NULL AND TRIM(invoice_number) != \'\'';
  if (excludeExpenseId) {
    params.push(excludeExpenseId);
    where += ` AND id != $${paramIdx}`;
    paramIdx++;
  }

  const r = await pool.query(
    `SELECT id, supplier_id FROM expenses ${where}`,
    params
  );
  if (r.rows.length === 0) return { sameSupplierDuplicate: false, otherSupplierDuplicate: false, existingIds: [] };

  const existingIds = r.rows.map(row => row.id);
  const sameSupplier = r.rows.some(row => {
    const rowSupp = row.supplier_id;
    const inputSupp = supplierId || null;
    return (rowSupp === null && inputSupp === null) || (rowSupp && inputSupp && rowSupp === inputSupp);
  });
  return {
    sameSupplierDuplicate: sameSupplier,
    otherSupplierDuplicate: r.rows.length > 0,
    existingIds,
  };
}

router.get('/', async (req, res) => {
  const search = (req.query.search || req.query.q || '').trim();
  let query = `SELECT e.id, e.date, e.vendor, e.category, e.category_id, ec.name as category_name,
            e.amount, e.vat, e.vat_rate, e.notes, e.file_name, e.invoice_number, e.reconciled, e.reconciled_at,
            e.supplier_id, e.bank_transaction_id, e.created_at
     FROM expenses e
     LEFT JOIN expense_categories ec ON e.category_id = ec.id`;
  const params = [];
  if (search) {
    const pattern = '%' + search.replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
    params.push(pattern);
    query += ` WHERE (
      e.vendor ILIKE $1
      OR e.invoice_number ILIKE $1
      OR e.notes ILIKE $1
      OR e.category ILIKE $1
      OR ec.name ILIKE $1`;
    const numericMatch = search.replace(/[^\d.,-]/g, '').replace(',', '.');
    const amountNum = parseFloat(numericMatch);
    if (!isNaN(amountNum) && isFinite(amountNum)) {
      params.push(amountNum);
      query += ` OR e.amount = $${params.length} OR (e.amount + e.vat) = $${params.length}`;
    }
    query += ')';
  }
  query += ' ORDER BY e.date DESC';
  const r = await pool.query(query, params);
  res.json(r.rows.map(row => ({
    id: row.id,
    date: row.date,
    vendor: row.vendor,
    category: row.category,
    categoryId: row.category_id || null,
    categoryName: row.category_name || row.category || null,
    amount: Number(row.amount),
    vat: Number(row.vat),
    vatRate: row.vat_rate ? Number(row.vat_rate) : null,
    notes: row.notes,
    fileName: row.file_name,
    invoiceNumber: row.invoice_number || null,
    reconciled: row.reconciled,
    reconciledAt: row.reconciled_at,
    supplierId: row.supplier_id || null,
    bankTransactionId: row.bank_transaction_id || null,
    createdAt: row.created_at,
  })));
});

router.get('/check-duplicate', async (req, res) => {
  const invoiceNumber = (req.query.invoiceNumber || '').trim();
  const supplierId = req.query.supplierId || null;
  const excludeId = req.query.excludeId || null;
  if (!invoiceNumber) {
    return res.json({ sameSupplierDuplicate: false, otherSupplierDuplicate: false, existingIds: [] });
  }
  try {
    const result = await checkDuplicateInvoiceNumber(invoiceNumber, supplierId || null, excludeId || null);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  const { date, vendor, category, categoryId, amount, vat, vatRate, notes, supplierId, invoiceNumber } = req.body || {};
  const file = req.file;

  // Validate supplierId if provided
  let validSupplierId = null;
  if (supplierId) {
    const supplierCheck = await pool.query('SELECT id FROM suppliers WHERE id = $1', [supplierId]);
    if (supplierCheck.rows.length > 0) {
      validSupplierId = supplierId;
    }
  }

  // Validate categoryId if provided
  let validCategoryId = null;
  let categoryName = (category || '').trim();
  let actualVatRate = vatRate ? Number(vatRate) : null;

  if (categoryId) {
    const categoryCheck = await pool.query('SELECT id, name, default_vat_rate FROM expense_categories WHERE id = $1', [categoryId]);
    if (categoryCheck.rows.length > 0) {
      validCategoryId = categoryId;
      categoryName = categoryCheck.rows[0].name;
      // Use category default vat rate if not provided
      if (!actualVatRate) {
        actualVatRate = Number(categoryCheck.rows[0].default_vat_rate);
      }
    }
  }

  // Calculate VAT if vatRate provided but no explicit VAT amount
  let finalVat = Number(vat) || 0;
  if (actualVatRate && !vat) {
    finalVat = Math.round((Number(amount) || 0) * (actualVatRate / 100) * 100) / 100;
  }

  // Duplicate receipt check: same supplier cannot have two expenses with same invoice number
  const invNumTrimmed = (invoiceNumber || '').trim();
  let duplicateCheck = null;
  if (invNumTrimmed) {
    duplicateCheck = await checkDuplicateInvoiceNumber(invNumTrimmed, validSupplierId);
    if (duplicateCheck.sameSupplierDuplicate) {
      return res.status(409).json({
        error: 'Duplicate receipt',
        code: 'DUPLICATE_INVOICE_SAME_SUPPLIER',
        message: 'An expense with this invoice number already exists for this supplier.',
        existingIds: duplicateCheck.existingIds,
      });
    }
  }

  const r = await pool.query(
    `INSERT INTO expenses (date, vendor, category, category_id, amount, vat, vat_rate, notes, file_name, file_path, supplier_id, invoice_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, date, vendor, category, category_id, amount, vat, vat_rate, notes, file_name, invoice_number, reconciled, reconciled_at, supplier_id, created_at`,
    [
      date,
      (vendor || '').trim(),
      categoryName,
      validCategoryId,
      Number(amount) || 0,
      finalVat,
      actualVatRate,
      (notes || '').trim(),
      file ? file.originalname : null,
      file ? file.filename : null,
      validSupplierId,
      (invoiceNumber || '').trim() || null,
    ]
  );
  const row = r.rows[0];
  const payload = {
    id: row.id,
    date: row.date,
    vendor: row.vendor,
    category: row.category,
    categoryId: row.category_id || null,
    categoryName: validCategoryId ? categoryName : row.category,
    amount: Number(row.amount),
    vat: Number(row.vat),
    vatRate: row.vat_rate ? Number(row.vat_rate) : null,
    notes: row.notes,
    fileName: row.file_name,
    invoiceNumber: row.invoice_number || null,
    reconciled: row.reconciled,
    reconciledAt: row.reconciled_at,
    supplierId: row.supplier_id || null,
    createdAt: row.created_at,
  };
  // Warn if same invoice number exists for a different supplier (unlikely)
  if (duplicateCheck && duplicateCheck.otherSupplierDuplicate) {
    payload.warning = {
      code: 'DUPLICATE_INVOICE_OTHER_SUPPLIER',
      message: 'Another expense with this invoice number already exists from a different supplier. Please confirm this is not a duplicate.',
      existingIds: duplicateCheck.existingIds,
    };
  }
  res.status(201).json(payload);
});

router.put('/:id', async (req, res) => {
  const id = req.params.id;
  const { date, vendor, categoryId, amount, vat, vatRate, notes, supplierId, invoiceNumber } = req.body || {};

  let validSupplierId = null;
  if (supplierId !== undefined) {
    if (supplierId) {
      const supplierCheck = await pool.query('SELECT id FROM suppliers WHERE id = $1', [supplierId]);
      if (supplierCheck.rows.length > 0) validSupplierId = supplierId;
    } else {
      validSupplierId = null;
    }
  }

  let validCategoryId = null;
  let categoryName = null;
  let actualVatRate = vatRate !== undefined && vatRate !== '' ? Number(vatRate) : undefined;
  if (categoryId !== undefined) {
    if (categoryId) {
      const categoryCheck = await pool.query('SELECT id, name, default_vat_rate FROM expense_categories WHERE id = $1', [categoryId]);
      if (categoryCheck.rows.length > 0) {
        validCategoryId = categoryId;
        categoryName = categoryCheck.rows[0].name;
        if (actualVatRate === undefined) actualVatRate = Number(categoryCheck.rows[0].default_vat_rate);
      }
    } else {
      validCategoryId = null;
      categoryName = '';
    }
  }

  let finalVat = vat !== undefined ? Number(vat) || 0 : undefined;
  if (actualVatRate !== undefined && (vat === undefined || vat === '')) {
    finalVat = Math.round((Number(amount) || 0) * (actualVatRate / 100) * 100) / 100;
  }

  const invNumTrimmed = (invoiceNumber !== undefined ? invoiceNumber : null) === null ? null : String(invoiceNumber).trim();
  if (invNumTrimmed) {
    const duplicateCheck = await checkDuplicateInvoiceNumber(invNumTrimmed, validSupplierId ?? undefined, id);
    if (duplicateCheck.sameSupplierDuplicate) {
      return res.status(409).json({
        error: 'Duplicate receipt',
        code: 'DUPLICATE_INVOICE_SAME_SUPPLIER',
        message: 'An expense with this invoice number already exists for this supplier.',
        existingIds: duplicateCheck.existingIds,
      });
    }
  }

  const updates = [];
  const values = [];
  let pos = 1;
  if (date !== undefined) { updates.push(`date = $${pos++}`); values.push(date); }
  if (vendor !== undefined) { updates.push(`vendor = $${pos++}`); values.push((vendor || '').trim()); }
  if (categoryName !== undefined) { updates.push(`category = $${pos++}`); values.push(categoryName); }
  if (validCategoryId !== undefined) { updates.push(`category_id = $${pos++}`); values.push(validCategoryId); }
  if (amount !== undefined) { updates.push(`amount = $${pos++}`); values.push(Number(amount) || 0); }
  if (finalVat !== undefined) { updates.push(`vat = $${pos++}`); values.push(finalVat); }
  if (actualVatRate !== undefined) { updates.push(`vat_rate = $${pos++}`); values.push(actualVatRate); }
  if (notes !== undefined) { updates.push(`notes = $${pos++}`); values.push((notes || '').trim()); }
  if (supplierId !== undefined) { updates.push(`supplier_id = $${pos++}`); values.push(validSupplierId); }
  if (invoiceNumber !== undefined) { updates.push(`invoice_number = $${pos++}`); values.push((invoiceNumber || '').trim() || null); }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  values.push(id);

  const r = await pool.query(
    `UPDATE expenses SET ${updates.join(', ')} WHERE id = $${pos} RETURNING id, date, vendor, category, category_id, amount, vat, vat_rate, notes, file_name, invoice_number, reconciled, reconciled_at, supplier_id, created_at`,
    values
  );
  if (r.rows.length === 0) {
    return res.status(404).json({ error: 'Expense not found' });
  }
  const row = r.rows[0];
  res.json({
    id: row.id,
    date: row.date,
    vendor: row.vendor,
    category: row.category,
    categoryId: row.category_id || null,
    categoryName: row.category || null,
    amount: Number(row.amount),
    vat: Number(row.vat),
    vatRate: row.vat_rate ? Number(row.vat_rate) : null,
    notes: row.notes,
    fileName: row.file_name,
    invoiceNumber: row.invoice_number || null,
    reconciled: row.reconciled,
    reconciledAt: row.reconciled_at,
    supplierId: row.supplier_id || null,
    createdAt: row.created_at,
  });
});

router.get('/:id/file', async (req, res) => {
  const r = await pool.query('SELECT file_path, file_name FROM expenses WHERE id = $1', [req.params.id]);
  if (r.rows.length === 0 || !r.rows[0].file_path) {
    return res.status(404).end();
  }
  const filePath = path.join(uploadDir, r.rows[0].file_path);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const disposition = req.query.preview === '1' ? 'inline' : 'attachment';
  res.sendFile(path.resolve(filePath), {
    headers: { 'Content-Disposition': `${disposition}; filename="${r.rows[0].file_name || 'file'}"` }
  });
});

// Get file info and mime type for PDF preview
router.get('/:id/file-info', async (req, res) => {
  const r = await pool.query('SELECT file_path, file_name FROM expenses WHERE id = $1', [req.params.id]);
  if (r.rows.length === 0 || !r.rows[0].file_path) {
    return res.status(404).json({ error: 'File not found' });
  }
  const filePath = path.join(uploadDir, r.rows[0].file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  const ext = path.extname(r.rows[0].file_name || '').toLowerCase();
  let mimeType = 'application/octet-stream';
  if (ext === '.pdf') mimeType = 'application/pdf';
  else if (['.jpg', '.jpeg'].includes(ext)) mimeType = 'image/jpeg';
  else if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.webp') mimeType = 'image/webp';
  else if (ext === '.gif') mimeType = 'image/gif';

  res.json({
    fileName: r.rows[0].file_name,
    mimeType,
    url: `/api/expenses/${req.params.id}/file?preview=1`,
  });
});

// Extract invoice data using Gemini AI
router.post('/extract', upload.single('file'), async (req, res) => {
  const file = req.file;
  
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Validate file type
  const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExts.includes(ext)) {
    // Clean up the uploaded file
    try {
      fs.unlinkSync(file.path);
    } catch (e) { /* ignore */ }
    return res.status(400).json({ error: 'Invalid file type. Supported: PDF, JPG, PNG, WebP, GIF' });
  }

  try {
    const extractedData = await extractInvoiceData(file.path);
    
    // Clean up the temporary file
    try {
      fs.unlinkSync(file.path);
    } catch (e) {
      console.error('Failed to clean up temp file:', e);
    }

    res.json({
      success: true,
      data: extractedData
    });
  } catch (error) {
    // Clean up the temporary file on error
    try {
      fs.unlinkSync(file.path);
    } catch (e) { /* ignore */ }
    
    console.error('Invoice extraction failed:', error);
    res.status(500).json({ 
      error: 'Failed to extract invoice data',
      message: error.message 
    });
  }
});

// Delete an expense
router.delete('/:id', async (req, res) => {
  const id = req.params.id;

  // Get file info before deleting
  const fileR = await pool.query('SELECT file_path FROM expenses WHERE id = $1', [id]);
  const filePath = fileR.rows.length > 0 && fileR.rows[0].file_path
    ? path.join(uploadDir, fileR.rows[0].file_path)
    : null;

  // Delete the expense record
  const r = await pool.query('DELETE FROM expenses WHERE id = $1 RETURNING id', [id]);
  if (r.rows.length === 0) {
    return res.status(404).json({ error: 'Expense not found' });
  }

  // Delete the associated file if it exists
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      // Log but don't fail if file deletion fails
      console.error('Failed to delete expense file:', err);
    }
  }

  res.json({ success: true });
});

module.exports = router;
