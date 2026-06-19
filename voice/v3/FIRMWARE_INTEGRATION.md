# Casa Companion Firmware ↔ Frontend Integration

This document describes the WebSocket JSON protocol and the files changed to connect the ESP32-S3 firmware to the Casa Companion React frontend.

## Protocol

All messages are JSON text frames over a single WebSocket connection.

### Firmware → Frontend

```json
{"type": "voice_stream", "data": "<base64_16kHz_16bit_mono_pcm>", "character": "coniglio"}
{"type": "status", "state": "online|offline|listening|speaking", "battery": 85, "character": "coniglio", "mode": "story-time"}
{"type": "mode_change", "mode": "story-time", "character": "coniglio"}
```

### Frontend → Firmware

```json
{"type": "voice_input", "data": "<base64_16kHz_16bit_mono_pcm>"}
{"type": "mode_select", "mode": "story-time", "character": "coniglio"}
{"type": "connect", "character": "coniglio"}
```

## Audio Format

- Sample rate: 16 kHz
- Bits: 16-bit signed little-endian
- Channels: mono
- Chunk size: `CONFIG_CASA_VOICE_CHUNK_SAMPLES` (default 512 samples = 32 ms)
- Encoding: Base64 inside JSON

## Firmware Files

| File | Change |
|------|--------|
| `main/common.h` | Added message type constants, global state struct, mutex, base64 helpers |
| `main/common.c` | New: state helpers and mbedtls base64 wrappers |
| `main/websocket_task.c` | Connects to relay, parses JSON, handles reconnection, sends/receives messages |
| `main/audio_task.c` | Streams base64 PCM JSON when listening, plays received PCM through I2S speaker |
| `main/main.c` | Creates queues/mutex/state, starts all tasks |
| `main/power_mgmt.c` | Sends `status` JSON with battery level |
| `main/CMakeLists.txt` | Added `common.c` and `mbedtls` require |
| `main/Kconfig.projbuild` | Added `CASA_WEBSOCKET_URI`, `CASA_DEFAULT_CHARACTER`, `CASA_DEFAULT_MODE`, `CASA_VOICE_CHUNK_SAMPLES` |

## Configuration

Set in `sdkconfig` (or via `idf.py menuconfig` under "Casa Companion Voice Agent Configuration"):

```
CONFIG_CASA_WIFI_SSID="your-wifi"
CONFIG_CASA_WIFI_PASSWORD="your-password"
CONFIG_CASA_WEBSOCKET_URI="wss://casa-relay.onrender.com"
CONFIG_CASA_DEFAULT_CHARACTER="coniglio"
CONFIG_CASA_DEFAULT_MODE="story-time"
CONFIG_CASA_VOICE_CHUNK_SAMPLES=512
```

For local development, run the relay below and use:

```
CONFIG_CASA_WEBSOCKET_URI="ws://192.168.1.xxx:8080"
```

## Relay Server

A simple Node.js broadcast relay is provided at the project root:

```bash
cd C:\Users\Dekan AI Brother\Desktop\casa-companion-voice-agent
npm install
npm start
```

Deploy to Render/Railway/fly.io by pointing the start command to `node ws-relay.js` and setting `PORT` to the platform's required port.

## Frontend Hook

A React hook is included in the dashboard:

```ts
import { useCasaWebSocket } from '@/lib/useCasaWebSocket';

function MyPage() {
  const { connected, deviceState, battery, sendVoiceInput, sendModeSelect } = useCasaWebSocket({
    uri: 'wss://casa-relay.onrender.com',
    character: 'coniglio',
    mode: 'story-time',
    onMessage: (msg) => console.log(msg),
  });

  // sendVoiceInput(base64Pcm)
  // sendModeSelect('play', 'coniglio')
}
```

## Build/Flash

```powershell
cmd /c "cd /d C:\Users\Dekan AI Brother\Desktop\casa-companion-voice-agent\firmware && set IDF_TOOLS_PATH=C:\Espressif && call C:\Espressif\frameworks\esp-idf-v5.4.4\tools\legacy_exports\export_legacy.bat && idf.py build && idf.py flash && idf.py monitor"
```

## Testing

1. Start the relay (`npm start` in project root).
2. Flash firmware and open serial monitor.
3. Verify WiFi connects and WebSocket connects.
4. Open frontend, click Connect.
5. Speak into microphone → should see `voice_stream` messages in relay logs.
6. Frontend sends `voice_input` → firmware plays audio through speaker.
