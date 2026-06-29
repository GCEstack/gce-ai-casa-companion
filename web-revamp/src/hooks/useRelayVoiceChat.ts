import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { usePCMPlayback } from './usePCMPlayback';
import type { UseVoiceChatReturn } from './useVoiceChat';

const BACKEND_WS = import.meta.env.VITE_VOICE_SERVER_URL || 'wss://casa-voice-agent.fly.dev';

interface RelayOptions {
  sessionId: string;
  token: string;
  deviceId: string;
  characterSlug: string;
  modeSlug: string;
}

export function useRelayVoiceChat({
  sessionId,
  token,
  deviceId,
  characterSlug,
  modeSlug,
}: RelayOptions): UseVoiceChatReturn {
  const { dispatch } = useApp();
  const [turnState, setTurnState] = useState<UseVoiceChatReturn['turnState']>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [messages, setMessages] = useState<UseVoiceChatReturn['messages']>([]);
  const [conversationMode, setConversationModeState] = useState<'turn-based' | 'free-flow'>('turn-based');
  const [sampleRate, setSampleRate] = useState(16000);
  const { playChunk, stop: stopPlayback } = usePCMPlayback(sampleRate);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const intentionalDisconnectRef = useRef(false);

  const handleMessage = useCallback(
    (msg: Record<string, unknown>) => {
      switch (msg.type) {
        case 'state_change': {
          const raw = msg.state as UseVoiceChatReturn['turnState'] | 'wake_detected';
          const mapped: UseVoiceChatReturn['turnState'] = raw === 'wake_detected' ? 'listening' : raw;
          setTurnState(mapped);
          dispatch({ type: 'SET_RECORDING', payload: mapped === 'listening' });
          dispatch({ type: 'SET_SPEAKING', payload: mapped === 'speaking' });
          break;
        }
        case 'transcript': {
          if (!msg.text || typeof msg.text !== 'string') return;
          const userText = msg.text;
          setLastTranscript(userText);
          setMessages((prev) => [...prev, { role: 'user', text: userText }]);
          break;
        }
        case 'assistant_text': {
          if (!msg.text || typeof msg.text !== 'string') return;
          const assistantTextValue = msg.text;
          setLastResponse(assistantTextValue);
          setMessages((prev) => {
            if (prev.length > 0 && prev[prev.length - 1].role === 'assistant') {
              const next = [...prev];
              next[next.length - 1] = { role: 'assistant', text: assistantTextValue };
              return next;
            }
            return [...prev, { role: 'assistant', text: assistantTextValue }];
          });
          dispatch({ type: 'INCREMENT_MESSAGES' });
          break;
        }
        case 'tts_chunk': {
          const fmt: string = (msg.format as string) || 'pcm_s16le_16000';
          const rate = parseInt(fmt.split('_').pop() || '16000', 10);
          if (!Number.isNaN(rate) && rate !== sampleRate) {
            setSampleRate(rate);
          }
          break;
        }
        case 'error': {
          console.error('[relay] server error:', msg.message);
          break;
        }
        default:
          break;
      }
    },
    [dispatch, sampleRate]
  );

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (!sessionId || !token) return;

    intentionalDisconnectRef.current = false;
    clearReconnectTimer();

    const url =
      `${BACKEND_WS.replace(/\/$/, '')}/ws/voice/realtime/${encodeURIComponent(deviceId)}` +
      `?token=${encodeURIComponent(token)}` +
      `&session_id=${encodeURIComponent(sessionId)}` +
      `&client_type=audio` +
      `&character=${encodeURIComponent(characterSlug)}` +
      `&mode=${encodeURIComponent(modeSlug)}`;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectCountRef.current = 0;
      setIsConnected(true);
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: 'online' });
      dispatch({ type: 'SET_MIC_PERMISSION', payload: true });
    };

    ws.onclose = () => {
      setIsConnected(false);
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: 'offline' });
      dispatch({ type: 'SET_RECORDING', payload: false });
      dispatch({ type: 'SET_SPEAKING', payload: false });

      if (
        !intentionalDisconnectRef.current &&
        reconnectCountRef.current < 5 &&
        sessionId &&
        token
      ) {
        const delay = Math.min(1000 * 2 ** reconnectCountRef.current, 30000);
        reconnectCountRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      }
    };

    ws.onerror = (e) => {
      console.error('[relay] websocket error:', e);
      setIsConnected(false);
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        dispatch({ type: 'SET_SPEAKING', payload: true });
        playChunk(new Uint8Array(event.data));
        return;
      }
      try {
        handleMessage(JSON.parse(event.data as string));
      } catch {
        // ignore non-JSON text
      }
    };
  }, [sessionId, token, deviceId, characterSlug, modeSlug, dispatch, playChunk, handleMessage, clearReconnectTimer]);

  const disconnect = useCallback(() => {
    intentionalDisconnectRef.current = true;
    clearReconnectTimer();
    reconnectCountRef.current = 0;
    wsRef.current?.close();
    wsRef.current = null;
    stopPlayback();
  }, [stopPlayback, clearReconnectTimer]);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !wsRef.current) return;
      wsRef.current.send(JSON.stringify({ type: 'text_input', text: trimmed }));
    },
    []
  );

  const toggleRecording = useCallback(async () => {
    if (turnState === 'speaking') {
      wsRef.current?.send(JSON.stringify({ type: 'command', command: 'interrupt' }));
    }
  }, [turnState]);

  const stopSpeaking = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'command', command: 'interrupt' }));
    stopPlayback();
  }, [stopPlayback]);

  const startRecording = useCallback(() => {
    // Relay mode does not capture audio locally; the parent phone is the mic.
  }, []);

  const stopRecording = useCallback(async () => {
    if (turnState === 'speaking') {
      wsRef.current?.send(JSON.stringify({ type: 'command', command: 'interrupt' }));
    }
    return null;
  }, [turnState]);

  const requestMicPermission = useCallback(async () => {
    // Mic lives on parent phone in relay mode.
    dispatch({ type: 'SET_MIC_PERMISSION', payload: true });
    return true;
  }, [dispatch]);

  const setConversationMode = useCallback(
    (mode: 'turn-based' | 'free-flow') => {
      setConversationModeState(mode);
      dispatch({ type: 'SET_CONVERSATION_MODE', payload: mode });
    },
    [dispatch]
  );

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    isRecording: turnState === 'listening',
    isSpeaking: turnState === 'speaking',
    conversationMode,
    turnState,
    currentMode: 'default',
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
    speakResponse: () => {},
    stopSpeaking,
    sendText,
  };
}
