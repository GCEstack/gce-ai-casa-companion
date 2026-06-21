import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { usePCMPlayback } from './usePCMPlayback';
import type { ChatMessage, UseVoiceChatReturn } from './useVoiceChat';

const BACKEND_WS = import.meta.env.VITE_BACKEND_WS_URL || 'wss://casa-voice-agent.fly.dev';

interface RelayOptions {
  sessionId: string;
  token: string;
  deviceId: string;
  characterSlug: string;
}

export function useRelayVoiceChat({ sessionId, token, deviceId, characterSlug }: RelayOptions): UseVoiceChatReturn {
  const { dispatch } = useApp();
  const [turnState, setTurnState] = useState<UseVoiceChatReturn['turnState']>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sampleRate, setSampleRate] = useState(16000);
  const { playChunk, stop: stopPlayback } = usePCMPlayback(sampleRate);
  const wsRef = useRef<WebSocket | null>(null);

  const handleMessage = useCallback(
    (msg: any) => {
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
          if (!msg.text) return;
          setLastTranscript(msg.text);
          setMessages((prev) => [...prev, { role: 'user', text: msg.text }]);
          break;
        }
        case 'assistant_text': {
          if (!msg.text) return;
          setLastResponse(msg.text);
          setMessages((prev) => [...prev, { role: 'assistant', text: msg.text }]);
          break;
        }
        case 'tts_chunk': {
          const fmt: string = msg.format || 'pcm_s16le_16000';
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
      }
    },
    [dispatch, sampleRate]
  );

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const url =
      `${BACKEND_WS}/ws/voice/realtime/${encodeURIComponent(deviceId)}` +
      `?token=${encodeURIComponent(token)}` +
      `&session_id=${encodeURIComponent(sessionId)}` +
      `&client_type=audio` +
      `&character=${encodeURIComponent(characterSlug)}`;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: 'online' });
      dispatch({ type: 'SET_MIC_PERMISSION', payload: true });
    };

    ws.onclose = () => {
      setIsConnected(false);
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: 'offline' });
      dispatch({ type: 'SET_RECORDING', payload: false });
      dispatch({ type: 'SET_SPEAKING', payload: false });
    };

    ws.onerror = (e) => console.error('[relay] websocket error:', e);

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        dispatch({ type: 'SET_SPEAKING', payload: true });
        playChunk(new Uint8Array(event.data));
        return;
      }
      try {
        handleMessage(JSON.parse(event.data));
      } catch {
        // ignore non-JSON text
      }
    };
  }, [sessionId, token, deviceId, characterSlug, dispatch, playChunk, handleMessage]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    stopPlayback();
  }, [stopPlayback]);

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
    } else if (turnState === 'listening') {
      wsRef.current?.send(JSON.stringify({ type: 'command', command: 'end_turn' }));
    }
  }, [turnState]);

  const stopSpeaking = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'command', command: 'interrupt' }));
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    isRecording: turnState === 'listening',
    isSpeaking: turnState === 'speaking',
    conversationMode: 'turn-based' as const,
    turnState,
    currentMode: 'default' as const,
    lastTranscript,
    lastResponse,
    messages,
    connect,
    disconnect,
    startRecording: () => {},
    stopRecording: async () => null,
    toggleRecording,
    requestMicPermission: async () => true,
    setConversationMode: () => {},
    speakResponse: () => {},
    stopSpeaking,
    sendText,
  };
}
