import { useCallback, useEffect, useRef, useState } from 'react';
import type { Character, ModeConfig } from '@/types';
import {
  getMessageCount,
  getSessionStart,
  incrementMessageCount,
  isVoiceEnabled,
  setSessionStart,
} from '@/lib/settings';
import { useAudioWorklet } from './useAudioWorklet';
import { useVoiceSocket, type VoiceState } from './useVoiceSocket';

export type { TurnState } from './useVoiceSocket';

const VOICE_SERVER_URL =
  import.meta.env.VITE_VOICE_SERVER_URL ||
  (typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? `wss://${window.location.host}`
    : `ws://${window.location.host}`);

const VOICE_SERVER_TOKEN = import.meta.env.VITE_VOICE_SERVER_API_KEY;

function log(...args: unknown[]) {
  console.log('[V3VoiceChat]', ...args);
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface UseV3VoiceChatOptions {
  mode?: ModeConfig;
}

interface UseV3VoiceChatReturn {
  turnState: VoiceState;
  lastTranscript: string;
  lastResponse: string;
  errorMessage: string;
  messages: ChatMessage[];
  messageCount: number;
  sessionDurationSeconds: number;
  isConnected: boolean;
  isConnecting: boolean;
  toggleRecording: () => void;
  reset: () => void;
  sendText: (text: string) => Promise<void>;
  wakeListening: boolean;
}

export function useV3VoiceChat(
  character: Character | null,
  options: UseV3VoiceChatOptions = {}
): UseV3VoiceChatReturn {
  const { mode } = options;

  const [turnState, setTurnState] = useState<VoiceState>('idle');
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageCount, setMessageCount] = useState(() => getMessageCount());
  const [sessionDurationSeconds, setSessionDurationSeconds] = useState(() =>
    Math.floor((Date.now() - getSessionStart()) / 1000)
  );

  const characterRef = useRef(character);
  const modeRef = useRef(mode);
  const voiceEnabledRef = useRef(isVoiceEnabled());
  const turnStateRef = useRef(turnState);

  useEffect(() => {
    characterRef.current = character;
  }, [character]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    turnStateRef.current = turnState;
  }, [turnState]);

  // Keep voice toggle in sync with settings when not mid-turn.
  useEffect(() => {
    if (turnState === 'idle' || turnState === 'interrupted') {
      voiceEnabledRef.current = isVoiceEnabled();
    }
  }, [turnState]);

  // Live session timer
  useEffect(() => {
    const id = window.setInterval(() => {
      setSessionDurationSeconds(Math.floor((Date.now() - getSessionStart()) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleStateChange = useCallback((state: VoiceState) => {
    log('state', state);
    setTurnState(state);
    if (state === 'processing' || state === 'speaking') {
      audio.stopRecording();
    }
  }, []);

  const handleTranscript = useCallback((text: string, isFinal: boolean) => {
    if (!isFinal) return;
    setLastTranscript(text);
    setMessages((prev) => [...prev, { role: 'user', text }]);
    incrementMessageCount();
    setMessageCount(getMessageCount());
  }, []);

  const handleAssistantText = useCallback((text: string) => {
    setLastResponse(text);
    setMessages((prev) => {
      // Replace the last assistant message if it exists, otherwise append.
      if (prev.length > 0 && prev[prev.length - 1].role === 'assistant') {
        return [...prev.slice(0, -1), { role: 'assistant', text }];
      }
      return [...prev, { role: 'assistant', text }];
    });
    incrementMessageCount();
    setMessageCount(getMessageCount());
  }, []);

  const handleError = useCallback((code: string, message: string) => {
    log('server error', code, message);
    setErrorMessage(`${code}: ${message}`);
  }, []);

  const audio = useAudioWorklet({
    onPcmFrame: useCallback((pcm: ArrayBuffer) => {
      socket.sendBinary(pcm);
    }, []),
    onError: useCallback((msg: string) => {
      setErrorMessage(msg);
    }, []),
  });

  const socket = useVoiceSocket({
    url: VOICE_SERVER_URL,
    token: VOICE_SERVER_TOKEN,
    sessionId: 'mobile',
    deviceType: 'audio',
    onStateChange: handleStateChange,
    onTranscript: handleTranscript,
    onAssistantText: handleAssistantText,
    onError: handleError,
    onBinary: useCallback((pcm: ArrayBuffer) => {
      if (voiceEnabledRef.current) {
        audio.playPcm(pcm);
      }
    }, [audio]),
    reconnect: true,
  });

  // Send character/mode config when it changes and we're connected.
  useEffect(() => {
    if (!socket.connected || !character) return;
    const v3Character = mapCharacterToV3(character.slug);
    const v3Mode = mapModeToV3(mode?.slug);
    socket.sendConfigChange({ character: v3Character, mode: v3Mode });
  }, [socket.connected, character, mode, socket.sendConfigChange]);

  const toggleRecording = useCallback(() => {
    const state = turnStateRef.current;
    setErrorMessage('');

    if (state === 'listening' || state === 'wake_detected') {
      // Stop streaming; server will detect silence and process.
      audio.stopRecording();
      return;
    }

    if (state === 'speaking') {
      // Barge-in / interrupt
      socket.sendCommand('interrupt');
      audio.stopPlayback();
      return;
    }

    // idle, interrupted, or error: start a new turn
    if (getMessageCount() === 0) {
      setSessionStart(Date.now());
    }
    setLastTranscript('');
    setLastResponse('');

    socket.sendCommand('wake');
    void audio.unlockAudio().then(() => audio.startRecording());
  }, [audio, socket]);

  const reset = useCallback(() => {
    socket.sendCommand('reset');
    audio.stopRecording();
    audio.stopPlayback();
    setTurnState('idle');
    setLastTranscript('');
    setLastResponse('');
    setErrorMessage('');
    setMessages([]);
    setMessageCount(0);
    setSessionStart(Date.now());
  }, [socket, audio]);

  const sendText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      await audio.unlockAudio();

      if (getMessageCount() === 0) {
        setSessionStart(Date.now());
      }

      setMessages((prev) => [...prev, { role: 'user', text: text.trim() }]);
      setErrorMessage('');

      // v3-dual supports typed text via the `text_input` WebSocket message.
      if (socket.connected) {
        socket.sendTextInput(text.trim());
      } else {
        setErrorMessage('Not connected to voice server.');
      }
    },
    [socket, audio]
  );

  return {
    turnState,
    lastTranscript,
    lastResponse,
    errorMessage,
    messages,
    messageCount,
    sessionDurationSeconds,
    isConnected: socket.connected,
    isConnecting: socket.connecting,
    toggleRecording,
    reset,
    sendText,
    wakeListening: false,
  };
}

function mapCharacterToV3(slug: string): string {
  const s = slug.toLowerCase();
  if (s.includes('drago') || s.includes('dragon')) return 'drago';
  if (s.includes('liam') || s.includes('peter') || s.includes('jimmy')) return 'liam';
  if (s.includes('jenny') || s.includes('jennifer')) return 'jenny';
  return 'default';
}

function mapModeToV3(slug?: string): string {
  if (!slug) return 'default';
  const s = slug.toLowerCase();
  if (s.includes('story')) return 'story';
  if (s.includes('play')) return 'play';
  if (s.includes('quick') || s.includes('chat')) return 'quick_chat';
  return 'default';
}
