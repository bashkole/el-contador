const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

const RECON_TOLERANCE = 0.5;

/** Get suggested auto-matches: open bank tx paired with open expense/sale by amount (within tolerance) */
router.get('/suggestions', async (req, res) => {
  try {
    const openTx = await pool.query(
      `SELECT id, date, type, amount, description FROM bank_transactions WHERE reconciled = false ORDER BY date DESC`
    );
    const openExpenses = await pool.query(
      `SELECT id, date, vendor, amount, vat FROM expenses WHERE reconciled = false AND bank_transaction_id IS NULL ORDER BY date DESC`
    );
    const openSales = await pool.query(
      `SELECT id, issue_date, customer, total FROM sales WHERE reconciled = false AND voided = false ORDER BY issue_date DESC`
    );

    const suggestions = [];
    const usedTx = new Set();
    const usedExpense = new Set();
    const usedSale = new Set();

    for (const tx of openTx.rows) {
      if (usedTx.has(tx.id)) continue;
      const txAmount = Number(tx.amount);

      if (tx.type === 'out') {
        for (const ex of openExpenses.rows) {
          if (usedExpense.has(ex.id)) continue;
          const itemTotal = Number(ex.amount || 0) + Number(ex.vat || 0);
          if (Math.abs(txAmount - itemTotal) <= RECON_TOLERANCE) {
            usedTx.add(tx.id);
            usedExpense.add(ex.id);
            suggestions.push({
              bankTransactionId: tx.id,
              bankDate: tx.date,
              bankType: tx.type,
              bankAmount: txAmount,
              bankDescription: tx.description,
              targetId: ex.id,
              targetType: 'expense',
              targetLabel: ex.vendor,
              targetAmount: itemTotal,
            });
            break;
          }
        }
      } else {
        for (const sale of openSales.rows) {
          if (usedSale.has(sale.id)) continue;
          const total = Number(sale.total);
          if (Math.abs(txAmount - total) <= RECON_TOLERANCE) {
            usedTx.add(tx.id);
            usedSale.add(sale.id);
            suggestions.push({
              bankTransactionId: tx.id,
              bankDate: tx.date,
              bankType: tx.type,
              bankAmount: txAmount,
              bankDescription: tx.description,
              targetId: sale.id,
              targetType: 'sale',
              targetLabel: sale.customer,
              targetAmount: total,
            });
            break;
          }
        }
      }
    }

    res.json({ suggestions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/match', async (req, res) => {
  const { bankTransactionId, targetId, targetType } = req.body || {};
  if (!bankTransactionId || !targetId || !targetType || !['expense', 'sale'].includes(targetType)) {
    return res.status(400).json({ error: 'bankTransactionId, targetId and targetType (expense|sale) required' });
  }
  const now = new Date().toISOString();
  const client = await pool.connect();
  try {
    const txRow = await pool.query('SELECT id, amount FROM bank_transactions WHERE id = $1', [bankTransactionId]);
    if (txRow.rows.length === 0) {
      return res.status(404).json({ error: 'Bank transaction not found' });
    }
    const txAmount = Number(txRow.rows[0].amount);
    let itemTotal = 0;
    if (targetType === 'expense') {
      const e = await pool.query('SELECT amount, vat FROM expenses WHERE id = $1', [targetId]);
      if (e.rows.length === 0) return res.status(404).json({ error: 'Expense not found' });
      itemTotal = Number(e.rows[0].amount || 0) + Number(e.rows[0].vat || 0);
    } else {
      const s = await pool.query('SELECT total FROM sales WHERE id = $1', [targetId]);
      if (s.rows.length === 0) return res.status(404).json({ error: 'Sale not found' });
      itemTotal = Number(s.rows[0].total);
    }
    const diff = txAmount - itemTotal;
    if (Math.abs(diff) > RECON_TOLERANCE) {
      return res.status(400).json({
        error: 'Difference between transaction and item exceeds 0.50 EUR',
        expected: txAmount,
        total: itemTotal,
        diff,
      });
    }
    const adjustmentAmount = Math.round(diff * 100) / 100;
    await client.query('BEGIN');
    await client.query(
      `UPDATE bank_transactions SET reconciled = true, reconciliation_ref_type = $1, reconciliation_ref_id = $2, reconciled_at = $3, adjustment_amount = $4 WHERE id = $5`,
      [targetType, targetId, now, adjustmentAmount, bankTransactionId]
    );
    if (targetType === 'expense') {
      await client.query(
        `UPDATE expenses SET reconciled = true, reconciled_at = $1, bank_transaction_id = $2 WHERE id = $3`,
        [now, bankTransactionId, targetId]
      );
    } else {
      await client.query(
        `UPDATE sales SET reconciled = true, reconciled_at = $1 WHERE id = $2`,
        [now, targetId]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/** Match multiple expenses to one bank transaction (sum of expense totals must equal tx amount) */
router.post('/match-expenses', async (req, res) => {
  const { bankTransactionId, expenseIds } = req.body || {};
  if (!bankTransactionId || !Array.isArray(expenseIds) || expenseIds.length === 0) {
    return res.status(400).json({ error: 'bankTransactionId and expenseIds (non-empty array) required' });
  }
  const now = new Date().toISOString();
  const client = await pool.connect();
  try {
    const txRow = await pool.query(
      'SELECT id, type, amount FROM bank_transactions WHERE id = $1',
      [bankTransactionId]
    );
    if (txRow.rows.length === 0) {
      return res.status(404).json({ error: 'Bank transaction not found' });
    }
    const tx = txRow.rows[0];
    if (tx.type !== 'out') {
      return res.status(400).json({ error: 'Multi-expense match only applies to outgoing transactions' });
    }
    const placeholders = expenseIds.map((_, i) => `$${i + 1}`).join(', ');
    const expRows = await pool.query(
      `SELECT id, amount, vat, reconciled FROM expenses WHERE id IN (${placeholders})`,
      expenseIds
    );
    if (expRows.rows.length !== expenseIds.length) {
      return res.status(400).json({ error: 'One or more expense IDs not found' });
    }
    const alreadyReconciled = expRows.rows.find((r) => r.reconciled);
    if (alreadyReconciled) {
      return res.status(400).json({ error: 'One or more expenses are already reconciled' });
    }
    const total = expRows.rows.reduce((s, r) => s + Number(r.amount || 0) + Number(r.vat || 0), 0);
    const txAmount = Number(tx.amount);
    const diff = txAmount - total;
    if (Math.abs(diff) > RECON_TOLERANCE) {
      return res.status(400).json({
        error: 'Sum of expenses differs from transaction amount by more than 0.50 EUR',
        expected: txAmount,
        total,
        diff,
      });
    }
    const adjustmentAmount = Math.round(diff * 100) / 100;
    await client.query('BEGIN');
    await client.query(
      `UPDATE bank_transactions SET reconciled = true, reconciliation_ref_type = 'expenses', reconciliation_ref_id = NULL, reconciled_at = $1, adjustment_amount = $2 WHERE id = $3`,
      [now, adjustmentAmount, bankTransactionId]
    );
    for (const exp of expRows.rows) {
      await client.query(
        `UPDATE expenses SET reconciled = true, reconciled_at = $1, bank_transaction_id = $2 WHERE id = $3`,
        [now, bankTransactionId, exp.id]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

const ACCOUNT_TYPES = ['loan', 'accrual', 'retro', 'other'];

/** Reconcile a bank transaction to an account (no expense or invoice). For loans, accruals, retros, etc. */
router.post('/match-account', async (req, res) => {
  const { bankTransactionId, accountType, accountNote } = req.body || {};
  if (!bankTransactionId || !accountType || !ACCOUNT_TYPES.includes(accountType)) {
    return res.status(400).json({
      error: 'bankTransactionId and accountType required; accountType must be one of: loan, accrual, retro, other',
    });
  }
  const now = new Date().toISOString();
  try {
    const txRow = await pool.query(
      'SELECT id, reconciled FROM bank_transactions WHERE id = $1',
      [bankTransactionId]
    );
    if (txRow.rows.length === 0) {
      return res.status(404).json({ error: 'Bank transaction not found' });
    }
    if (txRow.rows[0].reconciled) {
      return res.status(400).json({ error: 'Bank transaction is already reconciled' });
    }
    const note = accountNote != null ? String(accountNote).trim() : null;
    await pool.query(
      `UPDATE bank_transactions SET reconciled = true, reconciliation_ref_type = 'account', reconciliation_ref_id = NULL,
       reconciled_at = $1, account_type = $2, account_note = $3, adjustment_amount = 0 WHERE id = $4`,
      [now, accountType, note || null, bankTransactionId]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Unmatch a bank transaction from its expense(s), sale, or account */
router.post('/unmatch', async (req, res) => {
  const { bankTransactionId } = req.body || {};
  if (!bankTransactionId) {
    return res.status(400).json({ error: 'bankTransactionId required' });
  }
  const client = await pool.connect();
  try {
    const r = await client.query(
      'SELECT id, reconciliation_ref_type, reconciliation_ref_id FROM bank_transactions WHERE id = $1',
      [bankTransactionId]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Bank transaction not found' });
    }
    const row = r.rows[0];
    await client.query('BEGIN');
    await client.query(
      `UPDATE bank_transactions SET reconciled = false, reconciliation_ref_type = NULL, reconciliation_ref_id = NULL, reconciled_at = NULL, adjustment_amount = 0, account_type = NULL, account_note = NULL WHERE id = $1`,
      [bankTransactionId]
    );
    if (row.reconciliation_ref_type === 'expense' && row.reconciliation_ref_id) {
      await client.query(
        `UPDATE expenses SET reconciled = false, reconciled_at = NULL, bank_transaction_id = NULL WHERE id = $1`,
        [row.reconciliation_ref_id]
      );
    } else if (row.reconciliation_ref_type === 'expenses') {
      await client.query(
        `UPDATE expenses SET reconciled = false, reconciled_at = NULL, bank_transaction_id = NULL WHERE bank_transaction_id = $1`,
        [bankTransactionId]
      );
    } else if (row.reconciliation_ref_type === 'sale' && row.reconciliation_ref_id) {
      await client.query(
        `UPDATE sales SET reconciled = false, reconciled_at = NULL WHERE id = $1`,
        [row.reconciliation_ref_id]
      );
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
