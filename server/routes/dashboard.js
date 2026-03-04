const express = require('express');
const { pool } = require('../db/pool');

const router = express.Router();

function getPeriodExpr(groupBy, col) {
  const q = (x) => `date_trunc('${x}', ${col})`;
  switch (groupBy) {
    case 'quarter':
      return `to_char(${q('quarter')}::date, 'YYYY') || '-Q' || extract(quarter from ${q('quarter')})`;
    case 'year':
      return `to_char(${q('year')}::date, 'YYYY')`;
    default:
      return `to_char(${q('month')}::date, 'YYYY-MM')`;
  }
}

router.get('/summary', async (req, res) => {
  const groupBy = (req.query.groupBy || 'month').toLowerCase();
  if (!['month', 'quarter', 'year'].includes(groupBy)) {
    return res.status(400).json({ error: 'groupBy must be month, quarter, or year' });
  }
  let from = req.query.from ? new Date(req.query.from) : null;
  let to = req.query.to ? new Date(req.query.to) : null;
  if (!from || !to) {
    const now = new Date();
    to = to || new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (groupBy === 'month') {
      from = from || new Date(to.getFullYear(), to.getMonth() - 11, 1);
    } else if (groupBy === 'quarter') {
      from = from || new Date(to.getFullYear(), to.getMonth() - 9, 1);
    } else {
      from = from || new Date(to.getFullYear() - 2, 0, 1);
    }
  }
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const incomePeriodExpr = getPeriodExpr(groupBy, 'issue_date::timestamp');
  const expensePeriodExpr = getPeriodExpr(groupBy, 'date::timestamp');
  const incomeQuery = `
    SELECT period, SUM(total) AS total FROM (
      SELECT (${incomePeriodExpr}) AS period, total FROM sales
      WHERE issue_date::date >= $1 AND issue_date::date <= $2
    ) sub GROUP BY period ORDER BY period
  `;
  const expenseQuery = `
    SELECT period, SUM(amount) AS total FROM (
      SELECT (${expensePeriodExpr}) AS period, amount FROM expenses
      WHERE date >= $1 AND date <= $2
    ) sub GROUP BY period ORDER BY period
  `;

  const [incomeRows, expenseRows] = await Promise.all([
    pool.query(incomeQuery, [fromStr, toStr]),
    pool.query(expenseQuery, [fromStr, toStr]),
  ]);

  const incomeByPeriod = {};
  incomeRows.rows.forEach((r) => {
    incomeByPeriod[r.period] = Number(r.total) || 0;
  });
  const expensesByPeriod = {};
  expenseRows.rows.forEach((r) => {
    expensesByPeriod[r.period] = Number(r.total) || 0;
  });

  const allPeriods = new Set([
    ...Object.keys(incomeByPeriod),
    ...Object.keys(expensesByPeriod),
  ]);
  const periods = Array.from(allPeriods).sort().map((label) => ({
    label,
    income: incomeByPeriod[label] || 0,
    expenses: expensesByPeriod[label] || 0,
  }));

  let totalIncome = 0;
  let totalExpenses = 0;
  periods.forEach((p) => {
    totalIncome += p.income;
    totalExpenses += p.expenses;
  });
  const balance = Math.round((totalIncome - totalExpenses) * 100) / 100;

  // Cashflow on bank: sum of reconciled transaction amounts (so multi-expense matches count as one tx)
  const [incomingResult, outgoingResult] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM bank_transactions WHERE reconciled = true AND type = 'in'`
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM bank_transactions WHERE reconciled = true AND type = 'out'`
    ),
  ]);
  const cashflowIncoming = Math.round(Number(incomingResult.rows[0]?.total || 0) * 100) / 100;
  const cashflowOutgoing = Math.round(Number(outgoingResult.rows[0]?.total || 0) * 100) / 100;
  const cashflow = Math.round((cashflowIncoming - cashflowOutgoing) * 100) / 100;

  // Bank balance: sum of all bank transactions (inflows minus outflows)
  const bankBalanceResult = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE -amount END), 0) AS balance FROM bank_transactions`
  );
  const bankBalance = Math.round(Number(bankBalanceResult.rows[0]?.balance || 0) * 100) / 100;

  res.json({
    periods,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    balance,
    cashflowIncoming,
    cashflowOutgoing,
    cashflow,
    bankBalance,
    from: fromStr,
    to: toStr,
  });
});

module.exports = router;
