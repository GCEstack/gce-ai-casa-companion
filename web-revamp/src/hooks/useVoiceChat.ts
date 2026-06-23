import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import type { AiMode, ModeConfig, TurnState } from '@/types';
import { useVoiceSocket } from './useVoiceSocket';
import { useAudioWorklet } from './useAudioWorklet';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface UseVoiceChatReturn {
  isConnected: boolean;
  isRecording: boolean;
  isSpeaking: boolean;
  conversationMode: 'turn-based' | 'free-flow';
  turnState: TurnState;
  currentMode: AiMode;
  lastTranscript: string;
  lastResponse: string;
  messages: ChatMessage[];
  connect: () => Promise<void>;
  disconnect: () => void;
  startRecording: () => void;
  stopRecording: () => Promise<Blob | null>;
  toggleRecording: () => Promise<void>;
  requestMicPermission: () => Promise<boolean>;
  setConversationMode: (mode: 'turn-based' | 'free-flow') => void;
  speakResponse: () => void;
  stopSpeaking: () => void;
  sendText: (text: string) => Promise<void>;
}

// Legacy waveform API stubs. VoiceWaveform.tsx still registers here;
// the waveform is now driven by the server-side pipeline rather than local VAD.
interface WaveformApi {
  setData: (data: number[]) => void;
}
const waveformApiRef = { current: null as WaveformApi | null };
export function registerWaveform(api: WaveformApi) {
  waveformApiRef.current = api;
}
export function unregisterWaveform() {
  waveformApiRef.current = null;
}

function mapVoiceStateToTurnState(voiceState: string): TurnState {
  if (voiceState === 'speaking') return 'speaking';
  if (voiceState === 'processing') return 'processing';
  if (voiceState === 'listening' || voiceState === 'wake_detected') return 'listening';
  return 'idle';
}

export function useVoiceChat(slug: string, activeMode?: ModeConfig): UseVoiceChatReturn {
  const { state, dispatch } = useApp();
  const socket = useVoiceSocket();
  const audio = useAudioWorklet();

  const [lastTranscript, setLastTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationMode, setConversationModeState] = useState<'turn-based' | 'free-flow'>(
    state.conversationMode ?? 'turn-based'
  );

  const turnState = useMemo(() => mapVoiceStateToTurnState(socket.voiceState), [socket.voiceState]);
  const isRecording = socket.voiceState === 'listening' || socket.voiceState === 'wake_detected';
  const isSpeaking = socket.voiceState === 'speaking';
  const isConnected = socket.connectionState === 'connected';

  // Reflect socket state into AppContext so existing UI stays in sync.
  useEffect(() => {
    if (state.connectionStatus !== (isConnected ? 'online' : 'offline')) {
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: isConnected ? 'online' : 'offline' });
    }
  }, [isConnected, state.connectionStatus, dispatch]);

  useEffect(() => {
    if (state.isRecording !== isRecording) {
      dispatch({ type: 'SET_RECORDING', payload: isRecording });
    }
  }, [isRecording, state.isRecording, dispatch]);

  useEffect(() => {
    if (state.isSpeaking !== isSpeaking) {
      dispatch({ type: 'SET_SPEAKING', payload: isSpeaking });
    }
  }, [isSpeaking, state.isSpeaking, dispatch]);

  // Wire captured PCM into the WebSocket.
  useEffect(() => {
    audio.setOnAudioChunk((chunk) => {
      socket.sendAudio(chunk);
    });
  }, [audio, socket]);

  // Update transcript and assistant messages as they arrive.
  useEffect(() => {
    if (socket.transcript) {
      setLastTranscript(socket.transcript);
    }
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
      dispatch({ type: 'INCREMENT_MESSAGES' });
    }
  }, [socket.assistantText, dispatch]);

  // Send config change whenever character or mode changes.
  useEffect(() => {
    if (isConnected) {
      socket.sendConfigChange(slug, activeMode?.slug ?? 'default');
    }
  }, [slug, activeMode, isConnected, socket]);

  const connect = useCallback(async () => {
    socket.connect();
  }, [socket]);

  const disconnect = useCallback(() => {
    audio.stopCapture();
    socket.disconnect();
  }, [audio, socket]);

  const startRecording = useCallback(() => {
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

  const setConversationMode = useCallback((mode: 'turn-based' | 'free-flow') => {
    setConversationModeState(mode);
    dispatch({ type: 'SET_CONVERSATION_MODE', payload: mode });
  }, [dispatch]);

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
      socket.sendTextInput(trimmed);
    },
    [socket]
  );

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      audio.stopCapture();
      socket.stopPlayback();
    };
  }, [audio, socket]);

  return {
    isConnected,
    isRecording,
    isSpeaking,
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
    speakResponse: () => {}, // no-op: v3-dual speaks automatically
    stopSpeaking,
    sendText,
  };
}
