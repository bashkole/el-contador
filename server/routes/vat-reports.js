const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

function getQuarterDates(year, quarter) {
  const startMonth = (quarter - 1) * 3;
  const startDate = new Date(year, startMonth, 1);
  const endDate = new Date(year, startMonth + 3, 0);
  return {
    from: startDate.toISOString().slice(0, 10),
    to: endDate.toISOString().slice(0, 10),
  };
}

// Calculate VAT for a specific quarter
router.get('/quarterly', async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const quarter = parseInt(req.query.quarter) || Math.floor((new Date().getMonth() + 3) / 3);

  if (quarter < 1 || quarter > 4) {
    return res.status(400).json({ error: 'Quarter must be between 1 and 4' });
  }

  const { from, to } = getQuarterDates(year, quarter);

  // VAT from sales (to pay)
  const salesVatResult = await pool.query(
    `SELECT COALESCE(SUM(vat), 0) as total_vat,
            COALESCE(SUM(subtotal), 0) as total_net,
            COALESCE(SUM(total), 0) as total_gross,
            COUNT(*) as invoice_count
     FROM sales
     WHERE issue_date >= $1 AND issue_date <= $2
     AND voided = false`,
    [from, to]
  );

  // VAT from expenses (to claim back)
  const expensesVatResult = await pool.query(
    `SELECT COALESCE(SUM(vat), 0) as total_vat,
            COALESCE(SUM(amount), 0) as total_net,
            COUNT(*) as expense_count
     FROM expenses
     WHERE date >= $1 AND date <= $2`,
    [from, to]
  );

  // Expense breakdown by category with VAT
  const categoryBreakdown = await pool.query(
    `SELECT ec.name as category,
            COALESCE(SUM(e.amount), 0) as net_amount,
            COALESCE(SUM(e.vat), 0) as vat_amount,
            COUNT(*) as count
     FROM expenses e
     LEFT JOIN expense_categories ec ON e.category_id = ec.id
     WHERE e.date >= $1 AND e.date <= $2
     GROUP BY ec.name
     ORDER BY vat_amount DESC`,
    [from, to]
  );

  // Monthly breakdown for the quarter
  const monthlyBreakdown = await pool.query(
    `SELECT month,
            COALESCE(SUM(sales_vat), 0) as vat_invoiced,
            COALESCE(SUM(expense_vat), 0) as vat_from_expenses
     FROM (
       SELECT to_char(issue_date, 'YYYY-MM') as month, vat as sales_vat, 0 as expense_vat
       FROM sales WHERE issue_date >= $1 AND issue_date <= $2 AND voided = false
       UNION ALL
       SELECT to_char(date, 'YYYY-MM') as month, 0 as sales_vat, vat as expense_vat
       FROM expenses WHERE date >= $1 AND date <= $2
     ) combined
     GROUP BY month
     ORDER BY month`,
    [from, to]
  );

  const salesData = salesVatResult.rows[0];
  const expensesData = expensesVatResult.rows[0];

  const vatInvoiced = Number(salesData.total_vat) || 0;
  const vatFromExpenses = Number(expensesData.total_vat) || 0;
  const netVatPosition = Math.round((vatInvoiced - vatFromExpenses) * 100) / 100;
  const vatPayable = netVatPosition > 0 ? netVatPosition : 0;
  const vatReceivable = netVatPosition < 0 ? Math.abs(netVatPosition) : 0;

  res.json({
    year,
    quarter,
    period: { from, to },
    sales: {
      netAmount: Math.round(Number(salesData.total_net) * 100) / 100,
      vatAmount: Math.round(vatInvoiced * 100) / 100,
      grossAmount: Math.round(Number(salesData.total_gross) * 100) / 100,
      invoiceCount: parseInt(salesData.invoice_count) || 0,
    },
    expenses: {
      netAmount: Math.round(Number(expensesData.total_net) * 100) / 100,
      vatAmount: Math.round(vatFromExpenses * 100) / 100,
      expenseCount: parseInt(expensesData.expense_count) || 0,
    },
    vatPosition: {
      vatToPay: Math.round(vatPayable * 100) / 100,
      vatToClaim: Math.round(vatReceivable * 100) / 100,
      netPosition: netVatPosition,
      status: netVatPosition > 0 ? 'to_pay' : netVatPosition < 0 ? 'to_receive' : 'balanced',
    },
    categoryBreakdown: categoryBreakdown.rows.map(row => ({
      category: row.category || 'Uncategorized',
      netAmount: Math.round(Number(row.net_amount) * 100) / 100,
      vatAmount: Math.round(Number(row.vat_amount) * 100) / 100,
      count: parseInt(row.count) || 0,
    })),
    monthlyBreakdown: monthlyBreakdown.rows.map(row => ({
      month: row.month,
      vatInvoiced: Math.round(Number(row.vat_invoiced) * 100) / 100,
      vatFromExpenses: Math.round(Number(row.vat_from_expenses) * 100) / 100,
      netPosition: Math.round((Number(row.vat_invoiced) - Number(row.vat_from_expenses)) * 100) / 100,
    })),
  });
});

// Get VAT summary for a year (all quarters)
router.get('/yearly', async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const quarters = [];
  for (let q = 1; q <= 4; q++) {
    const { from: qFrom, to: qTo } = getQuarterDates(year, q);

    const salesResult = await pool.query(
      `SELECT COALESCE(SUM(vat), 0) as vat FROM sales
       WHERE issue_date >= $1 AND issue_date <= $2 AND voided = false`,
      [qFrom, qTo]
    );

    const expensesResult = await pool.query(
      `SELECT COALESCE(SUM(vat), 0) as vat FROM expenses
       WHERE date >= $1 AND date <= $2`,
      [qFrom, qTo]
    );

    const vatInvoiced = Number(salesResult.rows[0].vat) || 0;
    const vatFromExpenses = Number(expensesResult.rows[0].vat) || 0;
    const netPosition = Math.round((vatInvoiced - vatFromExpenses) * 100) / 100;

    quarters.push({
      quarter: q,
      period: { from: qFrom, to: qTo },
      vatInvoiced: Math.round(vatInvoiced * 100) / 100,
      vatFromExpenses: Math.round(vatFromExpenses * 100) / 100,
      netPosition,
      status: netPosition > 0 ? 'to_pay' : netPosition < 0 ? 'to_receive' : 'balanced',
    });
  }

  const totalVatInvoiced = quarters.reduce((sum, q) => sum + q.vatInvoiced, 0);
  const totalVatFromExpenses = quarters.reduce((sum, q) => sum + q.vatFromExpenses, 0);
  const totalNetPosition = Math.round((totalVatInvoiced - totalVatFromExpenses) * 100) / 100;

  res.json({
    year,
    quarters,
    totals: {
      vatInvoiced: Math.round(totalVatInvoiced * 100) / 100,
      vatFromExpenses: Math.round(totalVatFromExpenses * 100) / 100,
      netPosition: totalNetPosition,
      vatToPay: totalNetPosition > 0 ? totalNetPosition : 0,
      vatToClaim: totalNetPosition < 0 ? Math.abs(totalNetPosition) : 0,
    },
  });
});

// Get expense summary by category for PnL reports
router.get('/expense-summary', async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const from = req.query.from || `${year}-01-01`;
  const to = req.query.to || `${year}-12-31`;

  const result = await pool.query(
    `SELECT 
       COALESCE(ec.name, e.category, 'Uncategorized') as category,
       COALESCE(ec.account_code, '0000') as account_code,
       COALESCE(SUM(e.amount), 0) as net_amount,
       COALESCE(SUM(e.vat), 0) as vat_amount,
       COALESCE(SUM(e.amount + e.vat), 0) as total_amount,
       COUNT(*) as transaction_count
     FROM expenses e
     LEFT JOIN expense_categories ec ON e.category_id = ec.id
     WHERE e.date >= $1 AND e.date <= $2
     GROUP BY COALESCE(ec.name, e.category, 'Uncategorized'), COALESCE(ec.account_code, '0000')
     ORDER BY total_amount DESC`,
    [from, to]
  );

  const summary = result.rows.map(row => ({
    category: row.category,
    accountCode: row.account_code,
    netAmount: Math.round(Number(row.net_amount) * 100) / 100,
    vatAmount: Math.round(Number(row.vat_amount) * 100) / 100,
    totalAmount: Math.round(Number(row.total_amount) * 100) / 100,
    transactionCount: parseInt(row.transaction_count) || 0,
  }));

  const totals = summary.reduce((acc, row) => ({
    netAmount: acc.netAmount + row.netAmount,
    vatAmount: acc.vatAmount + row.vatAmount,
    totalAmount: acc.totalAmount + row.totalAmount,
    transactionCount: acc.transactionCount + row.transactionCount,
  }), { netAmount: 0, vatAmount: 0, totalAmount: 0, transactionCount: 0 });

  res.json({
    period: { from, to },
    categories: summary,
    totals: {
      netAmount: Math.round(totals.netAmount * 100) / 100,
      vatAmount: Math.round(totals.vatAmount * 100) / 100,
      totalAmount: Math.round(totals.totalAmount * 100) / 100,
      transactionCount: totals.transactionCount,
    },
  });
});

module.exports = router;
