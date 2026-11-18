# Database

The migrations are the canonical schema. Tables use PostgreSQL-compatible scalar and JSON types, foreign keys, indexes, and timestamps. UUIDs identify categories and public message records; numeric primary keys are used for internal joins.

| Table | Purpose | Main relationships |
| --- | --- | --- |
| `categories` | Ordered, active/inactive communication groups | has many messages |
| `languages` | Supported language codes and display names | has many translations/audio |
| `messages` | Stable message identity, category, flags, icon/image metadata | belongs to category; has translations, images, audio |
| `translations` | Localized title and spoken text | unique per message and language |
| `message_audio` | Optional prerecorded audio metadata | message and language foreign keys |
| `message_images` | Optional visual asset metadata | belongs to message |
| `application_settings` | JSON-valued app settings | public rows are selectively exposed |

Foreign keys cascade when a parent record is removed. Public list queries require both a message and its category to be active. Unique constraints protect category slug, language code, message UUID/slug, translation `(message_id, language_id)`, and audio `(message_id, language_id)`. Composite indexes support active ordered content queries and synchronization by `updated_at`.

Seed order is language → category → message → translation → settings. Seeders use `updateOrCreate`, so rerunning them updates known content without duplicating it. The seed data defines 69 messages and 207 translations.

For local SQLite: `php artisan migrate:fresh --seed`. For a database with existing data, use `php artisan migrate --force` in production; do not use `migrate:fresh` there.
