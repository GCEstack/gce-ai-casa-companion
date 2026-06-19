# Casa Voice V3 — Backlog / Unfinished Work

## Latency & Performance
- [ ] Measure and optimize the 2–3 s end-to-end response time.
- [ ] Add per-step timing logs (VAD → STT → LLM → TTS first byte).
- [ ] Evaluate faster STT models (Whisper `turbo`, local `faster-whisper`).
- [ ] Evaluate faster LLM on OpenRouter for lower time-to-first-token.
- [ ] Stream TTS audio earlier (start playback on first PCM chunk instead of buffering).
- [ ] Load Silero VAD eagerly and confirm it switches on (currently stuck on energy gate).
- [ ] Add local TTS fallback (e.g. Kokoro / Piper) for offline use and OpenRouter outages.

## Phone / Bluetooth Speaker Experience
- [ ] Full end-to-end test with phone-as-mic + Bluetooth speaker.
- [ ] Confirm Media Session API handles Bluetooth headset buttons (play/pause → interrupt).
- [ ] Add phone-page battery / connection status indicator.
- [ ] Keep phone screen awake while acting as audio device.
- [ ] Add reconnect logic when phone drops Wi-Fi or switches apps.
- [ ] Test with speaker connected directly to PC (USB audio or Bluetooth dongle) as an alternative path.

## Wake Word & Listening
- [x] Replace STT-based wake detection with a local wake-word engine (Porcupine v1.x).
- [ ] Train and ship a custom **"Hey Casa"** `.ppn` model (currently defaults to built-in "porcupine").
- [ ] Test wake-word detection with real human voice at typical speaking distance.
- [ ] Add configurable wake-word sensitivity.
- [ ] Add a "push to talk" mode for noisy rooms.
- [ ] Fine-tune VAD thresholds per environment (quiet room vs. kitchen noise).

## Packaging & Deployment
- [ ] Add auto-update check to the desktop shortcut (re-run `pip install -e .` on startup).
- [ ] Replace the open PowerShell window with a system-tray icon + menu.
- [ ] Build a true Windows installer (.msi / Inno Setup) that includes Python if missing.
- [ ] Create a signed PWA / installable phone shortcut for `audio-device.html`.
- [ ] Add optional cloud tunnel (ngrok / localhost.run) for out-of-home access.
- [ ] Windows service mode so it starts automatically on boot.

## NFC, Hardware & Integrations
- [ ] Wire NFC tags to trigger scenes (`scene_bedtime`, `scene_greeting`, `scene_joke`).
- [ ] Add `/api/tap` handling for NFC tag UID → action mapping in config.
- [ ] Build the ESP32 firmware for a dedicated speaker/mic box.
- [ ] Add push-to-talk physical button support (USB HID or Bluetooth).

## Commands, Characters & State
- [ ] Make volume/scene commands work reliably from voice and dashboard.
- [ ] Add more characters and confirm persona switching in LLM prompt.
- [ ] Persist session history to Supabase (currently table exists, full persistence not verified).
- [ ] Add multi-room / multi-session support from one server.
- [ ] Improve barge-in robustness during TTS playback.

## Testing & Quality
- [ ] Add unit tests for `commands.py`, wake-phrase stripping, and VAD.
- [ ] Add automated end-to-end test using synthetic audio through the WebSocket.
- [ ] Run a full browser + phone + dashboard smoke test.
- [ ] Add linting / formatting checks to CI.

## Docs
- [ ] Grandmother-friendly printed quick-start card (laminate-friendly).
- [ ] Troubleshooting guide (no mic, no sound, firewall, wrong IP, OpenRouter errors).
- [ ] Video walkthrough under 2 minutes.
