const { pool } = require('../db/pool');

const DEFAULT_CREDIT_ACCOUNT_CODE = 800; // Accounts Payable
const DEFAULT_EXPENSE_ACCOUNT_CODE = 429;  // General Expenses (when expense has no account_id)
const AR_ACCOUNT_CODE = 120;   // Accounts Receivable
const SALES_REVENUE_CODE = 200; // Sales Revenue
const VAT_ACCOUNT_CODE = 830;  // Sales Tax/VAT

async function getAccountIdByCode(code) {
  const r = await pool.query('SELECT id FROM accounts WHERE code = $1 AND active = true', [code]);
  if (r.rows.length === 0) return null;
  return r.rows[0].id;
}

/** Remove existing journal entry for a source ref (e.g. before re-posting an updated expense/sale). */
async function deleteJournalEntryForSource(sourceRefType, sourceRefId) {
  if (!sourceRefId) return;
  await pool.query(
    'DELETE FROM journal_entries WHERE source_ref_type = $1 AND source_ref_id = $2',
    [sourceRefType, sourceRefId]
  );
}

/** Delete journal entry for a transfer (either tx id identifies the entry). */
async function deleteTransferJournalEntry(bankTransactionId1, bankTransactionId2) {
  if (!bankTransactionId1 && !bankTransactionId2) return;
  const ids = [bankTransactionId1, bankTransactionId2].filter(Boolean);
  if (ids.length === 0) return;
  await pool.query(
    'DELETE FROM journal_entries WHERE source_ref_type = $1 AND source_ref_id = ANY($2::uuid[])',
    ['transfer', ids]
  );
}

/**
 * Post an expense to the journal: Dr Expense account, Cr Accounts Payable.
 * Call after expense create or update. If an entry already exists for this expense, it is replaced.
 */
async function postExpense(expenseId) {
  const exp = await pool.query(
    `SELECT e.id, e.date, e.vendor, e.amount, e.vat, e.account_id, a.code as account_code
     FROM expenses e
     LEFT JOIN accounts a ON a.id = e.account_id
     WHERE e.id = $1`,
    [expenseId]
  );
  if (exp.rows.length === 0) return;
  const row = exp.rows[0];
  const total = Math.round((Number(row.amount) + Number(row.vat)) * 100) / 100;
  if (total <= 0) return;

  const debitAccountId = row.account_id
    ? row.account_id
    : await getAccountIdByCode(DEFAULT_EXPENSE_ACCOUNT_CODE);
  const creditAccountId = await getAccountIdByCode(DEFAULT_CREDIT_ACCOUNT_CODE);
  if (!debitAccountId || !creditAccountId) return;

  await deleteJournalEntryForSource('expense', expenseId);

  const desc = `Expense: ${(row.vendor || '').slice(0, 100)}`;
  const je = await pool.query(
    `INSERT INTO journal_entries (date, description, source_ref_type, source_ref_id)
     VALUES ($1, $2, 'expense', $3)
     RETURNING id`,
    [row.date, desc, expenseId]
  );
  const entryId = je.rows[0].id;

  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
     VALUES ($1, $2, $3, 0), ($1, $4, 0, $3)`,
    [entryId, debitAccountId, total, creditAccountId]
  );
}

/**
 * Post a sale (invoice) to the journal: Dr Accounts Receivable, Cr Sales Revenue, Cr Sales Tax/VAT.
 * Call after sale create. If an entry already exists for this sale, it is replaced.
 */
async function postSale(saleId) {
  const sale = await pool.query(
    'SELECT id, issue_date, subtotal, vat, total, invoice_no, customer FROM sales WHERE id = $1 AND voided = false',
    [saleId]
  );
  if (sale.rows.length === 0) return;
  const row = sale.rows[0];
  const total = Math.round(Number(row.total) * 100) / 100;
  if (total <= 0) return;

  const arId = await getAccountIdByCode(AR_ACCOUNT_CODE);
  const revenueId = await getAccountIdByCode(SALES_REVENUE_CODE);
  const vatId = await getAccountIdByCode(VAT_ACCOUNT_CODE);
  if (!arId || !revenueId) return;

  await deleteJournalEntryForSource('sale', saleId);

  const desc = `Sale: ${(row.invoice_no || '')} ${(row.customer || '').slice(0, 60)}`;
  const je = await pool.query(
    `INSERT INTO journal_entries (date, description, source_ref_type, source_ref_id)
     VALUES ($1, $2, 'sale', $3)
     RETURNING id`,
    [row.issue_date, desc, saleId]
  );
  const entryId = je.rows[0].id;

  const subtotal = Math.round(Number(row.subtotal) * 100) / 100;
  const vatAmount = Math.round(Number(row.vat) * 100) / 100;

  const lines = [
    [entryId, arId, total, 0],
    [entryId, revenueId, 0, subtotal],
  ];
  if (vatAmount > 0 && vatId) {
    lines.push([entryId, vatId, 0, vatAmount]);
  }

  for (const [eid, accId, debit, credit] of lines) {
    await pool.query(
      `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
       VALUES ($1, $2, $3, $4)`,
      [eid, accId, debit, credit]
    );
  }
}

/**
 * Post a transfer between two bank accounts to the journal: Dr account (in), Cr account (out).
 * Call after match-transfer. source_ref_id = outTxId so we can find the entry on unmatch.
 */
async function postTransfer(bankTransactionOutId, bankTransactionInId) {
  const rows = await pool.query(
    `SELECT id, type, amount, account_id, date FROM bank_transactions WHERE id IN ($1, $2)`,
    [bankTransactionOutId, bankTransactionInId]
  );
  if (rows.rows.length !== 2) return;
  const outTx = rows.rows.find((r) => r.id === bankTransactionOutId);
  const inTx = rows.rows.find((r) => r.id === bankTransactionInId);
  if (!outTx || !inTx || !outTx.account_id || !inTx.account_id) return;
  const amount = Math.round(Number(outTx.amount) * 100) / 100;
  if (amount <= 0) return;
  await deleteTransferJournalEntry(bankTransactionOutId, bankTransactionInId);
  const entryDate = outTx.date;
  const desc = 'Transfer between accounts';
  const je = await pool.query(
    `INSERT INTO journal_entries (date, description, source_ref_type, source_ref_id)
     VALUES ($1, $2, 'transfer', $3)
     RETURNING id`,
    [entryDate, desc, bankTransactionOutId]
  );
  const entryId = je.rows[0].id;
  await pool.query(
    `INSERT INTO journal_lines (journal_entry_id, account_id, debit_amount, credit_amount)
     VALUES ($1, $2, $3, 0), ($1, $4, 0, $3)`,
    [entryId, inTx.account_id, amount, outTx.account_id]
  );
}

module.exports = {
  postExpense,
  postSale,
  postTransfer,
  deleteJournalEntryForSource,
  deleteTransferJournalEntry,
  getAccountIdByCode,
};
