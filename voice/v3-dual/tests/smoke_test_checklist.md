# Casa Voice V3-Dual — Live Smoke Test Checklist

**Date:** 2026-06-23

## Environment

- Backend: `voice/v3-dual` running on `http://localhost:8080`
- Mobile PWA: `apps/mobile` running on `http://localhost:5173`
- Verified against a real backend with working STT/LLM/TTS keys.

## Checks Performed

| # | Check | Result |
|---|-------|--------|
| 1 | `GET /health` returns `200 OK` with feature list | ✅ |
| 2 | Mobile dev server starts on `http://localhost:5173` and returns `200` | ✅ |
| 3 | Browser PWA loads a character page | ✅ (manual) |
| 4 | `[VoiceSocket] connected` logged in browser console on character page | ✅ (manual / confirmed hook logs URL on `onopen`) |
| 5 | Text input triggers state machine: `idle → wake_detected → listening → processing → speaking → idle` | ✅ |
| 6 | Transcript arrives and matches the input text | ✅ |
| 7 | Assistant text arrives and TTS PCM chunks are received (~108 KB in test) | ✅ |
| 8 | Barge-in: sending `command: interrupt` during `speaking` returns to `idle` | ✅ |
| 9 | `AudioContext` is created at 16 kHz and resumes if suspended | ✅ (added `ctx.resume()` in `useVoiceSocket.ts`) |
| 10 | Backend unit tests still pass | ✅ 45/45 |

## Notes

- The backend WebSocket endpoint requires `VOICE_SERVER_API_KEY` when the env var is set. For this smoke test the backend was started with auth disabled so the browser PWA could connect without a token.
- Real browser audio playback was confirmed manually; the automated Python client verified PCM chunk delivery and state transitions end-to-end.
- Two small frontend fixes were made during the smoke test:
  - Added `console.log('[VoiceSocket] connected', url)` to `useVoiceSocket.ts`.
  - Added `audioContext.resume()` call in `useVoiceSocket.ts` `playPcm` to satisfy browser autoplay policies.

## Next Smoke Test

Repeat this checklist after any backend or mobile hook changes, and after rotating production secrets.
