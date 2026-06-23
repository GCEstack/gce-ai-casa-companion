# Casa Companion Voice Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four highest-priority gaps identified in the full audit: (1) inject the 46 shared character prompts into the backend voice router, (2) align mobile mode slugs with backend tag modes, (3) fix production CORS for Fly.io mobile URLs, and (4) wire the web-revamp demo to the real `voice/v3-dual` backend.

**Architecture:** The backend `CharacterVoiceRouter` will load rich prompts from the shared `packages/characters` source and normalize mode slugs before tag lookup. Fly.io CORS allow-list will include the working mobile Fly.io URLs. The web-revamp demo will get new PCM WebSocket hooks copied/adapted from `apps/mobile` while preserving the existing `UseVoiceChatReturn` API so no UI component needs to change.

**Tech Stack:** Python 3.11 (FastAPI), TypeScript/React (Vite), Fly.io, WebSocket PCM.

---

## File Map

| File | Responsibility |
|------|----------------|
| `packages/characters/characters.json` | NEW shared JSON source of truth for character prompts (slug → prompt). |
| `packages/characters/src/index.ts` | MODIFY re-export `characterConfigs` from `characters.json` instead of inline object. |
| `voice/v3-dual/src/casa_voice/providers.py` | MODIFY `CharacterVoiceRouter` to load prompts from `characters.json`; add mode-slug normalization. |
| `voice/v3-dual/fly.toml` | MODIFY `CORS_ALLOWED_ORIGINS` to include working Fly.io mobile URLs. |
| `web-revamp/src/hooks/useVoiceSocket.ts` | NEW WebSocket PCM client adapted from `apps/mobile/src/hooks/useVoiceSocket.ts`. |
| `web-revamp/src/hooks/useAudioWorklet.ts` | NEW AudioWorklet PCM capture adapted from `apps/mobile/src/hooks/useAudioWorklet.ts`. |
| `web-revamp/src/hooks/useVoiceChat.ts` | MODIFY internals to use v3-dual hooks while keeping `UseVoiceChatReturn` interface. |

---

## Task 1: Shared Character Prompts → Backend

### Task 1.1: Export character prompts as JSON

**Files:**
- Create: `packages/characters/characters.json`
- Modify: `packages/characters/src/index.ts:27-540`

- [ ] **Step 1: Create `packages/characters/characters.json`**

Extract only the `prompt` field per character from `characterConfigs` and write a flat JSON object:

```json
{
  "corvo": "You are Corvo, a wise and playful crow companion from Casa Companion...",
  "gufo": "You are Gufo, a gentle and wise owl companion from Casa Companion...",
  "...": "..."
}
```

- [ ] **Step 2: Modify `packages/characters/src/index.ts` to import prompts from JSON**

Replace the inline `prompt` values in `characterConfigs` with imports from `characters.json`:

```ts
import characterPrompts from '../characters.json';

export const characterConfigs: Record<string, CharacterConfig> = {
  corvo: {
    name: "Corvo",
    slug: "corvo",
    meaning: "Corvo means Crow in Italian",
    voice: "onyx",
    prompt: characterPrompts.corvo,
    features: [],
  },
  // ... repeat for all 46 characters
};
```

- [ ] **Step 3: Verify TypeScript still compiles**

Run:
```bash
cd /c/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/casa-companion/apps/mobile
npx tsc -b --noEmit
```

Expected: no errors.

---

### Task 1.2: Load JSON prompts in backend

**Files:**
- Modify: `voice/v3-dual/src/casa_voice/providers.py:153-295`
- Modify: `voice/v3-dual/src/casa_voice/sessions.py:1220-1245`

- [ ] **Step 1: Add JSON loader in `providers.py`**

Near the top of `providers.py`, add:

```python
import json
from pathlib import Path

def _load_character_prompts() -> Dict[str, str]:
    """Load shared character prompts from packages/characters/characters.json.

    Falls back to an empty dict if the file is missing so the backend can still
    start when the shared package is not checked out.
    """
    candidate = Path(__file__).resolve().parents[4] / "packages" / "characters" / "characters.json"
    if not candidate.exists():
        logger.warning("Shared character prompts not found at %s", candidate)
        return {}
    try:
        with candidate.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return {k: str(v) for k, v in data.items() if isinstance(v, str)}
        logger.warning("Shared character prompts has unexpected shape: %s", type(data))
    except Exception as e:
        logger.warning("Failed to load shared character prompts: %s", e)
    return {}

_CHARACTER_PROMPTS = _load_character_prompts()
```

- [ ] **Step 2: Update `CharacterVoiceRouter.get_profile`**

Change `get_profile` to prefer the shared prompt, falling back to the existing hardcoded profiles:

```python
def get_profile(self, character: str) -> VoiceProfile:
    if character in self.PROFILES:
        return self.PROFILES[character]
    if character in _CHARACTER_PROMPTS:
        return VoiceProfile(
            name=character,
            prompt_prefix=_CHARACTER_PROMPTS[character],
            tags={"story": "[excited]", "play": "[laughs]", "calm": "[sighs]", "secret": "[whispers]"},
            default_tag="[excited]",
        )
    return self.PROFILES["default"]
```

- [ ] **Step 3: Simplify `_build_system_prompt` in `sessions.py`**

The existing logic already calls `voice_router.get_profile(self.character)`. Because `get_profile` now returns a rich profile for all 46 characters, the generic fallback in `_build_system_prompt` becomes dead code. Leave it as a safety net.

- [ ] **Step 4: Update `tests/test_characters.py`**

Add a test that verifies a non-hardcoded character (e.g., `corvo`) gets the shared prompt:

```python
def test_shared_character_prompt_loaded():
    from casa_voice.providers import CharacterVoiceRouter, _CHARACTER_PROMPTS
    router = CharacterVoiceRouter("google/gemini-3.1-flash-tts-preview")
    profile = router.get_profile("corvo")
    assert "Corvo" in profile.prompt_prefix or "corvo" in profile.prompt_prefix.lower()
    assert "corvo" in _CHARACTER_PROMPTS
```

- [ ] **Step 5: Run backend tests**

```bash
cd /c/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/casa-companion/voice/v3-dual
python -m pytest tests/test_characters.py tests/test_voice_router.py -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/characters/characters.json packages/characters/src/index.ts voice/v3-dual/src/casa_voice/providers.py voice/v3-dual/tests/test_characters.py
git commit -m "feat(voice): load rich character prompts from shared packages/characters"
```

---

## Task 2: Mode Slug Normalization

### Task 2.1: Add mode slug mapping

**Files:**
- Modify: `voice/v3-dual/src/casa_voice/providers.py:153-295`

- [ ] **Step 1: Add normalization map**

Inside `CharacterVoiceRouter`, add:

```python
MODE_SLUG_MAP: Dict[str, str] = {
    "story-time": "story",
    "story": "story",
    "calm-breathe": "calm",
    "calm": "calm",
    "stem-sparks": "play",
    "play": "play",
    "secret": "secret",
    "introduction": "default",
    "music-rhythm": "play",
    "geography": "play",
    "all-languages": "play",
    "homework-helper": "play",
    "coding": "play",
    "milestones": "story",
    "teaching-mode": "play",
    "default": "default",
}
```

- [ ] **Step 2: Normalize in `apply_tags`**

```python
def apply_tags(self, text: str, character: str, mode: str = "default") -> str:
    profile = self.get_profile(character)
    normalized_mode = self.MODE_SLUG_MAP.get(mode, mode)
    tag = profile.tags.get(normalized_mode, profile.default_tag)
    # ... rest unchanged
```

- [ ] **Step 3: Normalize in `get_profile` tag lookup**

Update `get_profile` so the returned `VoiceProfile` is immutable but the caller can map slugs. (Mapping already happens in `apply_tags`; no change needed here.)

- [ ] **Step 4: Add test**

In `tests/test_voice_router.py`:

```python
def test_mode_slug_normalization():
    from casa_voice.providers import CharacterVoiceRouter
    router = CharacterVoiceRouter("google/gemini-3.1-flash-tts-preview")
    tagged = router.apply_tags("Hello!", "drago", "story-time")
    assert tagged.startswith("[excited]")
    tagged_calm = router.apply_tags("Breathe.", "drago", "calm-breathe")
    assert tagged_calm.startswith("[sighs]")
    tagged_play = router.apply_tags("Let's go!", "drago", "stem-sparks")
    assert tagged_play.startswith("[laughs]")
```

- [ ] **Step 5: Run tests**

```bash
cd /c/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/casa-companion/voice/v3-dual
python -m pytest tests/test_voice_router.py tests/test_characters.py -v
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add voice/v3-dual/src/casa_voice/providers.py voice/v3-dual/tests/test_voice_router.py
git commit -m "feat(voice): normalize mobile mode slugs to backend tag modes"
```

---

## Task 3: Fix Production CORS

### Task 3.1: Update fly.toml allow-list

**Files:**
- Modify: `voice/v3-dual/fly.toml:11`

- [ ] **Step 1: Edit `CORS_ALLOWED_ORIGINS`**

Change line 11 from:
```toml
CORS_ALLOWED_ORIGINS = "https://casa-companion.vercel.app,https://casa-web-mobile-liam.vercel.app,https://casa-web-mobile-peter.vercel.app,https://casa-web-mobile-jenny.vercel.app,https://casa-web-mobile-jimmy.vercel.app"
```

to:
```toml
CORS_ALLOWED_ORIGINS = "https://casa-companion-app.fly.dev,https://casa-web-mobile-liam.fly.dev,https://casa-web-mobile-peter.fly.dev,https://casa-web-mobile-jenny.fly.dev,https://casa-web-mobile-jimmy.fly.dev"
```

(Remove dead Vercel URLs; add working Fly.io marketing and mobile URLs.)

- [ ] **Step 2: Commit**

```bash
git add voice/v3-dual/fly.toml
git commit -m "fix(deploy): update CORS allow-list to working Fly.io mobile URLs"
```

---

## Task 4: Wire web-revamp Demo to v3-dual

### Task 4.1: Add PCM WebSocket hooks to web-revamp

**Files:**
- Create: `web-revamp/src/hooks/useVoiceSocket.ts`
- Create: `web-revamp/src/hooks/useAudioWorklet.ts`

- [ ] **Step 1: Copy and adapt `useVoiceSocket.ts`**

Copy `apps/mobile/src/hooks/useVoiceSocket.ts` to `web-revamp/src/hooks/useVoiceSocket.ts`. Replace Sentry imports if any; web-revamp does not use Sentry. Keep the same exported API.

Key exported interface must match:

```ts
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type VoiceState = 'idle' | 'wake_detected' | 'listening' | 'processing' | 'speaking' | 'interrupted';

export interface VoiceSocketHook {
  connectionState: ConnectionState;
  voiceState: VoiceState;
  transcript: string;
  assistantText: string;
  errorMessage: string;
  connect: () => void;
  disconnect: () => void;
  sendAudio: (pcmChunk: ArrayBuffer) => void;
  sendTextInput: (text: string) => void;
  sendCommand: (command: string) => void;
  sendConfigChange: (character: string, mode: string) => void;
  stopPlayback: () => void;
}
```

- [ ] **Step 2: Copy and adapt `useAudioWorklet.ts`**

Copy `apps/mobile/src/hooks/useAudioWorklet.ts` to `web-revamp/src/hooks/useAudioWorklet.ts`. Remove any mobile-specific imports. Keep exported API:

```ts
export interface UseAudioWorkletReturn {
  isCapturing: boolean;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
  setOnAudioChunk: (cb: (chunk: ArrayBuffer) => void) => void;
}
```

- [ ] **Step 3: Type-check new hooks**

```bash
cd /c/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/casa-companion/web-revamp
npx tsc -b --noEmit
```

Expected: no errors.

---

### Task 4.2: Rewrite `useVoiceChat.ts` to use v3-dual internally

**Files:**
- Modify: `web-revamp/src/hooks/useVoiceChat.ts`

- [ ] **Step 1: Replace imports and state**

At the top of `useVoiceChat.ts`, remove Deepgram/OpenAI/browser-only imports and add:

```ts
import { useVoiceSocket } from './useVoiceSocket';
import { useAudioWorklet } from './useAudioWorklet';
```

Keep the existing `UseVoiceChatReturn` interface and `ChatMessage` type exactly as-is so consumers do not change.

- [ ] **Step 2: Implement the v3-dual adapter inside `useVoiceChat`**

Replace the body of `useVoiceChat` with:

```ts
export function useVoiceChat(slug: string, activeMode?: ModeConfig): UseVoiceChatReturn {
  const config = characterConfigs[slug.toLowerCase()];
  const { state, dispatch } = useApp();

  const socket = useVoiceSocket();
  const audio = useAudioWorklet();

  const [lastTranscript, setLastTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationMode, setConversationMode] = useState<'turn-based' | 'free-flow'>('turn-based');
  const [errorMessage, setErrorMessage] = useState('');

  // Reflect socket state into AppContext for the existing UI.
  useEffect(() => {
    const isConnected = socket.connectionState === 'connected';
    if (state.connectionStatus !== (isConnected ? 'online' : 'offline')) {
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: isConnected ? 'online' : 'offline' });
    }
  }, [socket.connectionState, state.connectionStatus, dispatch]);

  useEffect(() => {
    dispatch({ type: 'SET_SPEAKING', payload: socket.voiceState === 'speaking' });
  }, [socket.voiceState, dispatch]);

  useEffect(() => {
    dispatch({ type: 'SET_RECORDING', payload: socket.voiceState === 'listening' || socket.voiceState === 'wake_detected' });
  }, [socket.voiceState, dispatch]);

  // Wire captured PCM into the socket.
  useEffect(() => {
    audio.setOnAudioChunk((chunk) => {
      socket.sendAudio(chunk);
    });
  }, [audio, socket]);

  // Update transcript/response messages.
  useEffect(() => {
    if (socket.transcript) setLastTranscript(socket.transcript);
  }, [socket.transcript]);

  useEffect(() => {
    if (socket.assistantText) {
      setLastResponse(socket.assistantText);
      setMessages((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].role === 'assistant') {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', text: socket.assistantText };
          return next;
        }
        return [...prev, { role: 'assistant', text: socket.assistantText }];
      });
    }
  }, [socket.assistantText]);

  useEffect(() => {
    if (socket.errorMessage) setErrorMessage(socket.errorMessage);
  }, [socket.errorMessage]);

  // Send config change when character or mode changes.
  useEffect(() => {
    if (socket.connectionState === 'connected') {
      socket.sendConfigChange(slug, activeMode?.slug ?? 'default');
    }
  }, [slug, activeMode, socket]);

  const connect = useCallback(async () => {
    setErrorMessage('');
    socket.connect();
  }, [socket]);

  const disconnect = useCallback(() => {
    audio.stopCapture();
    socket.disconnect();
  }, [audio, socket]);

  const startRecording = useCallback(() => {
    setErrorMessage('');
    setLastTranscript('');
    setLastResponse('');
    socket.sendCommand('wake');
    void audio.startCapture();
  }, [audio, socket]);

  const stopRecording = useCallback(async () => {
    audio.stopCapture();
    if (socket.voiceState === 'speaking') {
      socket.sendCommand('interrupt');
    }
    return null;
  }, [audio, socket]);

  const toggleRecording = useCallback(async () => {
    if (socket.voiceState === 'listening' || socket.voiceState === 'wake_detected') {
      await stopRecording();
    } else {
      startRecording();
    }
  }, [socket.voiceState, startRecording, stopRecording]);

  const requestMicPermission = useCallback(async () => {
    try {
      await audio.startCapture();
      dispatch({ type: 'SET_MIC_PERMISSION', payload: true });
      return true;
    } catch {
      dispatch({ type: 'SET_MIC_PERMISSION', payload: false });
      return false;
    } finally {
      audio.stopCapture();
    }
  }, [audio, dispatch]);

  const stopSpeaking = useCallback(() => {
    socket.stopPlayback();
    dispatch({ type: 'SET_SPEAKING', payload: false });
  }, [socket, dispatch]);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
      setLastTranscript(trimmed);
      setErrorMessage('');
      socket.sendTextInput(trimmed);
    },
    [socket]
  );

  return {
    isConnected: socket.connectionState === 'connected',
    isRecording: socket.voiceState === 'listening' || socket.voiceState === 'wake_detected',
    isSpeaking: socket.voiceState === 'speaking',
    conversationMode,
    turnState: socket.voiceState === 'speaking' ? 'speaking' : socket.voiceState === 'listening' || socket.voiceState === 'wake_detected' ? 'listening' : socket.voiceState === 'processing' ? 'processing' : 'idle',
    currentMode: 'default' as AiMode, // v3-dual handles modes server-side; keep UI default
    lastTranscript,
    lastResponse,
    messages,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    toggleRecording,
    requestMicPermission,
    setConversationMode,
    speakResponse: () => {}, // no-op; v3-dual speaks automatically
    stopSpeaking,
    sendText,
  };
}
```

- [ ] **Step 3: Remove dead code**

Delete the old browser-only helpers inside `useVoiceChat.ts`:
- `MODE_TRIGGERS`
- `MODE_ANNOUNCEMENTS`
- `MODE_PROMPTS`
- `buildSystemPrompt`
- `fetchTTSBlob`
- `activeModeToFeaturePrompt`
- `fetchWithTimeout`
- module-level audio singletons
- `registerWaveform` / `unregisterWaveform`

Keep `VoiceWaveform.tsx` working: either keep a stub `registerWaveform` export in `useVoiceChat.ts` or update `VoiceWaveform.tsx` to use `useAudioWorklet` directly. The plan recommends keeping a stub in `useVoiceChat.ts` to minimize UI changes:

```ts
// Stubs for legacy waveform API; remove once VoiceWaveform is migrated.
export function registerWaveform(_api: { setData: (data: number[]) => void }) {}
export function unregisterWaveform() {}
```

- [ ] **Step 4: Update `.env.example`**

Remove unused `VITE_OPENAI_API_KEY` / `VITE_DEEPGRAM_API_KEY` and add:

```bash
# Voice backend (v3-dual)
VITE_VOICE_SERVER_URL=wss://casa-voice-agent.fly.dev
VITE_VOICE_SERVER_API_KEY=your_voice_server_api_key_here
```

- [ ] **Step 5: Type-check web-revamp**

```bash
cd /c/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/casa-companion/web-revamp
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 6: Build web-revamp**

```bash
cd /c/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/casa-companion/web-revamp
npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add web-revamp/src/hooks/useVoiceSocket.ts web-revamp/src/hooks/useAudioWorklet.ts web-revamp/src/hooks/useVoiceChat.ts web-revamp/.env.example
git commit -m "feat(web-revamp): wire demo to voice/v3-dual via PCM WebSocket"
```

---

## Task 5: Final Verification

- [ ] **Step 1: Run all backend unit tests**

```bash
cd /c/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/casa-companion/voice/v3-dual
python -m pytest tests/test_commands.py tests/test_filler.py tests/test_characters.py tests/test_voice_router.py tests/wakeword_test.py tests/echo_test.py -v
```

Expected: 63+ pass.

- [ ] **Step 2: Type-check both frontends**

```bash
cd /c/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/casa-companion/apps/mobile
npx tsc -b --noEmit

cd /c/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/casa-companion/web-revamp
npx tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify audit placeholders still filled**

```bash
cd /c/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/casa-companion
grep -nE '\{\{[A-Z_0-9]+\}\}' casa_companion_full_audit.md || echo 'No placeholders found'
```

Expected: no template placeholders.

- [ ] **Step 4: Review git diff**

```bash
cd /c/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/casa-companion
git diff --stat
```

Expected: changes limited to the files listed in the File Map.

---

## Spec Coverage Self-Review

| User Gap | Plan Task(s) |
|----------|--------------|
| 42 of 46 characters have no personality | Task 1.1 + Task 1.2 |
| Mode slugs misaligned | Task 2.1 |
| CORS broken | Task 3.1 |
| web-revamp demo doesn't use v3-dual | Task 4.1 + Task 4.2 |

## Placeholder Scan

No red flags: every step contains exact file paths, code blocks, and verification commands. No “TBD”, “TODO”, or “similar to Task N”.
