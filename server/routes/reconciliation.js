const express = require('express');
const { pool } = require('../db/pool');
const { postTransfer, postBankToAccount, deleteTransferJournalEntry, deleteBankAccountJournalEntry } = require('../services/journal-posting');

const router = express.Router();

const RECON_TOLERANCE = 0.5;

/** Get suggested auto-matches: open bank tx paired with open expense/sale by amount (within tolerance), plus transfer pairs */
router.get('/suggestions', async (req, res) => {
  try {
    let openTxRows;
    let hasAccountId = false;
    try {
      const openTx = await pool.query(
        `SELECT id, date, type, amount, description, account_id FROM bank_transactions WHERE reconciled = false ORDER BY date DESC`
      );
      openTxRows = openTx.rows;
      hasAccountId = true;
    } catch (err) {
      if (err.code === '42703') {
        const openTx = await pool.query(
          `SELECT id, date, type, amount, description FROM bank_transactions WHERE reconciled = false ORDER BY date DESC`
        );
        openTxRows = openTx.rows;
      } else throw err;
    }

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

    for (const tx of openTxRows) {
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

    // Transfer suggestions: unreconciled pairs with different account_id, opposite type, same amount
    if (hasAccountId) {
      const openTxWithAccount = await pool.query(
        `SELECT bt.id, bt.date, bt.type, bt.amount, bt.description, bt.account_id, a.name AS account_name
         FROM bank_transactions bt
         LEFT JOIN accounts a ON a.id = bt.account_id
         WHERE bt.reconciled = false AND bt.account_id IS NOT NULL
         ORDER BY bt.date DESC`
      );
      const txByAmount = new Map();
      for (const tx of openTxWithAccount.rows) {
        const key = Math.round(Number(tx.amount) * 100) / 100;
        if (!txByAmount.has(key)) txByAmount.set(key, []);
        txByAmount.get(key).push(tx);
      }
      for (const tx of openTxWithAccount.rows) {
        if (usedTx.has(tx.id)) continue;
        const amount = Number(tx.amount);
        const candidates = txByAmount.get(Math.round(amount * 100) / 100) || [];
        for (const other of candidates) {
          if (other.id === tx.id || usedTx.has(other.id)) continue;
          if (!other.account_id || String(other.account_id) === String(tx.account_id)) continue;
          if (other.type === tx.type) continue;
          usedTx.add(tx.id);
          usedTx.add(other.id);
          suggestions.push({
            bankTransactionId: tx.id,
            bankDate: tx.date,
            bankType: tx.type,
            bankAmount: amount,
            bankDescription: tx.description,
            targetId: other.id,
            targetType: 'transfer',
            targetLabel: other.account_name || 'Other account',
            targetAmount: amount,
            pairedBankTransactionId: other.id,
          });
          break;
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
        `INSERT INTO expense_bank_transactions (expense_id, bank_transaction_id) VALUES ($1, $2) ON CONFLICT (expense_id, bank_transaction_id) DO NOTHING`,
        [targetId, bankTransactionId]
      );
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
        `INSERT INTO expense_bank_transactions (expense_id, bank_transaction_id) VALUES ($1, $2) ON CONFLICT (expense_id, bank_transaction_id) DO NOTHING`,
        [exp.id, bankTransactionId]
      );
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

/** Match multiple bank transactions to multiple expenses (sum of bank = sum of expenses, within tolerance). */
router.post('/match-bulk', async (req, res) => {
  const { bankTransactionIds, expenseIds } = req.body || {};
  if (!Array.isArray(bankTransactionIds) || bankTransactionIds.length === 0 || !Array.isArray(expenseIds) || expenseIds.length === 0) {
    return res.status(400).json({ error: 'bankTransactionIds and expenseIds (non-empty arrays) required' });
  }
  const now = new Date().toISOString();
  const client = await pool.connect();
  try {
    const txPlaceholders = bankTransactionIds.map((_, i) => `$${i + 1}`).join(', ');
    const txRows = await client.query(
      `SELECT id, type, amount, reconciled FROM bank_transactions WHERE id IN (${txPlaceholders})`,
      bankTransactionIds
    );
    if (txRows.rows.length !== bankTransactionIds.length) {
      return res.status(400).json({ error: 'One or more bank transaction IDs not found' });
    }
    const allOut = txRows.rows.every((r) => r.type === 'out');
    if (!allOut) {
      return res.status(400).json({ error: 'All selected bank transactions must be outgoing' });
    }
    const alreadyReconciled = txRows.rows.find((r) => r.reconciled);
    if (alreadyReconciled) {
      return res.status(400).json({ error: 'One or more bank transactions are already reconciled' });
    }
    const expPlaceholders = expenseIds.map((_, i) => `$${i + 1}`).join(', ');
    const expRows = await client.query(
      `SELECT id, amount, vat, reconciled FROM expenses WHERE id IN (${expPlaceholders})`,
      expenseIds
    );
    if (expRows.rows.length !== expenseIds.length) {
      return res.status(400).json({ error: 'One or more expense IDs not found' });
    }
    const expReconciled = expRows.rows.find((r) => r.reconciled);
    if (expReconciled) {
      return res.status(400).json({ error: 'One or more expenses are already reconciled' });
    }
    const bankTotal = txRows.rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const expenseTotal = expRows.rows.reduce((s, r) => s + Number(r.amount || 0) + Number(r.vat || 0), 0);
    const diff = bankTotal - expenseTotal;
    if (Math.abs(diff) > RECON_TOLERANCE) {
      return res.status(400).json({
        error: 'Sum of bank transactions and sum of expenses must match within 0.50 EUR',
        bankTotal,
        expenseTotal,
        diff,
      });
    }
    const adjustmentAmount = Math.round(diff * 100) / 100;
    await client.query('BEGIN');
    const firstTxId = bankTransactionIds[0];
    for (const tx of txRows.rows) {
      await client.query(
        `UPDATE bank_transactions SET reconciled = true, reconciliation_ref_type = 'expenses', reconciliation_ref_id = NULL, reconciled_at = $1, adjustment_amount = $2 WHERE id = $3`,
        [now, tx.id === firstTxId ? adjustmentAmount : 0, tx.id]
      );
    }
    for (const exp of expRows.rows) {
      for (const txId of bankTransactionIds) {
        await client.query(
          `INSERT INTO expense_bank_transactions (expense_id, bank_transaction_id) VALUES ($1, $2) ON CONFLICT (expense_id, bank_transaction_id) DO NOTHING`,
          [exp.id, txId]
        );
      }
      await client.query(
        `UPDATE expenses SET reconciled = true, reconciled_at = $1, bank_transaction_id = $2 WHERE id = $3`,
        [now, firstTxId, exp.id]
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

/** Match two bank transactions as a transfer (different accounts, opposite direction, same amount) */
router.post('/match-transfer', async (req, res) => {
  const { bankTransactionId, pairedBankTransactionId } = req.body || {};
  if (!bankTransactionId || !pairedBankTransactionId) {
    return res.status(400).json({ error: 'bankTransactionId and pairedBankTransactionId required' });
  }
  if (bankTransactionId === pairedBankTransactionId) {
    return res.status(400).json({ error: 'The two transactions must be different' });
  }
  const now = new Date().toISOString();
  const client = await pool.connect();
  try {
    const rows = await client.query(
      `SELECT id, type, amount, account_id, reconciled FROM bank_transactions WHERE id IN ($1, $2)`,
      [bankTransactionId, pairedBankTransactionId]
    );
    if (rows.rows.length !== 2) {
      return res.status(404).json({ error: 'One or both bank transactions not found' });
    }
    const t1 = rows.rows.find((r) => r.id === bankTransactionId);
    const t2 = rows.rows.find((r) => r.id === pairedBankTransactionId);
    if (!t1 || !t2) return res.status(404).json({ error: 'One or both bank transactions not found' });
    if (t1.reconciled || t2.reconciled) {
      return res.status(400).json({ error: 'Both transactions must be unreconciled' });
    }
    if (!t1.account_id || !t2.account_id) {
      return res.status(400).json({ error: 'Both transactions must have an account assigned' });
    }
    if (String(t1.account_id) === String(t2.account_id)) {
      return res.status(400).json({ error: 'Transactions must be from different accounts' });
    }
    if (t1.type === t2.type) {
      return res.status(400).json({ error: 'One must be in and one out' });
    }
    const amt1 = Number(t1.amount);
    const amt2 = Number(t2.amount);
    if (Math.abs(amt1 - amt2) > RECON_TOLERANCE) {
      return res.status(400).json({
        error: 'Amounts must match within 0.50 EUR',
        amount1: amt1,
        amount2: amt2,
      });
    }
    await client.query('BEGIN');
    await client.query(
      `UPDATE bank_transactions SET reconciled = true, reconciliation_ref_type = 'transfer', reconciliation_ref_id = $1, reconciled_at = $2, adjustment_amount = 0 WHERE id = $3`,
      [pairedBankTransactionId, now, bankTransactionId]
    );
    await client.query(
      `UPDATE bank_transactions SET reconciled = true, reconciliation_ref_type = 'transfer', reconciliation_ref_id = $1, reconciled_at = $2, adjustment_amount = 0 WHERE id = $3`,
      [bankTransactionId, now, pairedBankTransactionId]
    );
    const outId = t1.type === 'out' ? t1.id : t2.id;
    const inId = t1.type === 'in' ? t1.id : t2.id;
    await postTransfer(outId, inId);
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

/** GET /reconciliation/open-journal-entries - unreconciled manual journal entries with asset/liability side */
router.get('/open-journal-entries', async (req, res) => {
  try {
    const linked = await pool.query(
      "SELECT reconciliation_ref_id AS id FROM bank_transactions WHERE reconciliation_ref_type = 'journal' AND reconciliation_ref_id IS NOT NULL"
    );
    const linkedIds = new Set(linked.rows.map((r) => r.id).filter(Boolean));
    const entries = await pool.query(
    `SELECT je.id, je.date, je.description,
            jl.account_id, jl.debit_amount, jl.credit_amount, a.code AS account_code,
            ag.code_min AS account_code_min
     FROM journal_entries je
     JOIN journal_lines jl ON jl.journal_entry_id = je.id
     JOIN accounts a ON a.id = jl.account_id
     JOIN account_groups ag ON ag.id = a.account_group_id
     WHERE je.source_ref_type = 'manual'
     ORDER BY je.date DESC, je.id`
    );
    const byEntry = new Map();
    for (const row of entries.rows) {
      const eid = row.id;
      if (linkedIds.has(eid)) continue;
      if (!byEntry.has(eid)) {
        byEntry.set(eid, { id: eid, date: row.date, description: row.description, lines: [] });
      }
      byEntry.get(eid).lines.push({
        accountId: row.account_id,
        accountCode: row.account_code,
        codeMin: row.account_code_min,
        debitAmount: Number(row.debit_amount),
        creditAmount: Number(row.credit_amount),
      });
    }
    const result = [];
    for (const [eid, data] of byEntry) {
      if (data.lines.length !== 2) continue;
      const bankLine = data.lines.find((l) => l.codeMin >= 100 && l.codeMin < 200 && (l.accountCode === 100 || l.accountCode === 101));
      const otherLine = bankLine ? data.lines.find((l) => String(l.accountId) !== String(bankLine.accountId)) : data.lines[0];
      if (!otherLine) continue;
      const lineForAmount = bankLine || otherLine;
      const amount = Number(lineForAmount.debit_amount) || Number(lineForAmount.credit_amount);
      const side = otherLine.codeMin >= 800 && otherLine.codeMin <= 999 ? 'liability' : 'asset';
      result.push({
        journalEntryId: eid,
        date: data.date,
        description: data.description || 'Manual entry',
        amount: Math.round(amount * 100) / 100,
        side,
      });
    }
    res.json({ entries: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Match a bank transaction to a manual journal entry (e.g. asset purchase: Dr Asset, Cr Bank). */
router.post('/match-journal', async (req, res) => {
  const { bankTransactionId, journalEntryId } = req.body || {};
  if (!bankTransactionId || !journalEntryId) {
    return res.status(400).json({ error: 'bankTransactionId and journalEntryId required' });
  }
  const now = new Date().toISOString();
  const client = await pool.connect();
  try {
    const btRow = await client.query(
      'SELECT id, reconciled, account_id, type, amount FROM bank_transactions WHERE id = $1',
      [bankTransactionId]
    );
    if (btRow.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Bank transaction not found' });
    }
    const bt = btRow.rows[0];
    if (bt.reconciled) {
      client.release();
      return res.status(400).json({ error: 'Bank transaction is already reconciled' });
    }
    if (!bt.account_id) {
      client.release();
      return res.status(400).json({ error: 'Bank transaction has no account assigned' });
    }
    const jeRow = await client.query(
      'SELECT id, date, description, source_ref_type FROM journal_entries WHERE id = $1',
      [journalEntryId]
    );
    if (jeRow.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: 'Journal entry not found' });
    }
    if (jeRow.rows[0].source_ref_type !== 'manual') {
      client.release();
      return res.status(400).json({ error: 'Can only match to a manual journal entry' });
    }
    const linesRow = await client.query(
      `SELECT jl.account_id, jl.debit_amount, jl.credit_amount
       FROM journal_lines jl
       WHERE jl.journal_entry_id = $1`,
      [journalEntryId]
    );
    if (linesRow.rows.length !== 2) {
      client.release();
      return res.status(400).json({ error: 'Journal entry must have exactly two lines' });
    }
    const bankLine = linesRow.rows.find((l) => String(l.account_id) === String(bt.account_id));
    if (!bankLine) {
      client.release();
      return res.status(400).json({ error: 'Journal entry has no line for this bank account' });
    }
    const bankAmount = bt.type === 'in' ? Number(bankLine.debit_amount) : Number(bankLine.credit_amount);
    const txAmount = Math.round(Number(bt.amount) * 100) / 100;
    if (Math.abs(bankAmount - txAmount) > RECON_TOLERANCE) {
      client.release();
      return res.status(400).json({
        error: 'Amounts must match within 0.50 EUR',
        bankTransactionAmount: txAmount,
        journalAmount: bankAmount,
      });
    }
    const alreadyLinked = await client.query(
      "SELECT id FROM bank_transactions WHERE reconciliation_ref_type = 'journal' AND reconciliation_ref_id = $1",
      [journalEntryId]
    );
    if (alreadyLinked.rows.length > 0) {
      client.release();
      return res.status(400).json({ error: 'Journal entry is already linked to a bank transaction' });
    }
    await client.query('BEGIN');
    await client.query(
      `UPDATE bank_transactions SET reconciled = true, reconciliation_ref_type = 'journal', reconciliation_ref_id = $1, reconciled_at = $2, adjustment_amount = 0 WHERE id = $3`,
      [journalEntryId, now, bankTransactionId]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/** Reconcile a bank transaction to an account (no expense or invoice). For loans, accruals, retros, etc. */
router.post('/match-account', async (req, res) => {
  const { bankTransactionId, accountType, accountNote, ledgerAccountId } = req.body || {};
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
    if (ledgerAccountId) {
      const accRow = await pool.query(
        'SELECT id FROM accounts WHERE id = $1 AND active = true',
        [ledgerAccountId]
      );
      if (accRow.rows.length === 0) {
        return res.status(400).json({ error: 'Ledger account not found or inactive' });
      }
    }
    const note = accountNote != null ? String(accountNote).trim() : null;
    const refId = ledgerAccountId || null;
    await pool.query(
      `UPDATE bank_transactions SET reconciled = true, reconciliation_ref_type = 'account', reconciliation_ref_id = $1,
       reconciled_at = $2, account_type = $3, account_note = $4, adjustment_amount = 0 WHERE id = $5`,
      [refId, now, accountType, note || null, bankTransactionId]
    );
    if (ledgerAccountId) {
      await postBankToAccount(bankTransactionId, ledgerAccountId);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Unmatch a bank transaction from its expense(s), sale, account, or journal */
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
        `DELETE FROM expense_bank_transactions WHERE expense_id = $1 AND bank_transaction_id = $2`,
        [row.reconciliation_ref_id, bankTransactionId]
      );
      await client.query(
        `UPDATE expenses e SET reconciled = false, reconciled_at = NULL, bank_transaction_id = NULL
         WHERE e.id = $1 AND NOT EXISTS (SELECT 1 FROM expense_bank_transactions ebt WHERE ebt.expense_id = e.id)`,
        [row.reconciliation_ref_id]
      );
      await client.query(
        `UPDATE expenses e SET bank_transaction_id = (SELECT bank_transaction_id FROM expense_bank_transactions ebt WHERE ebt.expense_id = e.id LIMIT 1)
         WHERE e.id = $1 AND EXISTS (SELECT 1 FROM expense_bank_transactions ebt WHERE ebt.expense_id = e.id)`,
        [row.reconciliation_ref_id]
      );
    } else if (row.reconciliation_ref_type === 'expenses') {
      const linked = await client.query(
        `SELECT expense_id FROM expense_bank_transactions WHERE bank_transaction_id = $1`,
        [bankTransactionId]
      );
      await client.query(
        `DELETE FROM expense_bank_transactions WHERE bank_transaction_id = $1`,
        [bankTransactionId]
      );
      for (const r of linked.rows) {
        const count = await client.query(
          `SELECT COUNT(*) AS c FROM expense_bank_transactions WHERE expense_id = $1`,
          [r.expense_id]
        );
        if (Number(count.rows[0].c) === 0) {
          await client.query(
            `UPDATE expenses SET reconciled = false, reconciled_at = NULL, bank_transaction_id = NULL WHERE id = $1`,
            [r.expense_id]
          );
        } else {
          await client.query(
            `UPDATE expenses e SET bank_transaction_id = (SELECT bank_transaction_id FROM expense_bank_transactions ebt WHERE ebt.expense_id = e.id LIMIT 1) WHERE e.id = $1`,
            [r.expense_id]
          );
        }
      }
    } else if (row.reconciliation_ref_type === 'sale' && row.reconciliation_ref_id) {
      await client.query(
        `UPDATE sales SET reconciled = false, reconciled_at = NULL WHERE id = $1`,
        [row.reconciliation_ref_id]
      );
    } else if (row.reconciliation_ref_type === 'account') {
      await deleteBankAccountJournalEntry(bankTransactionId);
    } else if (row.reconciliation_ref_type === 'journal') {
      // Only unlink; do not delete the journal entry
    } else if (row.reconciliation_ref_type === 'transfer' && row.reconciliation_ref_id) {
      await deleteTransferJournalEntry(bankTransactionId, row.reconciliation_ref_id);
      await client.query(
        `UPDATE bank_transactions SET reconciled = false, reconciliation_ref_type = NULL, reconciliation_ref_id = NULL, reconciled_at = NULL, adjustment_amount = 0 WHERE id = $1`,
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
