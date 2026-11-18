# React Native + Expo integration

No mobile code is implemented here. When the Expo app is ready, configure the API base URL per environment:

- Android emulator: `http://10.0.2.2:8000/api/v1`
- Physical Android phone: `http://<computer-LAN-IP>:8000/api/v1` (for example `http://192.168.1.5:8000/api/v1`)
- Deployed: `https://<render-service>.onrender.com/api/v1`

For phone testing, start Laravel with `php artisan serve --host 0.0.0.0 --port 8000`, ensure the computer and phone can reach each other, and allow private-network TCP 8000 through Windows Firewall. Never use `0.0.0.0` as the client URL. Plain HTTP is suitable only for local trusted network testing; use HTTPS for deployed environments.

Example Axios client:

```js
import axios from 'axios';

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 10000,
  headers: { Accept: 'application/json' },
});

const { data } = await api.get('/messages', {
  params: { language: 'fil', category: 'daily-needs', per_page: 50 },
});
if (data.success) {
  const messages = data.data;
}
```

The response is enveloped: use `response.data.data` for records and `response.data.meta` for pagination/filter metadata. Language codes are `en`, `fil`, and `ceb`. Category filtering uses the category slug, e.g. `category=daily-needs`. `GET /messages/featured` and `/messages/emergency` are specialized lists.

## Sync and local cache

On first launch or when no local snapshot exists, fetch `/sync`, store all returned collections and `meta.content_version` locally, and immediately show locally cached content thereafter. When online, send `/sync?since=<last successful meta.generated_at>`; apply changed rows by stable IDs/UUIDs and hide rows marked `is_active: false`. Persist the new timestamp only after applying the full response successfully. Periodically fetch a full snapshot too, to recover from a missed incremental update.

Store message text and language locally and use the phone's installed text-to-speech engine without making a network request. Keep emergency phrases available offline. Cache any separately hosted image/audio files and treat absent audio as normal; the backend currently seeds metadata only and generates no fake audio. Use the versioned API base URL, handle HTTP 422 validation, 404, 429, and network/timeouts, and do not include database credentials or Supabase keys in the app.

Custom categories and words or phrases that a user adds are stored locally on that device (browser local storage on web and the Expo SQLite key-value store on Android/iOS). A custom word is associated with the selected category and language, can be spoken or removed from the board, and is not sent to Laravel. Hiding a seeded message also only hides it on the current device.
