# Ikomex Admin API

Backend for admin.ikomex.nl: session-based auth and PostgreSQL storage for expenses, sales, bank transactions, and reconciliation.

## PostgreSQL on a different port

To avoid conflicting with an existing Postgres on 5432, use a second instance or a separate cluster on another port (e.g. 5433).

Example (Linux, extra instance on 5433):

- Install Postgres and create a cluster: `pg_createcluster 16 ikomex -p 5433`
- Start it: `pg_ctlcluster 16 ikomex start`
- Create DB and user:
  - `sudo -u postgres psql -p 5433`
  - `CREATE USER ikomex WITH PASSWORD 'your-password';`
  - `CREATE DATABASE ikomex_finance OWNER ikomex;`
  - `\q`

Then set in `.env`:

- `DB_PORT=5433`
- `DB_HOST=localhost`
- `DB_NAME=ikomex_finance`
- `DB_USER=ikomex`
- `DB_PASSWORD=your-password`

## Setup

1. Copy `.env.example` to `.env` and set `DB_*`, `SESSION_SECRET`, and optionally `INIT_ADMIN_EMAIL` / `INIT_ADMIN_PASSWORD`.
2. Create the database and run schema + first user:
   - `npm install`
   - `npm run init-db`
3. Start the server: `npm start` (listens on `PORT`, default 3000).

Point your subdomain at this app (reverse proxy to `http://127.0.0.1:3080` or your ADMIN_PORT). See the root README for an nginx example. First login with the email/password from step 2.

### 413 Payload Too Large on file upload

If users get **413** when uploading receipt images (e.g. on mobile), the request is being rejected by the **web server** (Apache/nginx) before it reaches Node, so the backend will not log the request.

- **Apache**: In the vhost or `.htaccess`, set `LimitRequestBody` high enough (e.g. `LimitRequestBody 10485760` for 10MB). Default is often 1MB or less.
- **nginx**: In server/location, set `client_max_body_size 10M;` (or higher). Default is 1M.

The app allows uploads up to 10MB (expenses/sales); ensure the proxy limit is at least that.

## API (all under `/api`, require session except auth)

- `POST /api/auth/login` – body: `{ email, password }`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET/POST /api/expenses` – POST: multipart (date, vendor, category, amount, vat, notes, optional file)
- `GET /api/expenses/:id/file` – download attached receipt
- `GET/POST /api/sales`
- `GET/POST /api/bank-transactions`
- `POST /api/reconciliation/match` – body: `{ bankTransactionId, targetId, targetType }` (`targetType`: `expense` or `sale`)
