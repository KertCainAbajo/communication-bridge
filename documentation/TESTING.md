# Local development and testing

Requirements: PHP 8.3+, Composer, and the SQLite PDO extension for the default local setup. PostgreSQL PDO support is needed for a PostgreSQL connection.

From VS Code's integrated PowerShell terminal:

```powershell
cd backend
Copy-Item .env.example .env   # only on first setup
php artisan key:generate     # only on first setup
php artisan migrate:fresh --seed
php artisan serve --host 0.0.0.0 --port 8000
```

Open `http://127.0.0.1:8000/api/v1/health` on the computer. For an Android phone, use the computer's LAN IPv4 address instead of `127.0.0.1`, for example `http://192.168.1.5:8000/api/v1/health`; both devices must be on a reachable network and Windows Firewall must allow inbound TCP 8000 on the private network. `0.0.0.0` is the server bind address and is not a browser destination.

Run automated tests from `backend`:

```powershell
php artisan test --compact
```

Useful endpoint checks:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health
Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/messages?language=fil&category=daily-needs&per_page=3'
Invoke-RestMethod http://127.0.0.1:8000/api/v1/sync
```

To inspect routes: `php artisan route:list --path=api`. To reset local content: `php artisan migrate:fresh --seed` (this deletes the local database).
