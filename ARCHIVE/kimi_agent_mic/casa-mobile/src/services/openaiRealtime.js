/**
 * Casa Companion Voice V3 Client
 *
 * Connects to the Casa Voice V3 backend relay over WebSocket.
 *
 * Protocol:
 *   - Client → Server: binary PCM16 LE audio frames at 16 kHz.
 *   - Client → Server: JSON text frames for control/commands.
 *   - Server → Client: binary PCM16 LE audio frames (TTS playback).
 *   - Server → Client: JSON state/transcript/error messages.
 */
import EventEmitter from 'eventemitter3';

export const SESSION_STATE = {
  IDLE: 'idle',
  WAKE_DETECTED: 'wake_detected',
  LISTENING: 'listening',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  INTERRUPTED: 'interrupted',
  CONNECTING: 'connecting',
  ERROR: 'error',
  DISCONNECTED: 'disconnected',
};

class OpenAIRealtimeClient extends EventEmitter {
  constructor({ backendUrl, token, deviceId, character }) {
    super();
    this.backendUrl = backendUrl.replace(/\/$/, '');
    this.token = token;
    this.deviceId = deviceId || 'mobile-001';
    this.character = character;
    this.ws = null;
    this.state = SESSION_STATE.DISCONNECTED;
    this._bufferedAudio = [];
    this._pingInterval = null;
  }

  // ═══════════════════════════════════════════════════════════
  // Connection
  // ═══════════════════════════════════════════════════════════

  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === 1) {
        resolve();
        return;
      }

      this._setState(SESSION_STATE.CONNECTING);

      const url = `${this.backendUrl}/ws/voice/realtime/${encodeURIComponent(
        this.deviceId
      )}?token=${encodeURIComponent(this.token)}&character=${encodeURIComponent(
        this.character.key
      )}`;

      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        console.log('[Realtime] Connected to relay');
        this._setState(SESSION_STATE.IDLE);
        this.emit('connected');
        this._startPing();
        resolve();
      };

      this.ws.onmessage = (event) => {
        this._handleMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.error('[Realtime] WebSocket error:', err);
        this._setState(SESSION_STATE.ERROR);
        this.emit('error', err);
        reject(err);
      };

      this.ws.onclose = () => {
        console.log('[Realtime] Disconnected from relay');
        this._stopPing();
        this._setState(SESSION_STATE.DISCONNECTED);
        this.emit('disconnected');
      };
    });
  }

  disconnect() {
    this._stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._setState(SESSION_STATE.DISCONNECTED);
  }

  // ═══════════════════════════════════════════════════════════
  // Audio I/O
  // ═══════════════════════════════════════════════════════════

  /**
   * Send raw PCM16 LE audio to the backend as a binary frame.
   * @param {Uint8Array} pcm16 - 16-bit PCM little-endian data at 16 kHz
   */
  sendAudio(pcm16) {
    if (this.ws?.readyState !== 1) return;
    this.ws.send(pcm16);
  }

  /**
   * Manually end the current turn (e.g., user pressed a send button).
   * With server VAD this is usually automatic, but kept for parity.
   */
  commitAudio() {
    this._sendCommand('end_turn');
  }

  /**
   * Interrupt the AI mid-response (barge-in)
   */
  interrupt() {
    this._sendCommand('interrupt');
    this._bufferedAudio = [];
    this._setState(SESSION_STATE.INTERRUPTED);
  }

  /**
   * Reset conversation history
   */
  reset() {
    this._sendCommand('reset');
    this._bufferedAudio = [];
    this._setState(SESSION_STATE.IDLE);
  }

  /**
   * Switch character / mode
   */
  setCharacter(character) {
    this.character = character;
    if (this.ws?.readyState !== 1) return;
    this.ws.send(
      JSON.stringify({
        type: 'config_change',
        character: character.key,
      })
    );
  }

  // ═══════════════════════════════════════════════════════════
  // Internal
  // ═══════════════════════════════════════════════════════════

  _sendCommand(command) {
    if (this.ws?.readyState !== 1) return;
    this.ws.send(JSON.stringify({ type: 'command', command }));
  }

  _startPing() {
    this._stopPing();
    this._pingInterval = setInterval(() => {
      if (this.ws?.readyState === 1) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);
  }

  _stopPing() {
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
  }

  _handleMessage(data) {
    // Binary audio frame from the backend (TTS)
    if (data instanceof ArrayBuffer) {
      this._setState(SESSION_STATE.SPEAKING);
      this.emit('audioDelta', new Uint8Array(data));
      return;
    }

    // JSON control/status message
    let event;
    try {
      event = JSON.parse(data);
    } catch (err) {
      console.warn('[Realtime] Non-JSON message:', data);
      return;
    }

    switch (event.type) {
      // ── Status / state ─────────────────────────────
      case 'state_change': {
        const newState = event.state;
        this._setState(newState);
        if (newState === SESSION_STATE.LISTENING) {
          this.emit('speechStarted');
        }
        if (newState === SESSION_STATE.IDLE) {
          this.emit('responseDone');
        }
        break;
      }

      // ── User speech transcript ─────────────────────
      case 'transcript': {
        if (event.final && event.text) {
          this.emit('userTranscript', {
            text: event.text,
            isFinal: true,
          });
        }
        break;
      }

      // ── Assistant text (streaming) ─────────────────
      case 'assistant_text': {
        if (event.text) {
          this.emit('aiTranscript', {
            text: event.text,
            isFinal: true,
          });
        }
        break;
      }

      // ── Pong ───────────────────────────────────────
      case 'pong':
        break;

      // ── Errors ─────────────────────────────────────
      case 'error':
        console.error('[Realtime] Relay error:', event.message);
        this._setState(SESSION_STATE.ERROR);
        this.emit('error', event);
        break;

      default:
        console.log('[Realtime] Unhandled message type:', event.type);
        break;
    }
  }

  _setState(newState) {
    if (this.state === newState) return;
    this.state = newState;
    this.emit('stateChange', newState);
  }
}

export default OpenAIRealtimeClient;
