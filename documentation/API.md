# API v1

Base path: `/api/v1`. Endpoints are public GET requests. Responses use `{ "success": true|false, "message": "...", "data": ..., "meta": ... }`; validation errors use HTTP 422 and an `errors` object. Content endpoints return active records only. Rate limit defaults to 600 requests/minute/IP (`COMMUNICATION_API_RATE_LIMIT`).

## Routes

| Method/path | Purpose |
| --- | --- |
| `GET /health` | Application status and safe database connectivity status |
| `GET /categories?language=en` | Active categories in sort order with active message counts |
| `GET /categories/{slug}` | Active category metadata |
| `GET /categories/{slug}/messages?language=fil&per_page=25` | Paginated localized category content |
| `GET /messages?language=ceb&category=daily-needs` | Paginated content with optional category/flag filters |
| `GET /messages/featured?language=en` | Featured active content |
| `GET /messages/emergency?language=en` | Emergency active content |
| `GET /messages/{uuid}?language=en` | One public message with category and media metadata |
| `GET /languages` / `GET /languages/{code}` | Supported language records |
| `GET /translations?language=fil` | Paginated translations, optionally filtered by language |
| `GET /translations/{languageCode}` | Paginated translations for one language |
| `GET /application-settings` | Public settings only |
| `GET /sync?since=<ISO-8601>` | Full or incremental offline content snapshot |

`language` accepts active `en`, `fil`, or `ceb`. `category` accepts an active category slug. `is_featured` and `is_emergency` accept boolean query values. `per_page` is 1–100. Unknown/inactive language/category query values return 422. A missing or inactive resource returns 404.

## Example

`GET /api/v1/messages?language=fil&category=daily-needs&per_page=1`

```json
{
  "success": true,
  "message": "Messages retrieved successfully.",
  "data": [{
    "uuid": "...",
    "slug": "hungry",
    "category": { "slug": "daily-needs", "name": "Daily Needs" },
    "title": "Gutom",
    "message_text": "Gutom ako.",
    "translation": { "language": "fil", "title": "Gutom", "message_text": "Gutom ako." },
    "images": [],
    "audio": []
  }],
  "meta": { "language": "fil", "category": "daily-needs", "current_page": 1, "per_page": 1, "last_page": 15, "total": 15 }
}
```

Sync returns top-level `languages`, `categories`, `messages`, `translations`, `images`, and `audio` collections plus `meta.content_version`, `meta.generated_at`, `meta.incremental`, and `meta.since`. Incremental responses include deactivated changed rows; clients should use inactive rows to hide local content.

The existing `/api/health` alias remains available for the current Expo connection screen; new clients should use `/api/v1/health`.
