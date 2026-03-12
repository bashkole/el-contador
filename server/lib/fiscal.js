const { pool } = require('../db/pool');

/**
 * Load fiscal config from invoice_settings. Returns { enabled, startMonth, startDay }.
 * Default: natural year (enabled: false, startMonth: 1, startDay: 1).
 */
async function getFiscalConfig() {
  const r = await pool.query('SELECT data FROM invoice_settings WHERE id = 1');
  const raw = r.rows[0]?.data || {};
  const enabled = Boolean(raw.fiscalYearEnabled);
  const startMonth = Math.min(12, Math.max(1, Number(raw.fiscalYearStartMonth) || 1));
  let startDay = Math.min(31, Math.max(1, Number(raw.fiscalYearStartDay) || 1));
  const maxDay = new Date(2024, startMonth, 0).getDate();
  if (startDay > maxDay) startDay = maxDay;
  return { enabled, startMonth, startDay };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Return { startDate, endDate } (ISO YYYY-MM-DD) for the given fiscal/calendar year number.
 * When custom fiscal: year 2025 = 2025-startMonth-startDay to day before 2026-startMonth-startDay.
 */
function getFiscalYearBounds(yearNumber, config) {
  const { enabled, startMonth, startDay } = config;
  if (!enabled || (startMonth === 1 && startDay === 1)) {
    return {
      startDate: `${yearNumber}-01-01`,
      endDate: `${yearNumber}-12-31`,
    };
  }
  const startDate = `${yearNumber}-${pad(startMonth)}-${pad(startDay)}`;
  const endYear = yearNumber + 1;
  const endDate = new Date(endYear, startMonth - 1, startDay - 1);
  const endDateStr = `${endYear}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;
  return { startDate, endDate: endDateStr };
}

/**
 * Return { startDate, endDate } for the given quarter (1-4) of the fiscal/calendar year.
 * Custom fiscal: Q1 = first 3 months of fiscal year, Q2 = next 3, etc.
 */
function getFiscalQuarterBounds(yearNumber, quarter, config) {
  const { enabled, startMonth, startDay } = config;
  if (!enabled || (startMonth === 1 && startDay === 1)) {
    const startMonthQ = (quarter - 1) * 3 + 1;
    const startDate = `${yearNumber}-${pad(startMonthQ)}-01`;
    const endMonthQ = quarter * 3;
    const endDate = new Date(yearNumber, endMonthQ, 0);
    return {
      startDate,
      endDate: `${yearNumber}-${pad(endMonthQ)}-${pad(endDate.getDate())}`,
    };
  }
  const yearStart = getFiscalYearBounds(yearNumber, config).startDate;
  const start = new Date(yearStart);
  start.setMonth(start.getMonth() + (quarter - 1) * 3);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 3);
  end.setDate(end.getDate() - 1);
  const startDate = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const endDate = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  return { startDate, endDate };
}

/**
 * Return { startDate, endDate } for the given month (1-12) of the fiscal/calendar year.
 * Month 1 = first month of fiscal year.
 */
function getFiscalMonthBounds(yearNumber, month, config) {
  const { enabled, startMonth, startDay } = config;
  if (!enabled || (startMonth === 1 && startDay === 1)) {
    const startDate = `${yearNumber}-${pad(month)}-01`;
    const endDate = new Date(yearNumber, month, 0);
    return {
      startDate,
      endDate: `${yearNumber}-${pad(month)}-${pad(endDate.getDate())}`,
    };
  }
  const yearStart = getFiscalYearBounds(yearNumber, config).startDate;
  const start = new Date(yearStart);
  start.setMonth(start.getMonth() + (month - 1));
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setDate(end.getDate() - 1);
  const startDate = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const endDate = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  return { startDate, endDate };
}

/**
 * Which fiscal year number contains the given date? Returns the start-year of that fiscal year.
 */
function getFiscalYearContainingDateSync(dateStr, config) {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const { enabled, startMonth, startDay } = config;
  if (!enabled || (startMonth === 1 && startDay === 1)) return y;
  if (m < startMonth || (m === startMonth && day < startDay)) return y - 1;
  return y;
}

module.exports = {
  getFiscalConfig,
  getFiscalYearBounds,
  getFiscalQuarterBounds,
  getFiscalMonthBounds,
  getFiscalYearContainingDateSync,
};
