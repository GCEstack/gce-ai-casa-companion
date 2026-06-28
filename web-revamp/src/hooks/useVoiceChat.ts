import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/context/AppContext';
import type { AiMode, ModeConfig, TurnState } from '@/types';
import { fetchBackendChat, fetchBackendTTS, getBackendUrl } from '@/lib/tts';

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

// Legacy waveform API stubs. VoiceWaveform.tsx still registers here.
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

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

function storageKey(slug: string) {
  return `casa-chat-${slug}`;
}

export function useVoiceChat(slug: string, activeMode?: ModeConfig): UseVoiceChatReturn {
  const { state, dispatch } = useApp();

  const [isConnected, setIsConnected] = useState(false);
  const [turnState, setTurnState] = useState<TurnState>('idle');
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey(slug));
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore corrupt storage
    }
    return [];
  });
  const [conversationMode, setConversationModeState] = useState<'turn-based' | 'free-flow'>(
    state.conversationMode ?? 'turn-based'
  );

  const isRecording = turnState === 'listening';
  const isSpeaking = turnState === 'speaking';

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingTranscriptRef = useRef('');
  const isMountedRef = useRef(true);

  // Persist messages locally.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(slug), JSON.stringify(messages));
    } catch {
      // ignore storage errors
    }
  }, [messages, slug]);

  // Reflect state into AppContext so existing UI stays in sync.
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

  // Health check on mount.
  useEffect(() => {
    let cancelled = false;
    fetch(`${getBackendUrl()}/health`, { method: 'GET' })
      .then((res) => {
        if (!cancelled) setIsConnected(res.ok);
      })
      .catch(() => {
        if (!cancelled) setIsConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  }, []);

  const playAudio = useCallback(
    async (blob: Blob) => {
      stopAudio();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      setTurnState('speaking');
      return new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (isMountedRef.current) setTurnState('idle');
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          if (isMountedRef.current) setTurnState('idle');
          resolve();
        };
        void audio.play();
      });
    },
    [stopAudio]
  );

  const processText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setTurnState('idle');
        return;
      }
      setLastTranscript(trimmed);
      const history: { role: 'user' | 'assistant'; content: string }[] = messages.map((m) => ({
        role: m.role,
        content: m.text,
      }));
      setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
      setTurnState('processing');
      try {
        const mode = activeMode?.slug ?? 'default';
        const reply = await fetchBackendChat(trimmed, slug, mode, history);
        setLastResponse(reply.text);
        setMessages((prev) => {
          if (prev.length > 0 && prev[prev.length - 1].role === 'assistant') {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', text: reply.text };
            return next;
          }
          return [...prev, { role: 'assistant', text: reply.text }];
        });
        dispatch({ type: 'INCREMENT_MESSAGES' });
        const audio = await fetchBackendTTS(reply.text, slug, mode, 'wav');
        await playAudio(audio);
      } catch (err) {
        console.error('Voice chat turn failed:', err);
        setLastResponse('Sorry, I had trouble answering. Try again!');
        setTurnState('idle');
      }
    },
    [activeMode, dispatch, messages, playAudio, slug]
  );

  const initRecognition = useCallback(() => {
    if (recognitionRef.current) return;
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      console.warn('SpeechRecognition not supported in this browser');
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let final = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const alt = result[0];
        if (result.isFinal) {
          final += alt.transcript;
        } else {
          interim += alt.transcript;
        }
      }
      pendingTranscriptRef.current = final || interim;
      setLastTranscript(final || interim);
    };

    recognition.onend = () => {
      // If the user is still holding the mic, restart.
      if (turnState === 'listening' && recognitionRef.current) {
        try {
          recognition.start();
        } catch {
          // already started or stopped
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech') return;
      console.error('SpeechRecognition error:', event.error);
      if (turnState === 'listening') {
        setTurnState('idle');
      }
    };

    recognitionRef.current = recognition;
  }, [turnState]);

  const connect = useCallback(async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/health`);
      setIsConnected(res.ok);
    } catch {
      setIsConnected(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    stopAudio();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setTurnState('idle');
  }, [stopAudio]);

  const startRecording = useCallback(() => {
    setLastTranscript('');
    setLastResponse('');
    pendingTranscriptRef.current = '';
    initRecognition();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setTurnState('listening');
      } catch (err) {
        console.error('Failed to start recognition:', err);
      }
    }
  }, [initRecognition]);

  const stopRecording = useCallback(async () => {
    stopAudio();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    const transcript = pendingTranscriptRef.current;
    pendingTranscriptRef.current = '';
    if (transcript) {
      await processText(transcript);
    } else {
      setTurnState('idle');
    }
    return null;
  }, [processText, stopAudio]);

  const toggleRecording = useCallback(async () => {
    if (turnState === 'listening') {
      await stopRecording();
    } else {
      startRecording();
    }
  }, [turnState, startRecording, stopRecording]);

  const requestMicPermission = useCallback(async () => {
    try {
      const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
      if (!SpeechRecognitionCtor) {
        dispatch({ type: 'SET_MIC_PERMISSION', payload: false });
        return false;
      }
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      await new Promise<void>((resolve, reject) => {
        recognition.onstart = () => {
          try {
            recognition.stop();
          } catch {
            // ignore
          }
          resolve();
        };
        recognition.onerror = (event) => {
          reject(new Error(event.error));
        };
        recognition.start();
      });
      dispatch({ type: 'SET_MIC_PERMISSION', payload: true });
      return true;
    } catch {
      dispatch({ type: 'SET_MIC_PERMISSION', payload: false });
      return false;
    }
  }, [dispatch]);

  const setConversationMode = useCallback(
    (mode: 'turn-based' | 'free-flow') => {
      setConversationModeState(mode);
      dispatch({ type: 'SET_CONVERSATION_MODE', payload: mode });
    },
    [dispatch]
  );

  const stopSpeaking = useCallback(() => {
    stopAudio();
    setTurnState('idle');
  }, [stopAudio]);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await processText(trimmed);
    },
    [processText]
  );

  const speakResponse = useCallback(() => {
    // no-op: the last response was already spoken.  Re-trigger could be added here.
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopAudio();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, [stopAudio]);

  const currentMode = useMemo<AiMode>(() => {
    const mode = activeMode?.slug ?? 'default';
    if (mode === 'story' || mode === 'math' || mode === 'homework' || mode === 'teaching' || mode === 'calm' || mode === 'creative' || mode === 'debate') {
      return mode as AiMode;
    }
    return 'default';
  }, [activeMode]);

  return {
    isConnected,
    isRecording,
    isSpeaking,
    conversationMode,
    turnState,
    currentMode,
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
    speakResponse,
    stopSpeaking,
    sendText,
  };
}
