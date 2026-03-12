-- El Contador Finance schema (run against DB on your chosen port, e.g. 5433)

-- Session store for connect-pg-simple (created by the library if we use createTableIfNotExists)
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar NOT NULL COLLATE "default",
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL,
  PRIMARY KEY ("sid")
);

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Customers table for storing client information
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  address text,
  phone text,
  vat_number text,
  company_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Suppliers table for storing vendor information
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  address text,
  phone text,
  vat_number text,
  company_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  vendor text NOT NULL,
  category text,
  amount numeric(12,2) NOT NULL,
  vat numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  file_name text,
  file_path text,
  reconciled boolean NOT NULL DEFAULT false,
  reconciled_at timestamptz,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Migration: Add supplier_id column if table exists without it
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text UNIQUE NOT NULL,
  customer text NOT NULL,
  customer_email text,
  customer_address text,
  issue_date date NOT NULL,
  due_date date NOT NULL,
  subtotal numeric(12,2) NOT NULL,
  vat numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL,
  description text,
  lines jsonb DEFAULT '[]',
  voided boolean NOT NULL DEFAULT false,
  voided_at timestamptz,
  reconciled boolean NOT NULL DEFAULT false,
  reconciled_at timestamptz,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  file_name text,
  file_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Integration settings: single row for dynamic Stripe/Paddle credentials
CREATE TABLE IF NOT EXISTS integration_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data jsonb NOT NULL DEFAULT '{}'
);
INSERT INTO integration_settings (id, data) VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Migration: Add external sync tracking columns to sales if they don't exist
ALTER TABLE sales ADD COLUMN IF NOT EXISTS external_id text UNIQUE;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS source text;

-- Migration: Add file columns to sales if they don't exist
ALTER TABLE sales ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS file_path text;

CREATE TABLE IF NOT EXISTS bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('in', 'out')),
  amount numeric(12,2) NOT NULL,
  reference text,
  description text NOT NULL,
  reconciled boolean NOT NULL DEFAULT false,
  reconciliation_ref_type text CHECK (reconciliation_ref_type IN ('expense', 'sale', 'expenses', 'account')),
  reconciliation_ref_id uuid,
  reconciled_at timestamptz,
  account_type text,
  account_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_reconciled ON expenses(reconciled);
CREATE INDEX IF NOT EXISTS idx_expenses_supplier ON expenses(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sales_issue_date ON sales(issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_reconciled ON sales(reconciled);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_bank_date ON bank_transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_reconciled ON bank_transactions(reconciled);

-- Migration: Adjustment amount when reconciliation balance is within 0.50 EUR
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS adjustment_amount numeric(12,2) DEFAULT 0;

-- Migration: Allow reconciliation_ref_type 'expenses' and 'account' for multi-expense match and ledger
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_reconciliation_ref_type_check') THEN
    ALTER TABLE bank_transactions DROP CONSTRAINT bank_transactions_reconciliation_ref_type_check;
  END IF;
  ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_reconciliation_ref_type_check
    CHECK (reconciliation_ref_type IN ('expense', 'sale', 'expenses', 'account'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);

-- Migration: Link expenses to bank transaction (must run after bank_transactions exists)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS bank_transaction_id uuid REFERENCES bank_transactions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_bank_transaction ON expenses(bank_transaction_id);

-- Junction table: one expense can be paid by multiple bank transactions (and one bank tx can pay multiple expenses)
CREATE TABLE IF NOT EXISTS expense_bank_transactions (
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  bank_transaction_id uuid NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  PRIMARY KEY (expense_id, bank_transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_expense_bank_tx_bank ON expense_bank_transactions(bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_expense_bank_tx_expense ON expense_bank_transactions(expense_id);

-- Expense categories for proper PnL and chart reporting
CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  default_vat_rate numeric(5,2) DEFAULT 21.00,
  account_code text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Migration: Add category_id to suppliers if not present (must run after expense_categories exists)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES expense_categories(id) ON DELETE SET NULL;

-- Migration: Add category_id and vat_rate columns to expenses if they don't exist
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES expense_categories(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2);

-- Migration: Add invoice_number for receipt/invoice reference
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_number text;

-- VAT reporting table for quarterly tracking
CREATE TABLE IF NOT EXISTS vat_quarterly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  quarter integer NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  vat_invoiced numeric(12,2) NOT NULL DEFAULT 0,
  vat_from_expenses numeric(12,2) NOT NULL DEFAULT 0,
  vat_payable numeric(12,2) NOT NULL DEFAULT 0,
  net_vat_position numeric(12,2) NOT NULL DEFAULT 0,
  submitted boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(year, quarter)
);

CREATE INDEX IF NOT EXISTS idx_vat_quarterly_year_q ON vat_quarterly_reports(year, quarter);

-- Predefined expense categories with Dutch VAT rates (legacy, see account_groups/accounts for chart of accounts)
INSERT INTO expense_categories (name, description, default_vat_rate, account_code, sort_order) VALUES
  ('Office & Software', 'Office supplies, software licenses, SaaS subscriptions', 21.00, '6000', 10),
  ('Marketing & Advertising', 'Ads, promotions, marketing campaigns', 21.00, '6100', 20),
  ('Professional Services', 'Legal, accounting, consulting fees', 21.00, '6200', 30),
  ('Travel & Transport', 'Flights, hotels, car rental, fuel', 21.00, '6300', 40),
  ('Equipment & Hardware', 'Computers, phones, office equipment', 21.00, '6400', 50),
  ('Rent & Utilities', 'Office rent, electricity, internet', 21.00, '6500', 60),
  ('Insurance', 'Business insurance premiums', 21.00, '6600', 70),
  ('Banking & Fees', 'Bank charges, transaction fees', 0.00, '6700', 80),
  ('Meals & Entertainment', 'Client meals, business entertainment', 9.00, '6800', 90),
  ('Training & Education', 'Courses, conferences, certifications', 21.00, '6900', 100),
  ('Other', 'Miscellaneous expenses', 21.00, '6999', 999)
ON CONFLICT (name) DO NOTHING;

-- Chart of accounts: groups (code ranges) and accounts (bookable lines)
CREATE TABLE IF NOT EXISTS account_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  code_min integer NOT NULL,
  code_max integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_group_id uuid NOT NULL REFERENCES account_groups(id) ON DELETE RESTRICT,
  code integer UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  default_vat_rate numeric(5,2),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_group ON accounts(account_group_id);
CREATE INDEX IF NOT EXISTS idx_accounts_code ON accounts(code);

-- Seed account groups (100-199 Assets, 200-299 Revenue, 300-399 COGS, 400-799 Expenses, 800-999 Liabilities)
INSERT INTO account_groups (name, code_min, code_max, sort_order) VALUES
  ('Assets', 100, 199, 1),
  ('Revenue/Income', 200, 299, 2),
  ('Cost of Goods Sold', 300, 399, 3),
  ('Expenses', 400, 799, 4),
  ('Liabilities & Equity', 800, 999, 5)
ON CONFLICT (name) DO NOTHING;

-- Seed accounts (reference groups by name for idempotent inserts)
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 100, 'Bank Account', 'General checking/savings', NULL, 10 FROM account_groups ag WHERE ag.name = 'Assets' AND ag.code_min = 100
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 120, 'Accounts Receivable', 'Money owed by customers', NULL, 20 FROM account_groups ag WHERE ag.name = 'Assets' AND ag.code_min = 100
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 130, 'Inventory', 'Value of goods for sale', NULL, 30 FROM account_groups ag WHERE ag.name = 'Assets' AND ag.code_min = 100
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 140, 'Fixed Assets', 'Equipment, vehicles, etc.', NULL, 40 FROM account_groups ag WHERE ag.name = 'Assets' AND ag.code_min = 100
ON CONFLICT (code) DO NOTHING;

INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 200, 'Sales Revenue', 'Income from selling goods/services', NULL, 10 FROM account_groups ag WHERE ag.name = 'Revenue/Income'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 260, 'Other Revenue', 'Non-core income', NULL, 20 FROM account_groups ag WHERE ag.name = 'Revenue/Income'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 270, 'Interest Income', 'Interest received', NULL, 30 FROM account_groups ag WHERE ag.name = 'Revenue/Income'
ON CONFLICT (code) DO NOTHING;

INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 310, 'Cost of Goods Sold (COGS)', 'Direct costs of producing goods', NULL, 10 FROM account_groups ag WHERE ag.name = 'Cost of Goods Sold'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 320, 'Direct Wages', 'Wages for direct labor', NULL, 20 FROM account_groups ag WHERE ag.name = 'Cost of Goods Sold'
ON CONFLICT (code) DO NOTHING;

INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 400, 'Advertising & Marketing', 'Ads, website costs', 21.00, 10 FROM account_groups ag WHERE ag.name = 'Expenses'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 401, 'Audit & Accountancy Fees', 'Accountant fees, Xero subscription', 21.00, 20 FROM account_groups ag WHERE ag.name = 'Expenses'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 404, 'Bank Fees', 'Bank charges, overdraft fees', 0.00, 30 FROM account_groups ag WHERE ag.name = 'Expenses'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 412, 'Consulting & Accounting', 'Professional fees', 21.00, 40 FROM account_groups ag WHERE ag.name = 'Expenses'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 425, 'Postage, Freight & Courier', 'Shipping costs', 21.00, 50 FROM account_groups ag WHERE ag.name = 'Expenses'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 429, 'General Expenses', 'Miscellaneous expenses', 21.00, 60 FROM account_groups ag WHERE ag.name = 'Expenses'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 433, 'Insurance', 'Business insurance', 21.00, 70 FROM account_groups ag WHERE ag.name = 'Expenses'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 437, 'Interest Paid', 'Interest on loans', 0.00, 80 FROM account_groups ag WHERE ag.name = 'Expenses'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 441, 'Legal Expenses', 'Solicitor fees', 21.00, 90 FROM account_groups ag WHERE ag.name = 'Expenses'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 449, 'Motor Vehicle Expenses', 'Fuel, repairs', 21.00, 100 FROM account_groups ag WHERE ag.name = 'Expenses'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 461, 'Printing & Stationery', 'Office supplies', 21.00, 110 FROM account_groups ag WHERE ag.name = 'Expenses'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 477, 'Rent', 'Business premises rent', 0.00, 120 FROM account_groups ag WHERE ag.name = 'Expenses'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 489, 'Repairs & Maintenance', 'Property or equipment repairs', 21.00, 130 FROM account_groups ag WHERE ag.name = 'Expenses'
ON CONFLICT (code) DO NOTHING;

INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 800, 'Accounts Payable', 'Money owed to suppliers', NULL, 10 FROM account_groups ag WHERE ag.name = 'Liabilities & Equity'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 820, 'Current Liability', 'Short-term debts', NULL, 20 FROM account_groups ag WHERE ag.name = 'Liabilities & Equity'
ON CONFLICT (code) DO NOTHING;
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 830, 'Sales Tax/VAT', 'Tax payable to tax authorities', NULL, 30 FROM account_groups ag WHERE ag.name = 'Liabilities & Equity'
ON CONFLICT (code) DO NOTHING;

-- Seed optional second asset account for multi-bank (secondary/credit card)
INSERT INTO accounts (account_group_id, code, name, description, default_vat_rate, sort_order)
SELECT ag.id, 101, 'Secondary Bank / Credit Card', 'Additional bank or credit card account', NULL, 15 FROM account_groups ag WHERE ag.name = 'Assets' AND ag.code_min = 100
ON CONFLICT (code) DO NOTHING;

-- Migration: Link bank_transactions to asset account (multi-bank)
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT;
UPDATE bank_transactions SET account_id = (SELECT id FROM accounts WHERE code = 100 LIMIT 1) WHERE account_id IS NULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bank_transactions' AND column_name = 'account_id') AND
     (SELECT data_type FROM information_schema.columns WHERE table_name = 'bank_transactions' AND column_name = 'account_id') = 'uuid' THEN
    ALTER TABLE bank_transactions ALTER COLUMN account_id SET NOT NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account ON bank_transactions(account_id);

-- Migration: Allow reconciliation_ref_type 'transfer' for account-to-account transfers
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_reconciliation_ref_type_check') THEN
    ALTER TABLE bank_transactions DROP CONSTRAINT bank_transactions_reconciliation_ref_type_check;
  END IF;
  ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_reconciliation_ref_type_check
    CHECK (reconciliation_ref_type IN ('expense', 'sale', 'expenses', 'account', 'transfer'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migration: Allow reconciliation_ref_type 'journal' for matching bank tx to manual journal entry
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_reconciliation_ref_type_check') THEN
    ALTER TABLE bank_transactions DROP CONSTRAINT bank_transactions_reconciliation_ref_type_check;
  END IF;
  ALTER TABLE bank_transactions ADD CONSTRAINT bank_transactions_reconciliation_ref_type_check
    CHECK (reconciliation_ref_type IN ('expense', 'sale', 'expenses', 'account', 'transfer', 'journal'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Journal: post transactions for reporting (separate from bank reconciliation)
CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  description text,
  source_ref_type text NOT NULL CHECK (source_ref_type IN ('expense', 'sale', 'bank', 'manual', 'transfer')),
  source_ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  debit_amount numeric(12,2) NOT NULL DEFAULT 0,
  credit_amount numeric(12,2) NOT NULL DEFAULT 0,
  memo text,
  CONSTRAINT journal_lines_debit_credit_check CHECK (
    (debit_amount >= 0 AND credit_amount >= 0) AND
    ((debit_amount > 0 AND credit_amount = 0) OR (debit_amount = 0 AND credit_amount > 0))
  )
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date DESC);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source ON journal_entries(source_ref_type, source_ref_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);

-- Migration: Allow source_ref_type 'transfer' for bank account-to-account transfers
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_source_ref_type_check') THEN
    ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_source_ref_type_check;
  END IF;
  ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_source_ref_type_check
    CHECK (source_ref_type IN ('expense', 'sale', 'bank', 'manual', 'transfer'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migration: Add account_id to expenses and suppliers (chart of accounts)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_account ON expenses(account_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_account ON suppliers(account_id);

-- Migration: Set expense account_id from category_id (map legacy expense_categories to accounts, default 429 General Expenses)
UPDATE expenses e
SET account_id = COALESCE(
  (SELECT a.id FROM accounts a
   JOIN expense_categories ec ON ec.id = e.category_id
   WHERE a.code = CASE
     WHEN ec.name LIKE '%Marketing%' OR ec.name LIKE '%Advertising%' THEN 400
     WHEN ec.name LIKE '%Professional%' OR ec.name LIKE '%Legal%' OR ec.name LIKE '%Accounting%' THEN 412
     WHEN ec.name LIKE '%Travel%' OR ec.name LIKE '%Transport%' OR ec.name LIKE '%Vehicle%' THEN 449
     WHEN ec.name LIKE '%Equipment%' OR ec.name LIKE '%Hardware%' THEN 429
     WHEN ec.name LIKE '%Rent%' OR ec.name LIKE '%Utilities%' THEN 477
     WHEN ec.name LIKE '%Insurance%' THEN 433
     WHEN ec.name LIKE '%Banking%' OR ec.name LIKE '%Fees%' THEN 404
     WHEN ec.name LIKE '%Meals%' OR ec.name LIKE '%Entertainment%' THEN 429
     WHEN ec.name LIKE '%Training%' OR ec.name LIKE '%Education%' THEN 429
     ELSE 429
   END LIMIT 1),
  (SELECT id FROM accounts WHERE code = 429 LIMIT 1)
)
WHERE e.category_id IS NOT NULL AND e.account_id IS NULL;

-- Migration: Set supplier account_id from category_id (same mapping, default 429)
UPDATE suppliers s
SET account_id = COALESCE(
  (SELECT a.id FROM accounts a
   JOIN expense_categories ec ON ec.id = s.category_id
   WHERE a.code = CASE
     WHEN ec.name LIKE '%Marketing%' OR ec.name LIKE '%Advertising%' THEN 400
     WHEN ec.name LIKE '%Professional%' OR ec.name LIKE '%Legal%' OR ec.name LIKE '%Accounting%' THEN 412
     WHEN ec.name LIKE '%Travel%' OR ec.name LIKE '%Vehicle%' THEN 449
     WHEN ec.name LIKE '%Rent%' OR ec.name LIKE '%Utilities%' THEN 477
     WHEN ec.name LIKE '%Insurance%' THEN 433
     WHEN ec.name LIKE '%Banking%' OR ec.name LIKE '%Fees%' THEN 404
     ELSE 429
   END LIMIT 1),
  (SELECT id FROM accounts WHERE code = 429 LIMIT 1)
)
WHERE s.category_id IS NOT NULL AND s.account_id IS NULL;

-- Single row: company/invoice details for PDF (companyName, tagline, address, vatNumber, companyNumber, email, footerLine1, footerLine2)
CREATE TABLE IF NOT EXISTS invoice_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data jsonb NOT NULL DEFAULT '{}'
);
INSERT INTO invoice_settings (id, data) VALUES (1, '{"companyName":"El Contador","tagline":"Finance Administration","address":"","vatNumber":"","companyNumber":"","email":"billing@example.com","footerLine1":"Thank you for your business.","footerLine2":"Generated by El Contador"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Expense approval: users role and hierarchy
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS hierarchy_level integer NOT NULL DEFAULT 1;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'));
  END IF;
END $$;

-- Expense approval: expenses submitter and status
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'none';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_rejected_at timestamptz;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approval_rejected_by uuid REFERENCES users(id) ON DELETE SET NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_approval_status_check') THEN
    ALTER TABLE expenses ADD CONSTRAINT expenses_approval_status_check
      CHECK (approval_status IN ('none', 'pending', 'approved', 'rejected'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_expenses_approval_status ON expenses(approval_status);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON expenses(created_by);

-- Expense approval: approval steps (who must act and who has acted)
CREATE TABLE IF NOT EXISTS expense_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  approver_level integer NOT NULL,
  approver_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  acted_at timestamptz,
  note text,
  UNIQUE(expense_id, approver_level)
);
CREATE INDEX IF NOT EXISTS idx_expense_approvals_expense ON expense_approvals(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_approvals_approver ON expense_approvals(approver_user_id);

-- Expense approval: org settings (single row)
CREATE TABLE IF NOT EXISTS approval_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  approvers jsonb NOT NULL DEFAULT '[]'
);
INSERT INTO approval_settings (id, enabled, approvers) VALUES (1, false, '[]')
ON CONFLICT (id) DO NOTHING;

-- Contact account numbers (for bank/ledger reference)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_number text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS account_number text;

-- Payees table (people/entities we pay: freelancers, refund recipients, etc.)
CREATE TABLE IF NOT EXISTS payees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  address text,
  phone text,
  vat_number text,
  company_number text,
  account_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payees_name ON payees(name);

-- Backfill bank_transaction_id on expenses that were matched via single-expense match
-- (reconciliation_ref_type = 'expense') so status shows as Paid on the Expenses page
UPDATE expenses e
SET bank_transaction_id = bt.id
FROM bank_transactions bt
WHERE bt.reconciliation_ref_type = 'expense' AND bt.reconciliation_ref_id = e.id
  AND e.bank_transaction_id IS NULL AND e.reconciled = true;
