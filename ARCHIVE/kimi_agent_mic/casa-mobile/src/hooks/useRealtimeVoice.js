/**
 * Main Voice Session Hook
 *
 * Combines native audio recording/playback with the OpenAI Realtime API.
 * This is the brain of the app — kid speaks, AI responds, all hands-free.
 *
 * Usage:
 *   const { state, messages, character, switchCharacter, interrupt, isConnected } = useRealtimeVoice('YOUR_API_KEY');
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import OpenAIRealtimeClient, { SESSION_STATE } from '../services/openaiRealtime';
import { useNativeAudio } from './useNativeAudio';
import { CHARACTERS, DEFAULT_CHARACTER } from '../constants/characters';

export function useRealtimeVoice({ backendUrl, token, deviceId }) {
  const [state, setState] = useState(SESSION_STATE.DISCONNECTED);
  const [messages, setMessages] = useState([]); // { id, sender, text, timestamp }
  const [character, setCharacter] = useState(DEFAULT_CHARACTER);
  const [isConnected, setIsConnected] = useState(false);

  const clientRef = useRef(null);
  const currentTranscriptRef = useRef('');
  const messageIdRef = useRef(0);

  const { startRecording, stopRecording, playAudio, stopPlayback } = useNativeAudio();

  // ═══════════════════════════════════════════════════════════
  // Connect on mount
  // ═══════════════════════════════════════════════════════════

  useEffect(() => {
    if (!backendUrl || !token) return;

    const client = new OpenAIRealtimeClient({ backendUrl, token, deviceId, character });
    clientRef.current = client;

    // ── State changes ──────────────────────────────
    client.on('stateChange', (newState) => {
      setState(newState);
    });

    client.on('connected', () => {
      setIsConnected(true);
      // Start recording immediately — no button needed
      _startMic();
    });

    client.on('disconnected', () => {
      setIsConnected(false);
    });

    // ── User speech transcript ─────────────────────
    client.on('userTranscript', ({ text }) => {
      if (!text.trim()) return;
      _addMessage('kid', text);
    });

    // ── AI transcript (streaming) ──────────────────
    client.on('aiTranscript', ({ text, isFinal }) => {
      if (isFinal) {
        _addMessage('ai', text);
        currentTranscriptRef.current = '';
      } else {
        // Streaming partial — update last AI message
        currentTranscriptRef.current = text;
        _updateLastAiMessage(text);
      }
    });

    // ── Audio playback ─────────────────────────────
    client.on('audioDelta', async (pcmData) => {
      // Play each audio chunk as it arrives
      // For smoother playback, you could buffer 200-500ms worth
      await playAudio(pcmData);
    });

    // ── Speech events ──────────────────────────────
    client.on('speechStarted', () => {
      // Kid started talking — stop any AI playback
      stopPlayback();
    });

    client.on('responseDone', () => {
      // AI finished speaking — ready for next input
    });

    // ── Errors ─────────────────────────────────────
    client.on('error', (err) => {
      console.error('[VoiceSession] Error:', err);
      _addMessage('system', 'Connection error. Retrying...');
      // Auto-reconnect after 2s
      setTimeout(() => client.connect(), 2000);
    });

    // Connect
    client.connect().catch(console.error);

    // Cleanup
    return () => {
      stopRecording();
      stopPlayback();
      client.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, token, deviceId]);

  // ═══════════════════════════════════════════════════════════
  // Character switching
  // ═══════════════════════════════════════════════════════════

  const switchCharacter = useCallback((characterKey) => {
    const newChar = CHARACTERS[characterKey];
    if (!newChar) return;
    setCharacter(newChar);
    clientRef.current?.setCharacter(newChar);
    _addMessage('system', `Switched to ${newChar.name}`);
  }, []);

  // ═══════════════════════════════════════════════════════════
  // Controls
  // ═══════════════════════════════════════════════════════════

  const interrupt = useCallback(() => {
    clientRef.current?.interrupt();
    stopPlayback();
  }, [stopPlayback]);

  const reset = useCallback(() => {
    clientRef.current?.reset();
    setMessages([]);
  }, []);

  // ═══════════════════════════════════════════════════════════
  // Internal helpers
  // ═══════════════════════════════════════════════════════════

  async function _startMic() {
    try {
      await startRecording((pcmChunk) => {
        // Stream raw PCM to OpenAI
        clientRef.current?.sendAudio(pcmChunk);
      });
    } catch (err) {
      console.error('[VoiceSession] Mic error:', err);
      _addMessage('system', 'Microphone error. Please check permissions.');
    }
  }

  function _addMessage(sender, text) {
    const id = ++messageIdRef.current;
    setMessages(prev => [...prev, {
      id,
      sender,
      text,
      timestamp: Date.now(),
    }]);
  }

  function _updateLastAiMessage(text) {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last && last.sender === 'ai' && !last.isFinal) {
        return [
          ...prev.slice(0, -1),
          { ...last, text },
        ];
      }
      return [...prev, {
        id: ++messageIdRef.current,
        sender: 'ai',
        text,
        timestamp: Date.now(),
        isFinal: false,
      }];
    });
  }

  return {
    state,
    messages,
    character,
    isConnected,
    switchCharacter,
    interrupt,
    reset,
    SESSION_STATE,
  };
}
