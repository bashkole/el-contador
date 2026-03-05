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

-- Migration: Add customer_id column if table exists without it
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;

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

-- Predefined expense categories with Dutch VAT rates
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
