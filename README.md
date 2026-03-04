# El Contador

Bookkeeping and expense management – expenses, sales, bank transactions, and reconciliation. Run with Docker.

## Install (first time)

1. Create a project directory and add the package:

   ```bash
   mkdir my-books && cd my-books
   npm init -y
   npm install el-contador
   ```

2. Copy the env template and set at least `DB_PASSWORD` and `SESSION_SECRET`:

   ```bash
   cp node_modules/el-contador/.env.example .env
   # Edit .env: set DB_PASSWORD and SESSION_SECRET
   ```

3. Start the app:

   ```bash
   npx el-contador
   ```

   Or without the CLI:

   ```bash
   docker compose -f node_modules/el-contador/docker-compose.yml --env-file .env up -d
   ```

4. Open the admin UI at `http://localhost:3080` (or the port in `ADMIN_PORT`). Log in with the admin user (see `.env`: `INIT_ADMIN_EMAIL` / `INIT_ADMIN_PASSWORD`, or `DB_PASSWORD` if `INIT_ADMIN_PASSWORD` is not set).

## Update

To get the latest app version:

```bash
npm update el-contador
docker compose -f node_modules/el-contador/docker-compose.yml --env-file .env up -d --build
```

Or use the CLI:

```bash
npx el-contador update
```

Your data (database and uploads) lives in Docker volumes and is not overwritten by updates.

## Commands (CLI)

- `el-contador` or `el-contador start` – start the stack (requires `.env` in current directory).
- `el-contador down` or `el-contador stop` – stop containers.
- `el-contador update` – run `npm update el-contador` then rebuild and start.

## License

MIT
