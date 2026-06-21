# Casa Companion - Mobile/Browser Stability Audit Report

**Scope:** `src/`, `Casa Companion/voice-agent/` (frontend + relay)  
**Focus:** Mobile Safari, Chrome, PWA behavior causing crashes or degradation  
**Date:** 2025-06-18

---

## 1. Microphone Permission Handling

### Issue 1.1 - No Permission State Query or Re-Request Flow
- **File:** `src/hooks/useVoiceChat.ts:587`
- **Line:** `const stream = await navigator.mediaDevices.getUserMedia({ audio: true });`
- **What is wrong:** The app calls `getUserMedia()` directly without first checking `navigator.permissions.query({ name: 'microphone' })`. If the user denies permission on iOS Safari, there is no UI path to re-request. Safari resets mic permissions on every page reload in some iOS versions, so the user gets stuck in a deny loop with no way to recover except manually digging into Settings > Safari > Microphone.
- **Affected:** iOS Safari, Chrome Android
- **Severity:** **P1**

### Issue 1.2 - Double Permission Prompt (Wake Word + Recording)
- **File:** `src/hooks/useVoiceChat.ts:645`, `src/hooks/useVoiceChat.ts:587`
- **What is wrong:** When wake-word is enabled (Peter's test hosts), `startWakeListening()` creates a `webkitSpeechRecognition` instance with `continuous = true`. This triggers a mic permission request. When the user then taps the mic, `startRecording()` calls `getUserMedia()` which triggers a **second** permission request. On iOS Safari, the user sees two back-to-back permission dialogs for the same app, which is confusing and often leads to denial.
- **Affected:** iOS Safari, Chrome (when wake word enabled)
- **Severity:** **P1**

### Issue 1.3 - NotAllowedError Not Handled Specifically
- **File:** `src/hooks/useVoiceChat.ts:628-639`
- **What is wrong:** The catch block checks `e instanceof DOMException` and uses `e.name`, but there is no explicit branch for `NotAllowedError` that shows a "Go to Settings" instruction or a re-request button. The generic message `Mic error - NotAllowedError: ...` is displayed, which is opaque to children/parents.
- **Affected:** All mobile browsers
- **Severity:** **P2**

### Issue 1.4 - No HTTPS Check for getUserMedia
- **File:** `src/hooks/useVoiceChat.ts:575-587`
- **What is wrong:** `getUserMedia()` requires a secure context (HTTPS or localhost). If the app is loaded over HTTP on a local network (e.g., testing on a home LAN), the call will silently fail with `NotAllowedError`. There is no pre-check for `window.isSecureContext` or a helpful error message.
- **Affected:** All mobile browsers (non-HTTPS deployments)
- **Severity:** **P2**

---

## 2. Autoplay Policy

### Issue 2.1 - No Landing-Page Audio Unlock Button
- **File:** `src/pages/Landing.tsx:80-117`
- **What is wrong:** The landing page has no explicit "Tap to start" or "Enable audio" button. On iOS Safari and Chrome Android, the AudioContext is locked until a user gesture. `unlockAudioContext()` is only called inside `startRecording()` (line 550), which means if the first interaction is a **wake word** (not a tap), the AudioContext may never be unlocked and TTS playback will fail. The app relies on the user tapping the mic first, which is an unreliable assumption for a voice-first product.
- **Affected:** iOS Safari, Chrome Android
- **Severity:** **P1**

### Issue 2.2 - Autoplay Videos May Fail Before User Gesture
- **File:** `src/components/CharacterShowcase.tsx:30-47`
- **What is wrong:** Both idle and speaking `<video>` elements have `autoPlay muted loop playsInline`. On iOS Safari, muted autoplay is allowed, but **only after the first user gesture** has occurred on the page. If the user navigates directly to `/character/:slug` (e.g., from a PWA home-screen icon or a shared link), the videos may not start playing, leaving a blank black box. The `play().catch(() => {})` at line 19/22 silently swallows this failure.
- **Affected:** iOS Safari (direct deep-link navigation)
- **Severity:** **P1**

### Issue 2.3 - Speech Synthesis Voices Not Loaded Before Selection
- **File:** `src/hooks/useVoiceChat.ts:251-256`
- **What is wrong:** `window.speechSynthesis.getVoices()` is called synchronously. On Safari (both macOS and iOS), the voices array is **empty** until the `voiceschanged` event fires. The app does not listen for this event, so `preferred` is always `undefined` on first load, and the utterance falls back to the default system voice—often not the intended English voice. This can cause the character to speak in the wrong language or with a robotic voice.
- **Affected:** Safari (macOS and iOS), Chrome iOS
- **Severity:** **P2**

### Issue 2.4 - TTS Audio Playback Fails if AudioContext Never Unlocked
- **File:** `src/hooks/useVoiceChat.ts:269-314`
- **What is wrong:** `playAudioResponse()` tries Web Audio API first, then HTMLAudioElement, then browser speech. But if the user has never tapped the mic (e.g., wake-word triggered or text-only input), the AudioContext is still `suspended` and the HTMLAudioElement path will also be blocked by autoplay policy on mobile. The final fallback (`speakWithWebSpeech`) is the only one that might work, but it is a degraded experience.
- **Affected:** iOS Safari, Chrome Android
- **Severity:** **P1**

---

## 3. Backgrounding / Page Lifecycle

### Issue 3.1 - No visibilitychange Handler for Mic or Audio
- **File:** `src/hooks/useVoiceChat.ts` (missing)
- **What is wrong:** The app does **not** listen for `document.visibilitychange`. When the user switches tabs or minimizes the PWA on iOS Safari:
  - `MediaRecorder` may continue recording (or be paused by the browser without emitting `onstop`), leaving the mic LED on and draining battery.
  - `webkitSpeechRecognition` (wake word) continues running in the background, consuming CPU and mic.
  - The `autoStopTimerRef` (10-second timeout) may be throttled by iOS to 30s+ intervals, so recordings never stop.
  - The `setInterval` session timer (line 176) continues running, draining battery.
- **Affected:** iOS Safari, Chrome Android, PWA standalone
- **Severity:** **P0** (battery drain + potential crash from stale mic lock)

### Issue 3.2 - No pagehide / beforeunload Cleanup
- **File:** `src/hooks/useVoiceChat.ts` (missing)
- **What is wrong:** There is no `window.addEventListener('pagehide', ...)` or `beforeunload` handler. On iOS Safari, `pagehide` is the reliable signal for tab closure (not `beforeunload`). Without it, `MediaRecorder` and `SpeechRecognition` may not be cleaned up, leaving orphaned audio sessions that prevent the mic from working on the next page load until the user force-quits Safari.
- **Affected:** iOS Safari
- **Severity:** **P1**

### Issue 3.3 - WebSocket Reconnects Blindly in Background
- **File:** `Casa Companion/voice-agent/dashboard/lib/useCasaWebSocket.ts:97-103`
- **What is wrong:** The dashboard WebSocket hook reconnects every 3 seconds (`reconnectIntervalMs = 3000`) on close. When the tab is backgrounded, this reconnection loop continues, wasting battery and CPU. There is no `visibilitychange` check to pause reconnection while the tab is hidden.
- **Affected:** Chrome, Safari (dashboard only)
- **Severity:** **P2**

### Issue 3.4 - Wake-Word Restart Timer Fires While Backgrounded
- **File:** `src/hooks/useVoiceChat.ts:665-667`
- **What is wrong:** The wake-word backoff timer (`setTimeout(..., backoff)`) can fire while the app is backgrounded. If the user denied mic permission earlier, the timer will attempt `startWakeListening()` again, which may trigger a permission prompt while the user is in another app—a jarring experience that Apple can reject from the App Store (even for PWAs).
- **Affected:** iOS Safari PWA
- **Severity:** **P1**

---

## 4. PWA Specifics

### Issue 4.1 - Service Worker skipWaiting Kills Active Voice Sessions
- **File:** `vite.config.ts:21`
- **Line:** `skipWaiting: true`
- **What is wrong:** When a new build is deployed, `skipWaiting: true` forces the new service worker to activate immediately. If a child is mid-conversation (mic open, AudioContext running, TTS playing), the service worker takeover will reload the page, abruptly terminating the session and potentially leaving the audio session in a bad state. This is a catastrophic UX for a voice agent.
- **Affected:** All PWA installs (iOS Safari, Chrome Android)
- **Severity:** **P0**

### Issue 4.2 - Cache Size Exceeds iOS Safari Limits
- **File:** `vite.config.ts:19-20`, `README.md:183`
- **What is wrong:** The Workbox globPatterns cache `**/*.mp4` (character videos). The README states the precache is ~150+ MB. iOS Safari PWAs have a hard ~50 MB offline storage quota per origin in many configurations. When the quota is exceeded, the service worker fails to install, the PWA "Add to Home Screen" prompt may fail, and previously cached assets can be evicted—breaking offline functionality.
- **Affected:** iOS Safari PWA
- **Severity:** **P0** (PWA installation fails or cache thrashes)

### Issue 4.3 - No Offline Graceful Degradation for Voice
- **File:** `src/hooks/useVoiceChat.ts:338-388`, `src/hooks/useVoiceChat.ts:456-468`
- **What is wrong:** The OpenAI TTS and Deepgram STT fetch calls have no offline check. If the user is in airplane mode or has no signal, the `fetch()` will hang for 25 seconds (FETCH_TIMEOUT), then throw. The error message is generic ("Voice response failed"). There is no offline banner, no cached "I can't hear you right now" message, and no disabling of the mic button when `navigator.onLine === false`.
- **Affected:** All PWA installs
- **Severity:** **P1**

### Issue 4.4 - manifest.json Missing scope and id
- **File:** `public/manifest.json`
- **What is wrong:** The manifest lacks `scope` and `id` fields. Without `scope`, iOS Safari may infer an incorrect scope if the app is served from a subdirectory (e.g., Vercel preview deployments). Without `id`, browser updates may treat the PWA as a new app, losing home-screen icon data and localStorage. This is a forward-compatibility issue.
- **Affected:** iOS Safari, Chrome
- **Severity:** **P2**

---

## 5. Touch / Scroll Performance

### Issue 5.1 - Two Simultaneous Video Elements Cause GPU Memory Pressure
- **File:** `src/components/CharacterShowcase.tsx:30-47`
- **What is wrong:** Two `<video>` elements are mounted in the DOM simultaneously (idle + speaking), with one `opacity-0` but still `autoPlay loop`. On low-end mobile devices (iPhone SE, budget Android), both video decoders run in parallel, consuming ~2x GPU memory. This causes:
  - Tab crashes ("A problem occurred with this webpage" on iOS Safari)
  - Frame drops during conversation
  - Thermal throttling and battery drain
- **Affected:** iOS Safari (low-memory devices), budget Android
- **Severity:** **P0** (tab crash on iPhone SE / similar)

### Issue 5.2 - scrollIntoView({ behavior: 'smooth' }) on Every Message
- **File:** `src/components/ChatTranscript.tsx:15`
- **What is wrong:** `bottomRef.current?.scrollIntoView({ behavior: 'smooth' })` is called in a `useEffect` triggered by every `messages` array change. On iOS Safari, `smooth` behavior inside an `overflow-y-auto` flex container is poorly optimized and can cause layout thrashing. If messages arrive rapidly (e.g., streaming), multiple overlapping scroll animations fight each other, causing visible jank.
- **Affected:** iOS Safari, Chrome Android
- **Severity:** **P1**

### Issue 5.3 - Backdrop-Blur on Fixed Input Bar
- **File:** `src/components/InputBar.tsx:42`, `src/components/BottomNav.tsx:17`
- **What is wrong:** Both `InputBar` and `BottomNav` use `backdrop-blur-md`/`backdrop-blur` with `fixed`/`sticky` positioning. Backdrop-filter on fixed elements is one of the most expensive CSS operations on mobile Safari. During active conversation (when the transcript is scrolling and videos are playing), this causes dropped frames and input latency.
- **Affected:** iOS Safari, Chrome Android
- **Severity:** **P1**

### Issue 5.4 - Video Play Errors Silently Swallowed
- **File:** `src/components/CharacterShowcase.tsx:19,22`
- **What is wrong:** `idleRef.current?.play().catch(() => {})` and `speakingRef.current?.play().catch(() => {})` silently discard all play errors. If the video format is unsupported (e.g., H.265/HEVC instead of H.264), the network fails, or the GPU is out of memory, the user sees a blank black character with no error feedback.
- **Affected:** All mobile browsers
- **Severity:** **P2**

---

## 6. Browser Compatibility

### Issue 6.1 - MediaRecorder MIME Type Order Favors WebM on Safari
- **File:** `src/hooks/useVoiceChat.ts:66-72`
- **What is wrong:** `getMimeType()` checks `audio/webm` first. On some Safari versions (iOS 16.x), `MediaRecorder.isTypeSupported('audio/webm')` returned `true` even though Safari's MediaRecorder actually produced MP4 containers. This caused Deepgram to receive an MP4 file labeled as `audio/webm`, resulting in a 400 Bad Request or silent transcription failure. The fix is to prefer `audio/mp4` on Safari/WebKit.
- **Affected:** Safari iOS 16.x
- **Severity:** **P1**

### Issue 6.2 - speechSynthesis.cancel() + Immediate speak() Race on Safari
- **File:** `src/hooks/useVoiceChat.ts:246,266`
- **What is wrong:** `window.speechSynthesis.cancel()` is immediately followed by `window.speechSynthesis.speak(utter)`. On iOS Safari, if the audio session was interrupted (e.g., by a phone call, alarm, or another app), `cancel()` may not clear the internal queue synchronously, and `speak()` may be ignored or throw an `InvalidStateError`. The app has no retry or error handling for this case.
- **Affected:** iOS Safari
- **Severity:** **P2**

### Issue 6.3 - maximum-scale=1.0 Causes Zoom Lock on Input Focus
- **File:** `index.html:5`
- **What is wrong:** The viewport meta tag includes `maximum-scale=1.0, user-scalable=no`. On iOS Safari, focusing a text input auto-zooms the page to the input. With `maximum-scale=1.0`, Safari prevents this zoom, which can leave the input off-screen and the keyboard appearing over it. This is an accessibility violation and causes input UX degradation.
- **Affected:** iOS Safari
- **Severity:** **P2**

### Issue 6.4 - SpeechRecognition.lang Hardcoded to en-US
- **File:** `src/hooks/useVoiceChat.ts:82`, `src/hooks/useVoiceChat.ts:651`
- **What is wrong:** `recognition.lang = 'en-US'` is hardcoded for both browser STT and wake-word recognition. On non-English devices (e.g., Spanish or Italian locale), Safari's `webkitSpeechRecognition` may fail to start or return garbage results because the language pack mismatch confuses the engine. There is no `navigator.language` fallback.
- **Affected:** Safari (non-English locales)
- **Severity:** **P2**

---

## 7. Battery Drain

### Issue 7.1 - Wake Word Keeps Microphone Active Indefinitely
- **File:** `src/hooks/useVoiceChat.ts:649,800-815`
- **What is wrong:** When the user is on the Character Detail page, `isWakeWordEnabled()` is true, and `turnState` is `idle` or `speaking`, the app auto-starts `webkitSpeechRecognition` with `continuous = true`. This keeps the microphone hardware active 100% of the time. On iOS, this is the #1 battery drain indicator and triggers iOS's "This webpage is using significant energy" banner. The app provides no visual indicator that the mic is always-on beyond a tiny "Listening for wake word..." text.
- **Affected:** iOS Safari, Chrome Android
- **Severity:** **P0** (rapid battery drain, thermal issues, OS warnings)

### Issue 7.2 - MediaRecorder start(100) Generates 100 Blob/s
- **File:** `src/hooks/useVoiceChat.ts:621`
- **What is wrong:** `recorder.start(100)` fires `ondataavailable` every 100 milliseconds. For a 10-second recording, this creates 100 Blob objects. Each Blob is a new memory allocation. On low-end devices, this causes frequent GC pauses and memory pressure. The standard pattern for voice recording is `start()` (no timeslice) or a much larger slice (e.g., 1000ms), and only use `stop()` to finalize.
- **Affected:** All mobile browsers (low-end devices)
- **Severity:** **P1**

### Issue 7.3 - AudioContext Leaked on Character Switch
- **File:** `src/hooks/useVoiceChat.ts:225-227`, `src/hooks/useVoiceChat.ts:817`
- **What is wrong:** `audioContextRef.current` is created once per `useVoiceChat` hook instance and **never closed**. When the user navigates back to Landing and selects a different character, the old `CharacterDetail` unmounts but the `AudioContext` remains alive. Safari has a hard limit of ~4-6 simultaneous AudioContexts per tab. After switching characters 4-6 times, `new AudioContext()` will fail with `NotSupportedError`, breaking all TTS playback.
- **Affected:** Safari (macOS and iOS)
- **Severity:** **P0** (TTS completely breaks after 4-6 character switches)

### Issue 7.4 - Blob URL Leaked on Navigation Away
- **File:** `src/hooks/useVoiceChat.ts:292,299,308`
- **What is wrong:** `URL.createObjectURL(blob)` is created for TTS audio playback. If the user navigates away from the character page before the audio `onended` fires, the `URL.revokeObjectURL(url)` in the `onended` or error handler never runs. The cleanup `useEffect` (line 817) pauses the audio but does **not** revoke the URL. This leaks memory on every TTS response that is interrupted by navigation.
- **Affected:** All browsers
- **Severity:** **P2**

### Issue 7.5 - Session Timer Interval Runs Continuously
- **File:** `src/hooks/useVoiceChat.ts:175-179`
- **What is wrong:** `setInterval(..., 1000)` runs for the entire lifetime of the `useVoiceChat` hook, even when the page is idle, backgrounded, or the user is not in a conversation. This is unnecessary CPU wake-ups. It should be paused when `turnState === 'idle'` and `sessionDurationSeconds === 0`.
- **Affected:** All browsers
- **Severity:** **P2**

---

## Summary Table

| Severity | Count | Key Issues |
|----------|-------|------------|
| **P0** | 5 | Cache quota crash, GPU memory crash (dual video), service worker kills session, AudioContext leak (TTS breaks), wake-word drains battery |
| **P1** | 11 | No audio unlock button, autoplay video failure, mic permission re-request missing, background mic drain, no lifecycle handlers, scroll jank, backdrop blur perf, Safari MIME type mismatch, offline UX missing, MediaRecorder 100ms slices, pagehide cleanup missing |
| **P2** | 9 | Speech voices not loaded, viewport zoom lock, hardcoded en-US, Blob URL leak, NotAllowedError UX, HTTP check, manifest scope/id, session timer always-on, speech synthesis race |

---

## Recommended Priority Fixes

1. **P0-1:** Remove `mp4` from Workbox precache or implement a streaming cache strategy; cap total cache under 50 MB for iOS.
2. **P0-2:** Replace dual video elements with a single `<video>` whose `src` is swapped, or use `<img>` fallback when video fails.
3. **P0-3:** Set `skipWaiting: false` and show an in-app "Update available" toast instead of forcing reload.
4. **P0-4:** Close `AudioContext` in `useVoiceChat` cleanup and limit to one global context.
5. **P0-5:** Add `document.visibilitychange` listener to pause wake-word and MediaRecorder when backgrounded.
