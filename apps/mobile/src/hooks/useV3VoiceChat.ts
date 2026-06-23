import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Character, ModeConfig } from '@/types';
import {
  getMessageCount,
  getSessionStart,
  incrementMessageCount,
  resetSessionStart,
  setSessionStart,
} from '@/lib/settings';
import { useVoiceSocket } from './useVoiceSocket';
import { useAudioWorklet } from './useAudioWorklet';

export type TurnState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface UseV3VoiceChatOptions {
  mode?: ModeConfig;
}

interface UseV3VoiceChatReturn {
  turnState: TurnState;
  lastTranscript: string;
  lastResponse: string;
  errorMessage: string;
  messages: ChatMessage[];
  messageCount: number;
  sessionDurationSeconds: number;
  toggleRecording: () => void;
  reset: () => void;
  sendText: (text: string) => Promise<void>;
  wakeListening: boolean;
}

function logError(message: string, error?: unknown, extra?: Record<string, unknown>) {
  console.error(message, error, extra);
}

export function useV3VoiceChat(
  character: Character | null,
  options: UseV3VoiceChatOptions = {}
): UseV3VoiceChatReturn {
  const { mode } = options;
  const [turnState, setTurnState] = useState<TurnState>('idle');
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

  // Live session timer
  useEffect(() => {
    const id = window.setInterval(() => {
      setSessionDurationSeconds(Math.floor((Date.now() - getSessionStart()) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const socket = useVoiceSocket();
  const audio = useAudioWorklet();

  // Sync server voice state to our local turn state.
  useEffect(() => {
    const serverState = socket.voiceState;
    if (serverState === 'idle') {
      setTurnState('idle');
    } else if (serverState === 'wake_detected' || serverState === 'listening') {
      setTurnState('listening');
    } else if (serverState === 'processing') {
      setTurnState('processing');
    } else if (serverState === 'speaking') {
      setTurnState('speaking');
    } else if (serverState === 'interrupted') {
      setTurnState('idle');
    }
  }, [socket.voiceState]);

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
        // Replace the last assistant message if it's still streaming, else append.
        if (prev.length > 0 && prev[prev.length - 1].role === 'assistant') {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', text: socket.assistantText };
          return next;
        }
        return [...prev, { role: 'assistant', text: socket.assistantText }];
      });
      incrementMessageCount(2);
      setMessageCount(getMessageCount());
    }
  }, [socket.assistantText]);

  // Surface server errors.
  useEffect(() => {
    if (socket.errorMessage) {
      setErrorMessage(socket.errorMessage);
      setTurnState('error');
    }
  }, [socket.errorMessage]);

  // Wire captured audio chunks into the WebSocket.
  useEffect(() => {
    audio.setOnAudioChunk((chunk) => {
      socket.sendAudio(chunk);
    });
  }, [audio, socket]);

  // Send config change whenever character or mode changes.
  useEffect(() => {
    if (character && socket.connectionState === 'connected') {
      socket.sendConfigChange(character.slug, mode?.slug ?? 'default');
    }
  }, [character, mode, socket]);

  const startListening = useCallback(async () => {
    if (getMessageCount() === 0) {
      setSessionStart(Date.now());
    }
    setErrorMessage('');
    setLastTranscript('');
    setLastResponse('');

    // Tell the server to enter listening mode, then start streaming mic audio.
    socket.sendCommand('wake');
    try {
      await audio.startCapture();
      setTurnState('listening');
    } catch (e) {
      logError('Microphone access failed', e);
      setErrorMessage('Microphone access is required to talk.');
      setTurnState('error');
    }
  }, [audio, socket]);

  const stopListening = useCallback(() => {
    audio.stopCapture();
    // Let the server detect end-of-utterance by silence; if already speaking,
    // treat a manual stop as an interrupt.
    if (turnStateRef.current === 'speaking') {
      socket.sendCommand('interrupt');
    }
  }, [audio, socket]);

  const toggleRecording = useCallback(() => {
    if (turnStateRef.current === 'listening') {
      stopListening();
    } else {
      void startListening();
    }
  }, [startListening, stopListening]);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      if (getMessageCount() === 0) {
        setSessionStart(Date.now());
      }

      setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
      setLastTranscript(trimmed);
      setErrorMessage('');
      setTurnState('processing');
      socket.sendTextInput(trimmed);
    },
    [socket]
  );

  const reset = useCallback(() => {
    audio.stopCapture();
    socket.sendCommand('reset');
    socket.stopPlayback();
    setTurnState('idle');
    setLastTranscript('');
    setLastResponse('');
    setErrorMessage('');
    setMessages([]);
    setMessageCount(0);
    resetSessionStart();
  }, [audio, socket]);

  useEffect(() => {
    return () => {
      audio.stopCapture();
      socket.stopPlayback();
    };
  }, [audio, socket]);

  return useMemo(
    () => ({
      turnState,
      lastTranscript,
      lastResponse,
      errorMessage,
      messages,
      messageCount,
      sessionDurationSeconds,
      toggleRecording,
      reset,
      sendText,
      wakeListening: false,
    }),
    [
      turnState,
      lastTranscript,
      lastResponse,
      errorMessage,
      messages,
      messageCount,
      sessionDurationSeconds,
      toggleRecording,
      reset,
      sendText,
    ]
  );
}
