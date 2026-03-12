require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const connectPgSimple = require('connect-pg-simple');
const { pool } = require('./db/pool');
const { requireAuth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const expensesRoutes = require('./routes/expenses');
const expenseCategoriesRoutes = require('./routes/expense-categories');
const accountGroupsRoutes = require('./routes/account-groups');
const accountsRoutes = require('./routes/accounts');
const salesRoutes = require('./routes/sales');
const bankRoutes = require('./routes/bank');
const reconciliationRoutes = require('./routes/reconciliation');
const journalRoutes = require('./routes/journal');
const invoiceConfigRoutes = require('./routes/invoice-config');
const integrationsRoutes = require('./routes/integrations');
const approvalSettingsRoutes = require('./routes/approval-settings');
const dashboardRoutes = require('./routes/dashboard');
const customersRoutes = require('./routes/customers');
const suppliersRoutes = require('./routes/suppliers');
const payeesRoutes = require('./routes/payees');
const vatReportsRoutes = require('./routes/vat-reports');
const PgSession = connectPgSimple(session);
const app = express();

// Required when behind a reverse proxy (Apache/nginx) so cookies and redirects use correct scheme/host
app.set('trust proxy', 1);

app.use(cookieParser());
app.use(express.json());

// Request logging: every request is logged so we can see traffic in docker/compose logs
function logRequest(msg) {
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] ${msg}\n`);
}
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    logRequest(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
  });
  next();
});

app.use(
  session({
    store: new PgSession({
      pool,
      createTableIfNotExists: true,
      tableName: 'session',
    }),
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/public', require('./routes/public'));
app.use('/api/expenses', requireAuth, expensesRoutes);
app.use('/api/expense-categories', requireAuth, expenseCategoriesRoutes);
app.use('/api/account-groups', requireAuth, accountGroupsRoutes);
app.use('/api/accounts', requireAuth, accountsRoutes);
app.use('/api/sales', requireAuth, salesRoutes);
app.use('/api/bank-transactions', requireAuth, bankRoutes);
app.use('/api/reconciliation', requireAuth, reconciliationRoutes);
app.use('/api/journal', requireAuth, journalRoutes);
app.use('/api/invoice-config', requireAuth, invoiceConfigRoutes);
app.use('/api/integrations', requireAuth, integrationsRoutes);
app.use('/api/approval-settings', approvalSettingsRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/customers', requireAuth, customersRoutes);
app.use('/api/suppliers', requireAuth, suppliersRoutes);
app.use('/api/payees', requireAuth, payeesRoutes);
app.use('/api/reports/vat', requireAuth, vatReportsRoutes);

const adminRoot = path.join(__dirname, '..', 'frontend', 'dist');

// Serve static assets first so JS/CSS load without going through auth (avoids MIME type errors)
app.use(express.static(adminRoot));

// Redirect unauthenticated users to login only for page requests (not for /assets/*, etc.)
function serveLoginIfNeeded(req, res, next) {
  if (req.path !== '/login' && !req.session?.userId) {
    return res.redirect('/login');
  }
  next();
}

app.use(serveLoginIfNeeded);

// All unknown routes (except /api) should fall back to index.html for React Router
app.get('*', (req, res) => {
  res.sendFile(path.join(adminRoot, 'index.html'));
});

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  process.stderr.write(`[${new Date().toISOString()}] El Contador server listening on ${HOST}:${PORT} (request logging enabled)\n`);
});
