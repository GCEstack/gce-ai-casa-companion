import { useCallback, useEffect, useRef, useState } from 'react';
import type { Character, ModeConfig } from '@/types';
import {
  getMessageCount,
  getSessionStart,
  getSttProvider,
  getWakeEndPhrases,
  incrementMessageCount,
  isVoiceEnabled,
  isWakeWordEnabled,
  resetSessionStart,
  setSessionStart,
} from '@/lib/settings';
import { useRecorder } from './useRecorder';
import { useTranscription } from './useTranscription';
import { useSpeech } from './useSpeech';
import { useWakeWord, type TurnState } from './useWakeWord';

function logError(message: string, error?: unknown, extra?: Record<string, unknown>) {
  console.error(message, error, extra);
}

function stripEndCommandPhrases(text: string): string {
  const endPhrases = getWakeEndPhrases()
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  let cleaned = text.trim();
  for (const phrase of endPhrases) {
    if (!cleaned) break;
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[\\s\\p{P}])${escaped}(?:[\\s\\p{P}])*$`, 'iu');
    cleaned = cleaned.replace(re, '').trim();
  }
  return cleaned.replace(/[\s\p{P}]+$/u, '').trim();
}

export type { TurnState };

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface UseVoiceChatOptions {
  mode?: ModeConfig;
}

interface UseVoiceChatReturn {
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

export function useVoiceChat(
  character: Character | null,
  options: UseVoiceChatOptions = {}
): UseVoiceChatReturn {
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
  const voiceEnabledRef = useRef(isVoiceEnabled());
  const turnStateRef = useRef(turnState);
  const startRecordingRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    characterRef.current = character;
  }, [character]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    turnStateRef.current = turnState;
  }, [turnState]);

  // Keep voice toggle in sync with settings when not mid-turn
  useEffect(() => {
    if (turnState === 'idle' || turnState === 'error') {
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

  // Speech pipeline callbacks
  const handleResponseText = useCallback((text: string) => {
    setLastResponse(text);
    setMessages((prev) => [...prev, { role: 'assistant', text }]);
    incrementMessageCount(2);
    setMessageCount(getMessageCount());
  }, []);

  const handleAudioStart = useCallback(() => setTurnState('speaking'), []);
  const handleAudioEnd = useCallback(() => setTurnState('idle'), []);
  const handleSpeechError = useCallback((msg: string) => {
    setErrorMessage(msg);
    setTurnState('error');
  }, []);

  const speech = useSpeech({
    characterRef,
    modeRef,
    voiceEnabledRef,
    onResponseText: handleResponseText,
    onAudioStart: handleAudioStart,
    onAudioEnd: handleAudioEnd,
    onError: handleSpeechError,
  });

  // Process user text (shared by voice and text input)
  const processUserText = useCallback(
    async (userText: string) => {
      const trimmed = stripEndCommandPhrases(userText);
      if (!trimmed) return;

      if (getMessageCount() === 0) {
        setSessionStart(Date.now());
      }

      setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
      setTurnState('processing');
      setErrorMessage('');

      await speech.speak(trimmed);
    },
    [speech]
  );

  // Transcription with browser fallback handling
  const handleBrowserFallbackStart = useCallback(() => {
    setErrorMessage('Deepgram failed, trying browser speech...');
    setTurnState('listening');
  }, []);

  const transcription = useTranscription({
    onBrowserFallbackStart: handleBrowserFallbackStart,
  });

  // Recorder callbacks
  const handleRecorderStop = useCallback(
    async (blob: Blob, mimeType: string) => {
      setTurnState('processing');
      setErrorMessage('');

      if (blob.size < 100) {
        setErrorMessage('Recording too short. Try speaking a little longer.');
        setTurnState('idle');
        return;
      }

      try {
        const transcript = await transcription.transcribeAudio(blob, mimeType);
        setLastTranscript(transcript);
        if (!transcript) {
          setErrorMessage('No speech detected. Try again.');
          setTurnState('idle');
          return;
        }
        await processUserText(transcript);
      } catch (e) {
        logError('Transcription failed', e, { character: characterRef.current?.slug });
        const msg = e instanceof Error ? e.message : 'Voice response failed.';
        setErrorMessage(msg);
        setTurnState('error');
      }
    },
    [transcription, processUserText]
  );

  const handleRecorderError = useCallback((msg: string) => {
    setErrorMessage(msg);
    setTurnState('error');
  }, []);

  const recorder = useRecorder({
    onStop: handleRecorderStop,
    onError: handleRecorderError,
  });

  // Wake word callbacks
  const handleWakeStart = useCallback(() => {
    setLastTranscript('');
    setLastResponse('');
    void startRecordingRef.current();
  }, []);

  const handleWakeEnd = useCallback(() => {
    recorder.stopRecording();
    speech.stopAudio();
    setTurnState('idle');
  }, [recorder, speech]);

  const handleWakeError = useCallback((msg: string) => {
    setErrorMessage(msg);
  }, []);

  const wakeWord = useWakeWord({
    enabled: isWakeWordEnabled(),
    turnState,
    onWakeStart: handleWakeStart,
    onWakeEnd: handleWakeEnd,
    onError: handleWakeError,
    stopAudio: () => speech.stopAudio(),
  });

  // Start recording (mic button or wake word)
  const startRecording = useCallback(async () => {
    wakeWord.stopWakeListening();
    await speech.unlockAudioContext();
    setErrorMessage('');
    setLastTranscript('');
    setLastResponse('');

    if (getSttProvider() === 'browser') {
      setTurnState('listening');
      try {
        const transcript = await transcription.transcribeWithBrowser();
        setLastTranscript(transcript);
        if (!transcript) {
          setErrorMessage('No speech detected. Try again.');
          setTurnState('idle');
          return;
        }
        await processUserText(transcript);
      } catch (e) {
        logError('Browser speech input failed', e, { character: characterRef.current?.slug });
        const msg = e instanceof Error ? e.message : 'Browser speech input failed.';
        setErrorMessage(msg);
        setTurnState('error');
      }
      return;
    }

    setTurnState('listening');
    try {
      await recorder.startRecording();
    } catch {
      // Error state is handled by useRecorder via onError
    }
  }, [wakeWord, speech, transcription, processUserText, recorder]);

  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);

  const toggleRecording = useCallback(() => {
    if (turnStateRef.current === 'listening') {
      if (recorder.isRecording) {
        recorder.stopRecording();
      }
      // Browser STT active: original did nothing (let it finish/timeout)
    } else if (['idle', 'error', 'speaking'].includes(turnStateRef.current)) {
      speech.stopAudio();
      window.speechSynthesis?.cancel();
      setLastTranscript('');
      setLastResponse('');
      void startRecording();
    }
  }, [recorder, speech, startRecording]);

  const sendText = useCallback(
    async (text: string) => {
      speech.stopAudio();
      window.speechSynthesis?.cancel();
      await processUserText(text);
    },
    [speech, processUserText]
  );

  const reset = useCallback(() => {
    recorder.stopRecording();
    speech.stop();
    setTurnState('idle');
    setLastTranscript('');
    setLastResponse('');
    setErrorMessage('');
    setMessages([]);
    setMessageCount(0);
    resetSessionStart();
  }, [recorder, speech]);

  useEffect(() => {
    return () => {
      recorder.stopRecording();
      wakeWord.stopWakeListening();
      speech.stop();
    };
  }, [recorder, wakeWord, speech]);

  return {
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
    wakeListening: wakeWord.wakeListening,
  };
}
