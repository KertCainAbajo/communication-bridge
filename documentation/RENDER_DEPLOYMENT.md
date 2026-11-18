# Render deployment

The repository root `render.yaml` defines a Docker web service whose root directory is `backend`, uses the backend Dockerfile, and checks `/api/v1/health`. Connect the repository to Render and create the Blueprint. Set all values marked `sync: false` in the service environment before the first deploy:

- `APP_KEY`: generate locally with `php artisan key:generate --show` (run from `backend`); paste the generated value into Render, never into source control.
- `APP_URL`: the deployed `https://<service>.onrender.com` URL.
- `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`: Supabase connection values; also ensure `DB_PORT=5432`, `DB_DATABASE=postgres`, `DB_SSLMODE=require`.

The container listens on Render's `PORT` (defaults to 10000), performs `php artisan migrate --force`, caches config/routes/views, and starts Apache. The container build runs Composer production install. For a separate manual migration, use a deploy shell or an approved one-off environment and run `php artisan migrate --force`; do not use `migrate:fresh` on production.

After deployment, verify `https://<service>.onrender.com/api/v1/health`, then `/api/v1/categories` and `/api/v1/sync`. Configure `CORS_ALLOWED_ORIGINS` to a comma-separated list of allowed web origins when the API is consumed by a browser. Native Android requests are not governed by browser CORS.

## Free plan behavior

Render's current [free service limitations](https://render.com/docs/free) include sleeping after 15 minutes without inbound traffic; the next request may wait about a minute for startup. The service can restart, has ephemeral local storage, and free Render Postgres expires after 30 days. This app uses external Supabase for durable data. Keep communication boards and speech text cached locally so essential AAC use continues when the API is asleep or unreachable. Consider a paid always-on service for lower latency and production reliability.
