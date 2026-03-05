require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./pool');

async function init() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Schema applied.');
  try {
    await pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS lines jsonb DEFAULT '[]'");
    await pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_email text");
    await pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_address text");
    await pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided boolean NOT NULL DEFAULT false");
    await pool.query("ALTER TABLE sales ADD COLUMN IF NOT EXISTS voided_at timestamptz");
    await pool.query("ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS account_type text");
    await pool.query("ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS account_note text");
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_reconciliation_ref_type_check') THEN
          ALTER TABLE bank_transactions DROP CONSTRAINT bank_transactions_reconciliation_ref_type_check;
        END IF;
        ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_reconciliation_ref_type_check
          CHECK (reconciliation_ref_type IN ('expense', 'sale', 'expenses', 'account'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
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
