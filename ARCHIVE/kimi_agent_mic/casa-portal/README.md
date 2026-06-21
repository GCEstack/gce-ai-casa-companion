# Casa Companion Desktop Portal

A native desktop voice portal using OpenAI Realtime API with native audio capture.
No browser microphones. No AudioWorklet. No permission popups.

## Architecture

```
+--------------------------------------------------+
|              Electron Desktop App                 |
|  +------------------+    +---------------------+ |
|  |  React Frontend  |    |  Node.js Main Proc  | |
|  |  (UI / Chat)     |<-->|  (Native Audio I/O) | |
|  +------------------+    +----------+----------+ |
|                                   |               |
+-----------------------------------|---------------+
                                    |
                          WebSocket (wss://api.openai.com)
                                    |
                         +----------v-----------+
                         |  OpenAI Realtime API  |
                         |  (STT + LLM + TTS)    |
                         +----------------------+
```

The Electron main process captures raw PCM audio from the native microphone
using `node-mic` (bindings to PortAudio). It streams directly to OpenAI's
Realtime API over a secure WebSocket. Audio responses are played back through
the native speaker — also via PortAudio. The React renderer process handles
only the UI: chat display, status, character selection.

## Why This Works

- **Native audio**: `node-mic` opens the microphone through the OS audio driver
  directly. No `getUserMedia`. No browser permission model.
- **Always-on mic**: The mic stays open while the app is running. No toggle
  button needed. Wake phrases work because audio flows continuously.
- **No browser audio APIs**: AudioWorklet, ScriptProcessorNode, Web Audio API —
  none of it is used. The renderer process is audio-naive.
- **OpenAI Realtime API**: One WebSocket connection handles the entire pipeline
  (speech-to-text, LLM reasoning, text-to-speech). No need for Deepgram + Groq
  + Cartesia separately.

## Project Structure

```
casa-portal/
├── package.json              # Electron + dependencies
├── electron/
│   ├── main.js               # Main process: native audio + OpenAI WS
│   ├── preload.js            # Secure IPC bridge
│   └── audio/                # Native audio modules
│       ├── capture.js        # Microphone input (node-mic)
│       └── playback.js       # Speaker output (speaker)
├── src/
│   ├── App.jsx               # React root
│   ├── components/
│   │   ├── ChatWindow.jsx    # Message history + transcripts
│   │   ├── StatusBar.jsx     # Connection, mic, state indicators
│   │   └── CharacterSelect.jsx  # Voice persona picker
│   ├── hooks/
│   │   └── useVoiceSession.js   # IPC communication with main
│   └── styles/
│       └── app.css
└── index.html
```

## Setup

```bash
# 1. Initialize
npm install

# 2. Set your OpenAI API key
echo "OPENAI_API_KEY=sk-..." > .env

# 3. Run in development
npm run dev

# 4. Build for distribution
npm run build
```

## IPC Protocol (Renderer <-> Main)

| Channel | Direction | Payload | Description |
|---------|-----------|---------|-------------|
| `voice:state` | Main -> Renderer | `{state: 'idle' \| 'listening' \| 'thinking' \| 'speaking'}` | Current session state |
| `voice:transcript` | Main -> Renderer | `{text: string, isFinal: boolean}` | User speech transcript |
| `voice:response` | Main -> Renderer | `{text: string, audio?: boolean}` | AI response text |
| `voice:character` | Renderer -> Main | `{character: string}` | Change voice persona |
| `voice:interrupt` | Renderer -> Main | `{}` | Stop current TTS playback |
| `voice:reset` | Renderer -> Main | `{}` | Clear conversation history |

## Audio Configuration

- Sample rate: 24,000 Hz (required by OpenAI Realtime API)
- Format: 16-bit signed PCM, mono
- Buffer: 4800 samples (200ms chunks)
- Input: System default microphone
- Output: System default speaker

## Dependencies

- `electron` — Desktop app shell
- `node-mic` — Native microphone capture (PortAudio bindings)
- `speaker` — Native audio playback
- `ws` — WebSocket client for OpenAI Realtime API
- `react` + `react-dom` — UI framework
- `vite` — Build tool
- `electron-vite` — Electron + Vite integration
