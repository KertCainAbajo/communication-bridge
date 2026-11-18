# communication-bridge

## Run locally

Requirements: PHP 8.3+, Composer, Node.js 22.13+ (22.x), 24.3+ (24.x), 26.x, or 27+, and Expo Go on your Android phone. The mobile app uses Expo SDK 58.

1. In one terminal, start Laravel from `backend`:

   ```powershell
   cd backend
   php artisan serve --host 0.0.0.0
   ```

2. In another terminal, start Expo from `mobile`:

   ```powershell
   cd mobile
   Copy-Item .env.example .env
   npx expo start
   ```

3. Scan the QR code with Expo Go. Use the same Wi-Fi network for your phone and computer.

To run the app in Chrome instead, start it from `mobile` with `npx expo start --web`. The browser uses `http://localhost:8000/api` from `mobile/.env`; open Chrome DevTools with **F12** to inspect it.

For a physical phone, set `EXPO_PUBLIC_API_URL` in `mobile/.env` to `http://<your-computer-LAN-IP>:8000/api` (for example, `http://192.168.1.20:8000/api`). `localhost` works only when the app runs on the same device as Laravel. Restart Expo after changing the URL. The Laravel health endpoint is `/api/health`.
