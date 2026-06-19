# Casa Voice V2 — Wake Phrase Architecture

## Three Actions + Reset

| Action | Phrases | When It Works | What Happens |
|--------|---------|---------------|--------------|
| **WAKE** | "Hello", "Hey", "Wake up", "Wake" | Only in **IDLE** state | Companion wakes up, transitions to LISTENING |
| **INTERRUPT** | "Yo", "WTF", "One sec", "Hold on" | Only in **SPEAKING** state | Cuts off TTS, returns to LISTENING |
| **END TURN** | "Send", "End", "Capische" | Only in **LISTENING** state | Forces utterance end, processes immediately |
| **RESET** | "Reset" | Any state | Clears conversation history, returns to IDLE |

## Hardware: Mic Button (ESP32)

| Press | Action | Equivalent To |
|-------|--------|---------------|
| **Short press** (< 1s) | INTERRUPT | Saying "Yo" / "Hold on" |
| **Long press** (> 1s) | RESET | Saying "Reset" |

GPIO: **18** (pull-up, active low)

## State Machine Flow

```
[IDLE] ──"Hello"──> [WAKE_DETECTED] ──300ms──> [LISTENING]
  │                                              │
  │"Reset"                                       │"Send" / "Capische"
  │                                              │
  └──────────────────────────────────────────────┘
                    │
                    ▼
              [PROCESSING] ──LLM──> [SPEAKING]
                    │                    │
                    │"Yo" / button       │"Yo" / button
                    │                    │
                    └────────────────────┘
                           │
                           ▼
                    [INTERRUPTED] ──> [LISTENING]
```

## How It Works

### 1. IDLE → WAKE
- Server is in IDLE state
- ESP32 sends all audio (VAD still filters obvious silence)
- Server runs STT on short utterances (max 3 seconds)
- If transcript matches wake phrase → `WAKE_DETECTED` → `LISTENING`
- If no wake phrase → discard audio, stay IDLE (no LLM cost)

### 2. LISTENING → END TURN
- Server collects audio until silence (800ms) or END_TURN phrase
- When "Send" / "End" / "Capische" detected in transcript:
  - Strip the phrase from the text
  - Process the remaining text immediately (no waiting for silence)
  - Send `END_TURN_ACK` to client

### 3. SPEAKING → INTERRUPT
- Two paths detect interrupt:
  - **VAD loop**: While TTS is playing, incoming audio is checked. If speech detected, quick STT runs. If interrupt phrase found → barge-in.
  - **Transcript loop**: If the full pipeline catches an interrupt phrase in the transcript.
- Result: Cancel TTS task, send `INTERRUPT_ACK`, return to LISTENING.

### 4. BUTTON (ESP32)
- Short press → sends `{"type": "command", "command": "button_press"}` → treated as INTERRUPT
- Long press → sends `{"type": "command", "command": "reset"}` → treated as RESET

## File Changes Summary

| File | What Changed |
|------|-------------|
| `protocol.py` | Added `WAKE_DETECTED`, `INTERRUPT_ACK`, `END_TURN_ACK` message types. Added `IDLE`, `WAKE_DETECTED`, `RESETTING` states. Added `WAKE`, `END_TURN`, `RESET`, `BUTTON_PRESS` commands. |
| `commands.py` | Added wake, interrupt, end-turn, reset regex patterns. Added `is_wake_phrase()`, `is_interrupt_phrase()`, `is_end_turn_phrase()` helpers. |
| `sessions.py` | Complete rewrite of `_input_loop()`: IDLE wake detection, LISTENING end-turn handling, SPEAKING barge-in. Added `_wait_for_wake()`, `_handle_command_in_transcript()`, `_trigger_reset()`. |
| `main.py` | No structural change — just updated health endpoint features list. |
| `esp32/main.c` | Added `button_task()` (GPIO 18), `button_isr_handler()`, `BTN_EVT_SHORT_PRESS` / `BTN_EVT_LONG_PRESS`. Audio task handles `WS_CMD_RESET` and `WS_CMD_START_LISTENING`. |
| `esp32/websocket.h/c` | Added `WS_CMD_RESET`, `WS_CMD_START_LISTENING`, `WS_CMD_STOP_LISTENING`. Added `ws_send_command()` function. |
| `client/app.js` | Added `updateUI()` with state-aware labels. Added keyboard shortcuts (Space = interrupt, R = reset). Added wake tone playback. |

## Cost Implications

| State | STT Calls | LLM Calls | TTS Calls |
|-------|-----------|-----------|-----------|
| IDLE | 1 per noise event (VAD-gated) | 0 | 0 |
| LISTENING | 1 per utterance | 0 | 0 |
| PROCESSING | 0 | 1 | 0 |
| SPEAKING | 0 (VAD only) | 0 | 1 |
| INTERRUPTED | 0 | 0 | 0 (cancelled) |

**Key**: In IDLE, STT only runs on audio that passes VAD (threshold 0.025 + hysteresis). Most ambient noise is filtered at the ESP32 level. Only intentional speech triggers STT.

## Testing Checklist

- [ ] Say "Hello" → companion wakes up (status changes to "Listening")
- [ ] Say "Tell me a story" → companion tells a story
- [ ] While speaking, say "Yo" → companion stops immediately
- [ ] While speaking, press mic button → companion stops immediately
- [ ] Say "Send" after speaking → companion processes immediately (no waiting for silence)
- [ ] Say "Reset" → conversation clears, returns to IDLE
- [ ] Hold mic button for 2s → conversation clears, returns to IDLE
- [ ] Say "WTF" while speaking → companion stops (interrupt works)
- [ ] Say "Capische" → end turn acknowledged
- [ ] Say random noise in IDLE → nothing happens (stays dormant)
