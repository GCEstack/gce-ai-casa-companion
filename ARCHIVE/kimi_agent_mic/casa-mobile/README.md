# Casa Companion Mobile — Native Voice Portal

A React Native mobile app that uses native OS audio APIs (NOT browser
microphones) to stream voice to OpenAI's Realtime API.

## The Difference

| Browser PWA | React Native App |
|-------------|-----------------|
| `getUserMedia` API | Native AVAudioRecorder (iOS) / AudioRecord (Android) |
| AudioWorklet (janky) | Direct PCM buffer streaming |
| Permission popup every session | One-time permission, remembered |
| Tab switch kills mic | Background audio keeps flowing |
| 50-200ms Web Audio latency | <10ms native latency |
| Autoplay blocks TTS | Native playback, no restrictions |

## Architecture

```
+---------------------------------------------------+
|              React Native App                      |
|  +----------------+      +---------------------+  |
|  |   React UI     |      |  Native Audio Layer |  |
|  |   (JS Thread)  |<---->|  (Native Modules)   |  |
|  |   - Chat       | IPC  |  - expo-audio       |  |
|  |   - Avatar     |      |  - Live PCM stream  |  |
|  |   - Controls   |      |  - Speaker playback |  |
|  +----------------+      +----------+----------+  |
+--------------------------------------|-------------+
                                       |
                              WebSocket (wss://)
                                       |
                          +------------v-----------+
                          |  OpenAI Realtime API   |
                          |  (VAD + STT + LLM +    |
                          |   TTS in one pipe)     |
                          +------------------------+
```

## Project Structure

```
casa-mobile/
├── App.js                          # Entry point, voice session provider
├── package.json
├── app.json                        # Expo config
├── src/
│   ├── components/
│   │   ├── CasaAvatar.js           # Animated character avatar
│   │   ├── ChatBubble.js           # Message bubbles (kid / AI)
│   │   ├── VoiceOrb.js             # Pulsing orb during listening
│   │   ├── StatusPill.js           # Connection + state indicator
│   │   └── CharacterPicker.js      # Swipeable character cards
│   ├── hooks/
│   │   ├── useRealtimeVoice.js     # OpenAI Realtime API connection
│   │   ├── useNativeAudio.js       # Microphone + speaker management
│   │   └── useCasaSession.js       # Session state + history
│   ├── services/
│   │   ├── openaiRealtime.js       # WebSocket client for Realtime API
│   │   └── audioCodec.js           # PCM encoding/decoding helpers
│   └── constants/
│       ├── characters.js           # Voice personas (Drago, Liam, etc.)
│       └── colors.js               # Theme
└── assets/
    ├── avatar-drago.png
    ├── avatar-liam.png
    └── icon.png
```

## Audio Pipeline (Native)

1. **Recording**: `expo-audio` opens the native mic at 24kHz, 16-bit PCM mono
2. **Streaming**: PCM buffers are base64-encoded and sent over WebSocket
3. **VAD**: OpenAI Realtime API detects when user stops speaking
4. **Response**: Audio chunks arrive as base64, decoded to PCM
5. **Playback**: `expo-audio` plays back through native speaker

## Setup

```bash
# 1. Create the app
npx create-expo-app casa-mobile

# 2. Install native audio dependencies
npx expo install expo-audio expo-av expo-file-system

# 3. Install utility libraries
npm install ws react-native-websocket @react-native-community/netinfo

# 4. Set your OpenAI API key
# Edit src/services/openaiRealtime.js and add your key

# 5. Run on device
npx expo start
# Press 'i' for iOS simulator, 'a' for Android
# Or scan QR code with Expo Go app on physical device
```

## Permissions

The app requests microphone permission on first launch. On iOS, add to `app.json`:

```json
{
  "ios": {
    "infoPlist": {
      "NSMicrophoneUsageDescription": "Casa Companion needs microphone access so your child can talk to their AI companion.",
      "UIBackgroundModes": ["audio"]
    }
  },
  "android": {
    "permissions": [
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS"
    ]
  }
}
```

## Key Files

| File | Purpose |
|------|---------|
| `src/hooks/useRealtimeVoice.js` | Manages the WebSocket connection to OpenAI, handles all Realtime API events |
| `src/hooks/useNativeAudio.js` | Configures native mic recording, handles PCM buffer streaming |
| `src/services/openaiRealtime.js` | Low-level WebSocket client, message encoding/decoding |
| `App.js` | Combines everything — starts recording on mount, manages session lifecycle |
