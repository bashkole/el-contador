# What’s left for you to do – Ikomex

## Why you can’t access admin anymore

The admin (admin.ikomex.nl) now uses **login + PostgreSQL + Node server**. If the Node server is not running, or admin.ikomex.nl is not pointed at it, you will not be able to log in or use the app.

---

## Checklist to get access again

### 1. PostgreSQL (on its own port, e.g. 5433)

- [ ] Install/use a Postgres instance on a port **other than 5432** (e.g. **5433**).
- [ ] Create database and user:
  - `CREATE USER ikomex WITH PASSWORD 'your-password';`
  - `CREATE DATABASE ikomex_finance OWNER ikomex;`
- [ ] Run the schema once:
  - `psql -p 5433 -U ikomex -d ikomex_finance -f server/db/schema.sql`
  - Or use `npm run init-db` (see step 3).

### 2. Environment for the Node server

- [ ] In the project: `cd server`
- [ ] Copy env file: `cp .env.example .env`
- [ ] Edit `.env` and set:
  - `DB_HOST=localhost`
  - `DB_PORT=5433` (or your port)
  - `DB_NAME=ikomex_finance`
  - `DB_USER=ikomex`
  - `DB_PASSWORD=...`
  - `SESSION_SECRET=...` (long random string)
  - Optional: `INIT_ADMIN_EMAIL=admin@ikomex.nl` and `INIT_ADMIN_PASSWORD=...` for the first user

### 3. Create tables and first admin user

- [ ] In `server/`: `npm install`
- [ ] Run: `npm run init-db`
- [ ] Note the admin email/password (from `.env` or default `admin@ikomex.nl` / `changeme`).

### 4. Start the admin server and keep it running

- [ ] In `server/`: `npm start` (listens on port 3000 by default).
- [ ] Run this under a process manager (e.g. systemd, PM2) so it keeps running and restarts after reboot.

### 5. Point admin.ikomex.nl at the Node app

- [ ] In Plesk (or your reverse proxy), set the **admin.ikomex.nl** subdomain to proxy to `http://127.0.0.1:3000` (or the port in `server/.env`).
- [ ] Or point the document root of admin.ikomex.nl to a proxy that forwards to that port.
- [ ] For batch expense import (30+ files): in the proxy, set upload body limit to at least 35MB (e.g. nginx `client_max_body_size 35M;`, Apache `LimitRequestBody 36700160`). Batch files are limited to 1MB each.

### 6. Log in

- [ ] Open **https://admin.ikomex.nl**
- [ ] You should see the login page; use the email/password from step 3.

---

## Quick test without the subdomain

- Run in `server/`: `npm start`
- Open **http://localhost:3000** (or **http://your-server-ip:3000**) and log in with the same credentials.
- If that works, the remaining issue is only DNS/hosting (step 5).

---

## Main site (ikomex.nl)

The main landing page is static (`index.html`). It does **not** depend on the Node server. If you can’t access the main site, that’s a different issue (e.g. domain or hosting).
