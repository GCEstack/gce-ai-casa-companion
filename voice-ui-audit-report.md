# Casa Companion Voice UI — UX/Responsiveness Audit Report

**Auditor:** UX/Frontend Auditor (Sub-agent)  
**Date:** 2025-07-01  
**Scope:** `src/hooks/useVoiceChat.ts`, `src/components/`, `src/pages/CharacterDetail.tsx`, `src/lib/settings.ts`  
**User Complaint:** "The voice agent is too slow. The UI doesn't feel responsive."

---

## 1. Voice State Feedback Loop

### Issue 1.1: "Listening" state is delayed until mic permission is granted
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 544–641 (Deepgram path: 587, 620)  
- **Problem:** In `startRecording()`, `setTurnState('listening')` is placed at line 620, **after** `await navigator.mediaDevices.getUserMedia({ audio: true })` (line 587) and **after** `await unlockAudioContext()` (line 550). The user taps the mic button, and for 500ms–2s (depending on OS permission latency) the UI stays in the previous state (`idle` or `speaking`). There is no optimistic "Starting mic…" state.
- **Why it feels slow:** The user gets zero visual confirmation that their tap registered until the browser finishes the async mic permission negotiation.
- **Severity:** P1 — Feels broken on first tap, especially on iOS Safari.

### Issue 1.2: `toggleRecording` dispatches `startRecording` without awaiting
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 782–797 (`toggleRecording`)  
- **Problem:** `toggleRecording` calls `void startRecording()` (line 795). Because `startRecording` is async, the state updates inside it are queued behind the event loop. If the user rapidly taps the mic, race conditions can occur where the UI briefly flickers between states.
- **Why it feels slow:** The tap doesn't produce an immediate state change; it feels like the button is "dead" for a moment.
- **Severity:** P1

### Issue 1.3: No intermediate state between "user tapped mic" and "mic is live"
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 31 (`TurnState` type definition)  
- **Problem:** The `TurnState` union is `'idle' | 'listening' | 'processing' | 'speaking' | 'error'`. There is no `'starting'` or `'waking'` state. When the wake word is detected, `startRecording()` is called immediately (line 764), but the same mic-permission delay applies.
- **Severity:** P2 — Polish

---

## 2. Latency in the Critical Path

### Issue 2.1: Fully sequential pipeline — no streaming anywhere
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 439–525 (`runPipeline`), 391–429 (`processUserText`), 328–364 (`fetchLLMResponse`), 366–389 (`fetchTTS`), 269–314 (`playAudioResponse`)
- **Problem:** The entire user-utterance-to-response path is a blocking `await` chain:
  1. `recorder.stop()` → wait for `onstop` →  
  2. `await fetchWithTimeout(...)` to Deepgram →  
  3. `await fetchLLMResponse(...)` (full GPT-4o-mini response) →  
  4. `await fetchTTS(...)` (full OpenAI TTS blob) →  
  5. `await playAudioResponse(...)` (decode + start playback)
  
  None of these steps are parallelized. TTS cannot start until the LLM finishes. Audio playback cannot start until the TTS blob fully downloads.
- **Why it feels slow:** A typical 3-sentence response requires: ~800ms STT + ~1.5s LLM + ~1.5s TTS + decode. The user stares at "Thinking…" for ~4 seconds before hearing anything. On mobile with spotty connectivity, the 25-second `FETCH_TIMEOUT` can make the app feel frozen.
- **Severity:** P0 — App feels broken/unusable on slower networks.

### Issue 2.2: No LLM streaming — user waits for full response before TTS
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 338–363 (`fetchLLMResponse`)
- **Problem:** The OpenAI `/chat/completions` call does not set `stream: true`. The app waits for the entire JSON payload, then immediately fires the TTS request. There is no "sentence-by-sentence" or "chunk-by-chunk" audio playback.
- **Severity:** P0

### Issue 2.3: No streaming or early-start TTS
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 366–389 (`fetchTTS`)
- **Problem:** The TTS endpoint is called with the full `responseText`. The app must download the entire audio blob before it can call `audioContext.decodeAudioData()` or `audio.play()`. OpenAI's TTS endpoint supports chunked transfer, but the code uses `await res.blob()` which blocks until the full MP3/Opus is received.
- **Severity:** P0

### Issue 2.4: `processUserText` blocks the UI thread for the entire LLM+TTS+playback duration
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 403–422
- **Problem:** `processUserText` is a single `try` block. The UI state remains `'processing'` from line 400 until `playAudioResponse` resolves at line 413 (or the fallback at line 418). There is no way to show partial progress (e.g., "LLM responding…" → "Generating voice…" → "Playing…").
- **Severity:** P1

### Issue 2.5: `fetchWithTimeout` of 25 seconds is too long for STT/LLM
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 29 (`FETCH_TIMEOUT`), 56–64 (`fetchWithTimeout`)
- **Problem:** A 25-second timeout means the user can stare at "Thinking…" for 25 seconds before an abort occurs. On mobile, users typically abandon after 3–5 seconds. There is no per-step timeout (e.g., 8s for STT, 10s for LLM, 8s for TTS).
- **Severity:** P1

---

## 3. Visual Feedback During Thinking / Speaking

### Issue 3.1: Character animation has no "thinking" state
- **File:** `src/components/CharacterShowcase.tsx`  
- **Lines:** 6–8 (props), 16–24 (`useEffect`)
- **Problem:** `CharacterShowcase` only accepts `isSpeaking?: boolean`. In `CharacterDetail.tsx` (line 85), it is wired as `isSpeaking={voice.turnState === 'speaking'}`. When `turnState` is `'processing'`, the character is still in the **idle** loop. The user sees a static or gently looping idle video while the status line says "Thinking…".
- **Why it feels slow:** The character is the emotional anchor of the UI. If it doesn't react to the "thinking" state, the app feels dead during the longest part of the latency budget.
- **Severity:** P1

### Issue 3.2: Instant, jarring video swap instead of cross-fade
- **File:** `src/components/CharacterShowcase.tsx`  
- **Lines:** 33, 43 (`opacity-0` / `opacity-100` classes)
- **Problem:** The CSS classes toggle between `opacity-0` and `opacity-100` with no `transition-opacity` or `duration-300` utility. The switch from idle to speaking is a hard cut. This is especially noticeable because the two videos are not frame-aligned.
- **Severity:** P2

### Issue 3.3: Speaking video is muted and not lip-synced to actual audio
- **File:** `src/components/CharacterShowcase.tsx`  
- **Lines:** 35, 44 (`muted` attribute on both `<video>` tags)
- **Problem:** The actual TTS audio is played by `playAudioResponse()` in `useVoiceChat.ts`, while the character video is a generic pre-recorded loop. There is no audio analysis to drive mouth movement. The loop may not align with the actual speech cadence, making the character feel "off."
- **Severity:** P2

### Issue 3.4: `MicButton` spinner is inconsistent with `InputBar` mic button
- **File:** `src/components/MicButton.tsx` (line 28), `src/components/InputBar.tsx` (lines 53–57)
- **Problem:** `MicButton` shows a spinning loader during `isProcessing`. The `InputBar` mic button (the one actually used in the chat) does **not** show a spinner during processing; it simply shows a grayed-out `Mic` icon. The user has no visual cue that the system is busy.
- **Severity:** P1

### Issue 3.5: No animated progress during processing
- **File:** `src/pages/CharacterDetail.tsx`  
- **Lines:** 93–99 (status line)
- **Problem:** The status line is plain text: `Thinking…`, `Speaking…`, `Listening…`. There are no animated dots, no pulsing rings around the character, no progress bar. The UI is static during the longest waiting periods.
- **Severity:** P1

---

## 4. Error Handling UX

### Issue 4.1: No retry button or auto-retry anywhere
- **File:** `src/pages/CharacterDetail.tsx`  
- **Lines:** 98–102 (error display)
- **Problem:** When `turnState === 'error'`, the UI shows "Something went wrong" and a small red error message. There is no "Try Again" button, no tap-to-retry on the character, and no auto-retry after a backoff. The user must manually tap the mic or type again.
- **Severity:** P1 — Frustrating, especially for children.

### Issue 4.2: `sendText` does not stop Web Audio API playback
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 431–437 (`sendText`)
- **Problem:** `sendText` only pauses `audioRef.current` (HTMLAudioElement) but does **not** stop `audioSourceRef.current` (Web Audio API `AudioBufferSourceNode`). If the agent is speaking via the Web Audio path and the user sends a text message, the TTS audio continues playing over the new turn.
- **Severity:** P1 — Audio overlap bug.

### Issue 4.3: `logError` is invisible to users — no structured diagnostics
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 20–22 (`logError`)
- **Problem:** Errors are only `console.error`. There is no telemetry, no Sentry, no in-app error report. A parent cannot see *why* the mic failed.
- **Severity:** P2

### Issue 4.4: Browser-speech fallback timeout is invisible
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 74–122 (`transcribeWithBrowserSpeech`), 87–94 (timeout)
- **Problem:** The browser speech fallback has a hard 7-second timeout. The user sees "Listening…" but has no countdown or progress indicator. If they pause mid-sentence, the recognition aborts and throws "Browser speech recognition timed out".
- **Severity:** P1

### Issue 4.5: Deepgram key-missing error is generic
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 440–444 (`runPipeline`)
- **Problem:** If the Deepgram API key is missing, the app shows the same generic error state. It does not offer a link to Settings or a "Add API Key" CTA.
- **Severity:** P2

### Issue 4.6: `catch` blocks swallow `AbortError` without distinguishing timeout vs. user cancellation
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 489–524 (`runPipeline` catch), 423–428 (`processUserText` catch)
- **Problem:** If the network is slow and the 25-second timeout fires, the user sees a generic "Voice response failed" message. There is no "Request timed out, please check your connection" message.
- **Severity:** P2

---

## 5. Input Mode Confusion

### Issue 5.1: Text input is enabled while the microphone is recording
- **File:** `src/components/InputBar.tsx`  
- **Lines:** 24–25 (`isProcessing` logic), 61–69 (`<input>` disabled prop)
- **Problem:** The text input is disabled only when `isProcessing` is true. During `listening`, `isProcessing` is false, so the user can type into the text field while the mic is actively recording. This creates a confusing hybrid state where voice and text are both "active."
- **Severity:** P1 — Users can accidentally type instead of speak, or vice versa.

### Issue 5.2: Placeholder text is misleading during recording
- **File:** `src/components/InputBar.tsx`  
- **Line:** 66
- **Problem:** When the mic is recording, the placeholder still says `Type a message...`. It should say something like `Listening... speak now` to reinforce the active mode.
- **Severity:** P2

### Issue 5.3: No clear mode indicator or push-to-talk vs. always-listening distinction
- **File:** `src/pages/CharacterDetail.tsx`  
- **Lines:** 73–78 (voice pill), `src/components/InputBar.tsx` (entire component)
- **Problem:** The only voice indicator is a tiny `Volume2` / `VolumeX` icon next to the mode pill. There is no clear "Voice Mode" vs. "Text Mode" toggle. The mic is always visible, and the text field is always visible. The user never knows which modality the system is "expecting."
- **Severity:** P1

### Issue 5.4: Barge-in toggle label is confusing
- **File:** `src/pages/Settings.tsx`  
- **Lines:** 312–316
- **Problem:** The setting is labeled `"Cut off while speaking"` with description `"Press the mic button to interrupt your companion"`. This is developer jargon. A child or parent may not understand what "cut off" or "barge-in" means.
- **Severity:** P2

---

## 6. Wake Word UX

### Issue 6.1: Wake-word toggle is completely broken for most users (hardcoded hostname check)
- **File:** `src/lib/settings.ts`  
- **Lines:** 153–165 (`isWakeWordEnabled`)
- **Problem:** The function checks `window.location.hostname` against a hardcoded set of three domains. It **ignores** the `settings.wakeWordEnabled` boolean that the user toggles in Settings. The user can toggle wake word ON in the UI, but `isWakeWordEnabled()` will still return `false` on any non-Peter domain. This is a silent, deceptive UI.
- **Severity:** P0 — App feels broken; the toggle is a lie.

### Issue 6.2: Always-on microphone drains battery with no warning
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 643–780 (`startWakeListening`), 649 (`continuous: true`)
- **Problem:** When wake word is enabled, `SpeechRecognition` runs with `continuous: true` and `interimResults: false`. The microphone is essentially always active whenever the app is in `idle`, `speaking`, or `error` state. There is no battery warning, no "Microphone is always on" indicator, and no OS-style mic-in-use dot.
- **Severity:** P1 — High battery drain; parents may uninstall.

### Issue 6.3: No visual flash or confirmation when wake word is detected
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 757–764 (wake word matched → `startRecording()`)
- **Problem:** When a wake phrase is detected, the code immediately calls `startRecording()` without any intermediate UI state. The user does not see a "Wake word detected!" flash, a haptic pulse, or a character reaction. The transition from wake-listening to recording is invisible.
- **Severity:** P1

### Issue 6.4: Wake phrases are re-parsed from comma strings on every speech result
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 716–729 (`phraseLists` construction inside `onresult`)
- **Problem:** Every time `recognition.onresult` fires, the code splits `getWakeStartPhrases()`, `getWakeInterruptPhrases()`, and `getWakeEndPhrases()` by comma, maps, trims, and filters them. This is unnecessary work on the main thread inside a hot event handler.
- **Severity:** P2 — Performance, not UX critical.

---

## Additional Critical Issues Found

### Issue A.1: Session timer can be stale from a previous day, immediately locking the app
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 132–133 (`sessionDurationSeconds` state init)
- **Problem:** `getSessionStart()` reads from `localStorage`. If the child used the app yesterday and the parent set a 15-minute cap, opening the app today will initialize `sessionDurationSeconds` to the elapsed time since yesterday's session start. The time-cap banner may appear immediately.
- **Severity:** P1 — Children may be locked out unfairly.

### Issue A.2: `CharacterShowcase` video elements reload on every re-render
- **File:** `src/components/CharacterShowcase.tsx`  
- **Lines:** 30–48 (`<video>` tags with `src` attribute)
- **Problem:** Because `src` is set directly on the `<video>` element, any re-render of the parent (e.g., state change during processing) will cause the browser to re-evaluate the `src`, potentially causing a flash or a brief reload of the video.
- **Severity:** P2

### Issue A.3: `getMimeType()` can return empty string, causing fragile `MediaRecorder` fallback
- **File:** `src/hooks/useVoiceChat.ts`  
- **Lines:** 66–72 (`getMimeType`)
- **Problem:** If the browser doesn't support `audio/webm`, `audio/webm;codecs=opus`, `audio/mp4`, or `audio/ogg`, `getMimeType()` returns `''`. The code then falls back to `new MediaRecorder(stream)` without options. On some browsers (e.g., Safari iOS), this may produce an unsupported MIME type, causing `recorder.onerror` to fire later with no actionable message to the user.
- **Severity:** P2

---

## Summary Table

| # | Issue | File | Line(s) | Severity |
|---|-------|------|---------|----------|
| 1.1 | "Listening" state delayed until mic permission granted | `useVoiceChat.ts` | 587, 620 | P1 |
| 1.2 | `toggleRecording` dispatches without await | `useVoiceChat.ts` | 782–797 | P1 |
| 1.3 | No "starting" / "waking" intermediate state | `useVoiceChat.ts` | 31 | P2 |
| 2.1 | Fully sequential STT → LLM → TTS → playback pipeline | `useVoiceChat.ts` | 439–525, 391–429 | **P0** |
| 2.2 | No LLM streaming; waits for full response | `useVoiceChat.ts` | 338–363 | **P0** |
| 2.3 | No TTS streaming; waits for full audio blob | `useVoiceChat.ts` | 366–389 | **P0** |
| 2.4 | Single `processUserText` block blocks UI for full duration | `useVoiceChat.ts` | 403–422 | P1 |
| 2.5 | 25-second timeout is too long | `useVoiceChat.ts` | 29, 56–64 | P1 |
| 3.1 | Character has no "thinking" animation state | `CharacterShowcase.tsx` | 6–8, 16–24 | P1 |
| 3.2 | Video swap is instant (no CSS transition) | `CharacterShowcase.tsx` | 33, 43 | P2 |
| 3.3 | Speaking video muted, not lip-synced to audio | `CharacterShowcase.tsx` | 35, 44 | P2 |
| 3.4 | `InputBar` mic button lacks spinner during processing | `InputBar.tsx` | 53–57 | P1 |
| 3.5 | No animated progress indicators during processing | `CharacterDetail.tsx` | 93–99 | P1 |
| 4.1 | No retry button or auto-retry on errors | `CharacterDetail.tsx` | 98–102 | P1 |
| 4.2 | `sendText` doesn't stop Web Audio playback | `useVoiceChat.ts` | 431–437 | P1 |
| 4.3 | `logError` only writes to console | `useVoiceChat.ts` | 20–22 | P2 |
| 4.4 | Browser speech fallback has invisible 7s timeout | `useVoiceChat.ts` | 87–94 | P1 |
| 4.5 | Missing API key doesn't link to Settings | `useVoiceChat.ts` | 440–444 | P2 |
| 4.6 | Timeout vs. cancellation errors are indistinguishable | `useVoiceChat.ts` | 489–524 | P2 |
| 5.1 | Text input enabled while mic is recording | `InputBar.tsx` | 24–25, 61–69 | P1 |
| 5.2 | Placeholder says "Type a message..." during recording | `InputBar.tsx` | 66 | P2 |
| 5.3 | No clear voice vs. text mode indicator | `CharacterDetail.tsx`, `InputBar.tsx` | 73–78, entire | P1 |
| 5.4 | Barge-in label is confusing jargon | `Settings.tsx` | 312–316 | P2 |
| 6.1 | Wake-word toggle is hardcoded to 3 domains (broken for others) | `settings.ts` | 153–165 | **P0** |
| 6.2 | Always-on mic drains battery with no warning | `useVoiceChat.ts` | 643–780, 649 | P1 |
| 6.3 | No visual confirmation on wake-word detection | `useVoiceChat.ts` | 757–764 | P1 |
| 6.4 | Wake phrases re-parsed from strings on every result | `useVoiceChat.ts` | 716–729 | P2 |
| A.1 | Session timer can be stale, immediately locking app | `useVoiceChat.ts` | 132–133 | P1 |
| A.2 | Videos may reload on re-render | `CharacterShowcase.tsx` | 30–48 | P2 |
| A.3 | `getMimeType()` can return empty string | `useVoiceChat.ts` | 66–72 | P2 |

---

*End of audit. No fixes were applied — this is a read-only report.*
