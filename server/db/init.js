require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

/** Split SQL into single statements so tables exist before ALTERs reference them. Respects $$ ... $$ blocks. */
function splitSqlStatements(sql) {
  const out = [];
  let cur = '';
  let inDollar = false;
  let i = 0;
  while (i < sql.length) {
    if (inDollar) {
      if (sql.slice(i, i + 2) === '$$') {
        cur += '$$';
        i += 2;
        inDollar = false;
      } else {
        cur += sql[i];
        i++;
      }
      continue;
    }
    if (sql.slice(i, i + 2) === '$$') {
      cur += '$$';
      i += 2;
      inDollar = true;
      continue;
    }
    if (sql[i] === ';') {
      const stmt = cur.trim();
      if (stmt.length > 0) out.push(stmt);
      cur = '';
      i++;
      continue;
    }
    cur += sql[i];
    i++;
  }
  const last = cur.trim();
  if (last.length > 0) out.push(last);
  return out;
}

async function init() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const statements = splitSqlStatements(schema);
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const s = stmt.trim();
    if (!s) continue;
    // Skip comment-only statements (PostgreSQL would reject them)
    if (/^\s*--/.test(s) && s.replace(/--[^\n]*/g, '').replace(/\s/g, '').length === 0) continue;
    try {
      await pool.query(stmt);
    } catch (err) {
      const snippet = s.slice(0, 80).replace(/\s+/g, ' ');
      console.error(`Schema statement ${i + 1}/${statements.length} failed: ${snippet}...`);
      throw err;
    }
  }
  console.log('Schema applied.');
  try {
    await pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS lines jsonb DEFAULT '[]'");
    await pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_email text");
    await pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_address text");
    await pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided boolean NOT NULL DEFAULT false");
    await pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided_at timestamptz");
    await pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS external_id text UNIQUE");
    await pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS source text");
    await pool.query("ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS account_type text");
    await pool.query("ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS account_note text");
    await pool.query("ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT");
    await pool.query("UPDATE bank_transactions SET account_id = (SELECT id FROM accounts WHERE code = 100 LIMIT 1) WHERE account_id IS NULL");
    try {
      await pool.query("ALTER TABLE bank_transactions ALTER COLUMN account_id SET NOT NULL");
    } catch (e) { /* may already be set or no rows */ }
    await pool.query("CREATE INDEX IF NOT EXISTS idx_bank_transactions_account ON bank_transactions(account_id)");
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_reconciliation_ref_type_check') THEN
          ALTER TABLE bank_transactions DROP CONSTRAINT bank_transactions_reconciliation_ref_type_check;
        END IF;
        ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_reconciliation_ref_type_check
          CHECK (reconciliation_ref_type IN ('expense', 'sale', 'expenses', 'account', 'transfer', 'journal'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_source_ref_type_check') THEN
          ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_source_ref_type_check;
        END IF;
        ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_ref_type_check
          CHECK (source_ref_type IN ('expense', 'sale', 'bank', 'manual', 'transfer'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS expense_bank_transactions (
        expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        bank_transaction_id uuid NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
        PRIMARY KEY (expense_id, bank_transaction_id)
      );
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_expense_bank_tx_bank ON expense_bank_transactions(bank_transaction_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_expense_bank_tx_expense ON expense_bank_transactions(expense_id)');
    await pool.query(`
      INSERT INTO expense_bank_transactions (expense_id, bank_transaction_id)
      SELECT id, bank_transaction_id FROM expenses WHERE bank_transaction_id IS NOT NULL
      ON CONFLICT (expense_id, bank_transaction_id) DO NOTHING
    `);
  } catch (e) { /* columns may already exist */ }
  const bcrypt = require('bcrypt');
  const email = process.env.INIT_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.INIT_ADMIN_PASSWORD || process.env.DB_PASSWORD || 'changeme';
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = 'admin'`,
    [email, hash]
  );
  console.log('Admin user ready:', email);
  await pool.end();
}

init().catch((err) => {
  console.error(err);
  process.exit(1);
});
