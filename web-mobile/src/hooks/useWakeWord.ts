import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getWakeEndPhrases,
  getWakeInterruptPhrases,
  getWakeStartPhrases,
  isWakeWordEnabled,
} from '@/lib/settings';

function logError(message: string, error?: unknown, extra?: Record<string, unknown>) {
  console.error(message, error, extra);
}

export type TurnState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

export interface UseWakeWordOptions {
  enabled: boolean;
  turnState: TurnState;
  onWakeStart: () => void;
  onWakeEnd: () => void;
  onError?: (message: string) => void;
  stopAudio?: () => void;
}

export interface UseWakeWordReturn {
  wakeListening: boolean;
  startWakeListening: () => void;
  stopWakeListening: () => void;
}

export function useWakeWord(options: UseWakeWordOptions): UseWakeWordReturn {
  const { enabled, turnState, onWakeStart, onWakeEnd, onError, stopAudio } = options;
  const [wakeListening, setWakeListening] = useState(false);
  const turnStateRef = useRef(turnState);

  useEffect(() => {
    turnStateRef.current = turnState;
  }, [turnState]);
  const wakeRecognitionRef = useRef<SpeechRecognition | null>(null);
  const wakeRestartTimerRef = useRef<number | null>(null);
  const intentionalWakeStopRef = useRef(false);
  const wakeErrorCountRef = useRef(0);
  const wakeErrorResetTimerRef = useRef<number | null>(null);

  const stopWakeListening = useCallback(() => {
    intentionalWakeStopRef.current = true;
    if (wakeRestartTimerRef.current) {
      window.clearTimeout(wakeRestartTimerRef.current);
      wakeRestartTimerRef.current = null;
    }
    if (wakeRecognitionRef.current) {
      try {
        wakeRecognitionRef.current.abort();
      } catch {
        // ignore
      }
      wakeRecognitionRef.current = null;
    }
    setWakeListening(false);
  }, []);

  const startWakeListening = useCallback(() => {
    if (wakeRecognitionRef.current) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      intentionalWakeStopRef.current = false;
      setWakeListening(true);
    };

    recognition.onend = () => {
      wakeRecognitionRef.current = null;
      setWakeListening(false);
      if (intentionalWakeStopRef.current || !isWakeWordEnabled() || !enabled) return;
      if (wakeErrorCountRef.current >= 10) return;
      const backoff = Math.min(300 * 2 ** wakeErrorCountRef.current, 3000);
      wakeRestartTimerRef.current = window.setTimeout(() => {
        if (isWakeWordEnabled() && enabled && wakeErrorCountRef.current < 10) startWakeListening();
      }, backoff);
    };

    recognition.onerror = (event) => {
      const errorType = (event as SpeechRecognitionErrorEvent).error || 'unknown';
      if (errorType !== 'no-speech' && errorType !== 'aborted' && errorType !== 'undefined') {
        logError('Wake-word recognition error', { error: errorType });
      }
      wakeErrorCountRef.current += 1;
      if (wakeErrorResetTimerRef.current) window.clearTimeout(wakeErrorResetTimerRef.current);
      wakeErrorResetTimerRef.current = window.setTimeout(() => {
        wakeErrorCountRef.current = 0;
      }, 10000);

      if (
        errorType === 'not-allowed' ||
        errorType === 'service-not-allowed' ||
        wakeErrorCountRef.current >= 10
      ) {
        intentionalWakeStopRef.current = true;
        onError?.('Wake-word mic failed. Tap the mic button to talk.');
        try {
          recognition.abort();
        } catch {
          // ignore
        }
        return;
      }

      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };

    recognition.onresult = (event) => {
      if (intentionalWakeStopRef.current) return;

      wakeErrorCountRef.current = 0;
      if (wakeErrorResetTimerRef.current) {
        window.clearTimeout(wakeErrorResetTimerRef.current);
        wakeErrorResetTimerRef.current = null;
      }

      const phraseLists = {
        start: getWakeStartPhrases()
          .split(',')
          .map((p) => p.trim().toLowerCase())
          .filter(Boolean),
        interrupt: getWakeInterruptPhrases()
          .split(',')
          .map((p) => p.trim().toLowerCase())
          .filter(Boolean),
        end: getWakeEndPhrases()
          .split(',')
          .map((p) => p.trim().toLowerCase())
          .filter(Boolean),
      };

      const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matchesPhrase = (transcript: string, phrase: string) => {
        const re = new RegExp(`\\b${escaped(phrase)}\\b`, 'iu');
        return re.test(transcript);
      };

      let matchedStart = false;
      let matchedInterrupt = false;
      let matchedEnd = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        const alt = result[0];
        if (!alt) continue;
        const transcript = alt.transcript.trim().toLowerCase();

        matchedStart = matchedStart || phraseLists.start.some((p) => matchesPhrase(transcript, p));
        matchedInterrupt =
          matchedInterrupt || phraseLists.interrupt.some((p) => matchesPhrase(transcript, p));
        if (result.isFinal) {
          matchedEnd = matchedEnd || phraseLists.end.some((p) => matchesPhrase(transcript, p));
        }
      }

      const stopAllAudio = () => {
        stopAudio?.();
      };

      const turnState = turnStateRef.current;
      if ((turnState === 'idle' || turnState === 'speaking') && (matchedStart || matchedInterrupt)) {
        intentionalWakeStopRef.current = true;
        recognition.stop();
        stopAllAudio();
        onWakeStart();
      } else if (turnState !== 'idle' && matchedEnd) {
        intentionalWakeStopRef.current = true;
        recognition.stop();
        onWakeEnd();
      }
    };

    wakeRecognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      logError('Failed to start wake-word recognition', e);
      wakeRecognitionRef.current = null;
    }
  }, [enabled, turnStateRef, onWakeStart, onWakeEnd, onError, stopAudio]);

  // Auto start/stop wake-word listening based on turn state and setting.
  useEffect(() => {
    if (!enabled || !isWakeWordEnabled()) {
      stopWakeListening();
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const canListen = turnState === 'idle' || turnState === 'speaking' || turnState === 'error';
    const mustStop = turnState === 'listening' || turnState === 'processing';
    if (canListen && !wakeRecognitionRef.current && !intentionalWakeStopRef.current) {
      startWakeListening();
    } else if (mustStop && wakeRecognitionRef.current) {
      stopWakeListening();
    }
  }, [enabled, turnState, startWakeListening, stopWakeListening]);

  useEffect(() => {
    return () => {
      stopWakeListening();
      if (wakeRestartTimerRef.current) {
        window.clearTimeout(wakeRestartTimerRef.current);
      }
      if (wakeErrorResetTimerRef.current) {
        window.clearTimeout(wakeErrorResetTimerRef.current);
      }
    };
  }, [stopWakeListening]);

  return {
    wakeListening,
    startWakeListening,
    stopWakeListening,
  };
}
