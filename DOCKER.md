# Running with Docker Compose

PostgreSQL and the admin backend run in containers. No need to install Node or Postgres on the host. Postgres is not published to the host by default (the backend reaches it on the internal network). To expose it (e.g. for `psql`), uncomment the `ports` section for the postgres service in `docker-compose.yml`.

## 1. Create `.env`

From the project root (httpdocs):

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- `DB_PASSWORD` – password for the Postgres user
- `SESSION_SECRET` – long random string for session cookies

Optional: `INIT_ADMIN_EMAIL`, `INIT_ADMIN_PASSWORD` (default: admin@ikomex.nl / changeme).

## 2. Start the stack

```bash
docker compose up -d
```

- **Postgres** listens on host port **5433** (so it does not clash with a local Postgres on 5432).
- **Backend** listens on **3080** by default. On first run it waits for the DB, runs the schema and creates the admin user, then starts the app. Set `ADMIN_PORT` in `.env` if 3080 is in use.

## 3. Use the admin

Open **http://localhost:3000** (or your server’s host and port 3000). Log in with `INIT_ADMIN_EMAIL` / `INIT_ADMIN_PASSWORD` from `.env`.

To have **admin.ikomex.nl** use this backend, point that (sub)domain at the host and proxy to `http://127.0.0.1:3000`.

## Commands

- **Logs:** `docker compose logs -f backend`
- **Stop:** `docker compose down`
- **Stop and remove DB volume:** `docker compose down -v` (data is lost)

## Data

- **Postgres data:** in Docker volume `postgres_data` (kept across `docker compose down`).
- **Uploaded expense files:** in Docker volume `server_uploads` (kept across restarts).

## Troubleshooting

- **"Password authentication failed for user ikomex"** or backend stuck on "Waiting for database...": the Postgres volume was created with a different `DB_PASSWORD` than in your current `.env`. Recreate the DB with the current password:
  ```bash
  docker compose down -v
  docker compose up -d
  ```
  (This deletes all data in the DB and uploads volumes.)

- **Port 3080 already in use:** set `ADMIN_PORT=3090` (or another free port) in `.env`.
- **Cannot access from browser:** ensure the host firewall allows the admin port (e.g. 3080). If you use **admin.ikomex.nl**, the proxy (e.g. Plesk) must forward to `http://127.0.0.1:3080`.
