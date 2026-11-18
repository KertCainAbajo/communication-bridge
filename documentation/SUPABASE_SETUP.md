# Supabase PostgreSQL setup

1. Create a Supabase project and open **Project Settings → Database → Connect**.
2. Copy the database host, database name, username, and password from the connection details. Use the Session Pooler when the deployment host requires IPv4; Supabase documents pooler connection modes in its [database connections guide](https://supabase.com/docs/guides/database/connecting-to-postgres).
3. In local `backend/.env` or Render environment settings, use:

```dotenv
DB_CONNECTION=pgsql
DB_HOST=<Supabase connection host>
DB_PORT=5432
DB_DATABASE=postgres
DB_USERNAME=<Supabase connection username>
DB_PASSWORD=<Supabase database password>
DB_SSLMODE=require
```

Keep `.env` local and do not commit it. Put the same values in Render's encrypted environment variables. Never put the Supabase service-role key in Laravel public settings or the Expo app. Laravel connects using database credentials only on the backend.

After configuring the connection, verify it with `php artisan migrate:status`, then apply `php artisan migrate --force` and seed initial content with `php artisan db:seed --force`. Do not run `migrate:fresh` against production data. Test `/api/v1/health`; it reports only connected/disconnected state and does not return host, username, or password.

Use a dedicated database password and rotate it through Supabase and the deployment environment together. Ensure network access and the selected pooler mode are compatible with the Render region and IPv4/IPv6 support.
