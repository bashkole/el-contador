# El Contador

Bookkeeping and expense management – expenses, sales, bank transactions, and reconciliation. Run with Docker.

## Install (first time)

To use **from npm**: the package must be published first (`npm publish` from the repo); then `npm install el-contador` works. **Before publishing** or to use the latest from Git: `npm install github:YOUR_ORG/el-contador` (replace with your repo URL).

You do **not** need to install PostgreSQL on the host or create a database/user manually. The first run creates everything from your `.env`: PostgreSQL runs in a container and creates the user and database automatically; the app then applies the schema and creates the admin user.

1. Create a project directory and add the package:

   ```bash
   mkdir my-books && cd my-books
   npm init -y
   npm install el-contador
   ```

2. Create `.env` with the credentials you want (these will be used to create the PostgreSQL user and database on first run):

   ```bash
   cp node_modules/el-contador/.env.example .env
   ```

   Edit `.env` and set at least:

   - **DB_PASSWORD** – password for the database (required).
   - **SESSION_SECRET** – long random string for session cookies.

   Optional: **DB_USER** (default `el_contador`), **DB_NAME** (default `el_contador_finance`). The first run will create this PostgreSQL user and database inside the container; no separate setup needed.

   Run `npx el-contador` (or `docker compose ...`) from the **same directory** that contains `.env`. If you see `Set DB_PASSWORD in .env`, create or fix `.env` in that directory.

3. Start the app (this starts PostgreSQL and the backend; on first run the DB and admin user are created):

   ```bash
   npx el-contador
   ```

   Or without the CLI:

   ```bash
   docker compose -f node_modules/el-contador/docker-compose.yml --env-file .env up -d
   ```

4. Open the admin UI at `http://localhost:3080` (or the port in `ADMIN_PORT`). Log in with the admin user: **INIT_ADMIN_EMAIL** from `.env` (default `admin@example.com`), and **INIT_ADMIN_PASSWORD** or **DB_PASSWORD** if not set.

## Deploy on another server

On a new server (VPS, dedicated, etc.):

1. Install Node.js (v18+), npm, and Docker (and Docker Compose).
2. Create a directory and install the app as above (e.g. `npm init -y`, `npm install el-contador`, copy `.env.example` to `.env`, set `DB_PASSWORD` and `SESSION_SECRET`).
3. Start with `npx el-contador` (or the `docker compose -f ...` command). The app listens on `ADMIN_PORT` (default 3080) on the host.
4. To expose it on a **subdomain or domain** (e.g. `admin.example.com`), configure a **reverse proxy** (nginx, Caddy, or Apache) on that server. The package does not install or configure nginx for you; you add the proxy config yourself. See below.

## Nginx reverse proxy (subdomain / domain)

The app is built to run behind a reverse proxy (`trust proxy` is enabled). To serve it on a subdomain (e.g. `contador.example.com`) with nginx:

1. Ensure the app is running and listening on a port (e.g. `3080`) on the same machine.
2. Create a server block for your subdomain. Example (HTTP only):

   ```nginx
   server {
       listen 80;
       server_name contador.example.com;

       location / {
           proxy_pass http://127.0.0.1:3080;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

   Adjust `server_name` and `3080` if your `ADMIN_PORT` is different.

3. Reload nginx: `sudo nginx -t && sudo systemctl reload nginx`.
4. Point DNS for `contador.example.com` to this server’s IP.
5. For HTTPS, use Let’s Encrypt (e.g. `certbot --nginx -d contador.example.com`) or add an SSL block; Certbot can add the proxy headers if needed.

The setup does **not** configure nginx automatically (no install script or config file that edits nginx). You add the server block and DNS yourself so it works with your host and domain.

## Update

To get the latest app version:

```bash
npm update el-contador
docker compose -f node_modules/el-contador/docker-compose.yml --env-file .env up -d --build
```

If `npm update` says "up to date" but a newer version is on npm (`npm view el-contador version`), install the latest explicitly then rebuild:

```bash
npm install el-contador@latest
docker compose -f node_modules/el-contador/docker-compose.yml --env-file .env up -d --build
```

Or use the CLI:

```bash
npx el-contador update
```

After a successful update, the backend log will show `el-contador-server@X.Y.Z` (that version matches the release). Your data (database and uploads) lives in Docker volumes and is not overwritten by updates.

## Commands (CLI)

- `el-contador` or `el-contador start` – start the stack (requires `.env` in current directory).
- `el-contador down` or `el-contador stop` – stop containers.
- `el-contador update` – run `npm update el-contador` then rebuild and start.

If `npx el-contador` fails (e.g. "unknown shorthand flag: 'f'"), your host may have Docker but not the Compose plugin in the expected form. Install **docker-compose** (standalone) or run Compose manually from the same directory as `.env`:

```bash
docker-compose -f node_modules/el-contador/docker-compose.yml --env-file .env up -d
```

On Ubuntu: `sudo apt install docker-compose-plugin` (V2) or the standalone `docker-compose` package.

## Publishing to npm (maintainers)

1. Create an npm account at [npmjs.com/signup](https://www.npmjs.com/signup) if needed.
2. Log in from the package root: `npm login` (username, password, email; OTP if 2FA is enabled).
3. From this directory (the package root): `npm publish --access public`.  
   `--access public` is required for unscoped packages.
4. Update `repository.url` in `package.json` to your real Git URL before publishing.
5. For later releases: bump `version` in both **package.json** (root) and **server/package.json** so the backend log shows the correct release (e.g. `el-contador-server@1.0.7`), then `npm publish` from the package root.

## License

MIT
