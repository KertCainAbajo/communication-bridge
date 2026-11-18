# Architecture

Communication Bridge is a public, read-only Laravel REST API for AAC content. Students do not have accounts; no credentials are stored in the app or mobile client.

## Request flow

`routes/api.php` → versioned controller → validated Form Request (when query input exists) → Eloquent query/service → API Resource → `ApiResponse` envelope.

Controllers live in `app/Http/Controllers/Api/V1`. Content sync lives in `CommunicationSyncService`. Models define relationships and fillable fields; API resources whitelist public fields. API routes use the named `public-api` rate limiter. Public GET responses are JSON and CORS is configured through `CORS_ALLOWED_ORIGINS`.

Content is organized into five categories and three active language records. A message has one translation per language. Audio is optional and no sample audio is fabricated. Images/audio are metadata paths; hosting the files is a separate deployment concern.

## Offline-first contract

The app should download `/api/v1/sync` when online, save the returned collections locally, and use locally stored message text for speech when offline. Incremental sync uses `?since=<ISO-8601 timestamp>`. Deactivate content instead of hard-deleting it so incremental clients can receive inactive records as tombstones.

## Operations

Use SQLite for quick local development and PostgreSQL/Supabase for production. Render runs the backend as a Docker web service; Supabase remains the persistent database. Never put database credentials or Supabase service keys in a mobile app or public settings.
