# Casa Companion — Native Wrappers

Your existing `backend/client` HTML/JS now runs inside two native shells so you can stop fighting the browser mic sandbox.

---

## Mobile: Capacitor → Android APK

### What changed
- Added `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`
- Created `capacitor.config.ts` pointing `webDir` to `backend/client`
- Generated `android/` project with mic + Bluetooth + network permissions
- The client reads `?server=<host:port>` so the APK can reach your PC/server

### Build the APK

1. Install Android Studio + Android SDK (one-time).
2. Make sure your client changes are copied into the Android project:
   ```bash
   cd voice/v3
   npm run cap:sync
   ```
3. Open Android Studio:
   ```bash
   npm run cap:android
   ```
4. In Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**  
   The debug APK lands at:
   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

### Install & run
1. Start the voice server on your PC:
   ```bash
   cd voice/v3/backend
   # with your keys exported, then:
   uvicorn app.main:app --host 0.0.0.0 --port 8080
   ```
2. Find your PC’s local IP: `ipconfig` (e.g. `192.168.1.100`).
3. Sideload the APK onto an Android phone.
4. Open the app. It loads `index.html` from the APK assets and connects to:
   ```
   ws://localhost:8080/ws/voice-v3/...
   ```
   Because the WebView sees `localhost` as the phone, you **must** pass the server host in the launch URL. The easiest way is to edit `backend/client/app.js` before sync so the default `serverHost` is your PC IP, or add a landing page that asks for the IP.

   Quick hack for testing: change `capacitor.config.ts` to load from your PC instead of local assets:
   ```ts
   server: {
     url: 'http://192.168.1.100:8080/client/index.html',
     cleartext: true,
   },
   ```
   Then `npm run cap:sync` and rebuild. The APK will fetch the client from your PC every launch, so you can iterate without rebuilding.

---

## Desktop: Tauri → Windows .exe

### What changed
- Added `@tauri-apps/cli`
- Created `src-tauri/` with `tauri.conf.json`
- `frontendDist` points to `backend/client`
- `devUrl` points to `http://localhost:8080/client/index.html` for live dev

### Build the .exe

1. Install Rust: https://rustup.rs (one-time).
2. Run in dev mode (points at your local server):
   ```bash
   cd voice/v3
   npm run tauri:dev
   ```
3. Build the installer/executable:
   ```bash
   npm run tauri:build
   ```
   Output:
   ```
   src-tauri/target/release/CasaCompanion.exe
   src-tauri/target/release/bundle/msi/*.msi
   ```

### Note on permissions
Tauri uses the OS WebView, so `getUserMedia()` still prompts once for mic access. If you want fully native audio (no Web Audio API at all), switch to a Tauri plugin or custom Rust audio capture. This scaffold gets you out of the browser tab/app lifecycle immediately.

---

## Server side

Both wrappers hit the same FastAPI server. The new V3 endpoint is:
```
/ws/voice-v3/{device_id}?token={token}&device_type=audio&session_id={optional}
```

Make sure the server is running and reachable on the network before opening the app.

---

## Recommended dev loop

1. Iterate the HTML/JS using the desktop Tauri app (`npm run tauri:dev`).
2. When stable, run `npm run cap:sync` and rebuild the APK.
3. Sideload APK to nephews. Done.
