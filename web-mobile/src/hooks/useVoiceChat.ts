import { useCallback, useEffect, useRef, useState } from 'react';
import type { Character, ModeConfig } from '@/types';
import { characterConfigs } from '@/lib/characterConfig';
import {
  getDeepgramKey,
  getMessageCount,
  getSessionStart,
  getSttProvider,
  getWakeEndPhrases,
  getWakeInterruptPhrases,
  getWakeStartPhrases,
  incrementMessageCount,
  isVoiceEnabled,
  isWakeWordEnabled,
  resetSessionStart,
  setSessionStart,
} from '@/lib/settings';
import { userName } from '@/lib/personalization';

function logError(message: string, error?: unknown, extra?: Record<string, unknown>) {
  console.error(message, error, extra);
}

const stripBom = (s: string | undefined): string | undefined => s?.replace(/^\uFEFF/, '');
const ENV_DEEPGRAM_KEY = stripBom((import.meta as Record<string, any>).env.VITE_DEEPGRAM_API_KEY as string | undefined);
const ENV_OPENAI_KEY = stripBom((import.meta as Record<string, any>).env.VITE_OPENAI_API_KEY as string | undefined);

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
  // Trim trailing sentence punctuation/spaces left behind.
  return cleaned.replace(/[\s\p{P}]+$/u, '').trim();
}

const OPENAI_BASE = 'https://api.openai.com/v1';
const FETCH_TIMEOUT = 25000;

export type TurnState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

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

async function fetchWithTimeout(url: string, options: RequestInit, timeout = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function getMimeType(): string {
  const types = ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function transcribeWithBrowserSpeech(): Promise<string> {
  return new Promise((resolve, reject) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      reject(new Error('Browser speech recognition not available'));
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    const timeout = window.setTimeout(() => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      reject(new Error('Browser speech recognition timed out'));
    }, 7000);

    recognition.onresult = (event) => {
      window.clearTimeout(timeout);
      const result = event.results[0];
      if (result && result.isFinal && result[0]) {
        resolve(result[0].transcript);
      } else {
        reject(new Error('No speech recognized'));
      }
    };

    recognition.onerror = (event) => {
      window.clearTimeout(timeout);
      reject(new Error(`Browser speech error: ${event.error}`));
    };

    recognition.onend = () => {
      window.clearTimeout(timeout);
    };

    try {
      recognition.start();
    } catch (e) {
      window.clearTimeout(timeout);
      reject(e);
    }
  });
}

export function useVoiceChat(character: Character | null, options: UseVoiceChatOptions = {}): UseVoiceChatReturn {
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
  const abortRef = useRef<AbortController | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const autoStopTimerRef = useRef<number | null>(null);
  const wakeRecognitionRef = useRef<SpeechRecognition | null>(null);
  const wakeRestartTimerRef = useRef<number | null>(null);
  const intentionalWakeStopRef = useRef(false);
  const wakeErrorCountRef = useRef(0);
  const wakeErrorResetTimerRef = useRef<number | null>(null);
  const [wakeListening, setWakeListening] = useState(false);

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

  const stopRecording = useCallback(() => {
    if (autoStopTimerRef.current) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stopRecording();
    setTurnState('idle');
    setLastTranscript('');
    setLastResponse('');
    setErrorMessage('');
    setMessages([]);
    setMessageCount(0);
    resetSessionStart();
    abortRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch {
        // ignore
      }
      audioSourceRef.current = null;
    }
  }, [stopRecording]);

  const unlockAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return false;
      audioContextRef.current = new Ctx();
    }
    if (audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume();
      } catch {
        return false;
      }
    }
    return audioContextRef.current.state === 'running';
  }, []);

  const speakWithWebSpeech = useCallback((text: string) => {
    if (!window.speechSynthesis) {
      logError('Browser speech synthesis not available');
      setErrorMessage('Voice output failed and browser speech is not available.');
      setTurnState('error');
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => v.lang.startsWith('en-US') && v.name.includes('Google')) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      voices[0];
    if (preferred) utter.voice = preferred;

    utter.onstart = () => setTurnState('speaking');
    utter.onend = () => setTurnState('idle');
    utter.onerror = (err) => {
      logError('Browser speech synthesis failed', err);
      setErrorMessage('Browser speech playback failed.');
      setTurnState('error');
    };

    window.speechSynthesis.speak(utter);
  }, []);

  const playAudioResponse = useCallback(async (blob: Blob, fallbackText: string) => {
    // Try Web Audio API first — it stays unlocked after a user gesture on mobile.
    try {
      if (audioContextRef.current?.state === 'running') {
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        const source = audioContextRef.current.createBufferSource();
        audioSourceRef.current = source;
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => {
          audioSourceRef.current = null;
          setTurnState('idle');
        };
        setTurnState('speaking');
        source.start(0);
        return;
      }
    } catch (e) {
      logError('Web Audio playback failed', e);
    }

    // Fallback 1: HTMLAudioElement.
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.onplay = () => setTurnState('speaking');
    audio.onended = () => {
      audioRef.current = null;
      URL.revokeObjectURL(url);
      setTurnState('idle');
    };

    try {
      await audio.play();
      return;
    } catch (err) {
      audioRef.current = null;
      URL.revokeObjectURL(url);
      logError('Audio play() failed', err);
    }

    // Fallback 2: browser speech synthesis.
    speakWithWebSpeech(fallbackText);
  }, [speakWithWebSpeech]);

  const buildSystemPrompt = useCallback((basePrompt: string) => {
    const activeMode = modeRef.current;
    let prompt = basePrompt;
    if (activeMode?.instruction) {
      prompt += `\n\n--- Current mode: ${activeMode.label} ---\n${activeMode.instruction}`;
    }
    if (userName) {
      prompt += `\n\nThe child you are talking to is named ${userName}. Use their name naturally when greeting or encouraging them.`;
    }
    return prompt;
  }, []);

  const fetchLLMResponse = useCallback(async (userText: string) => {
    const char = characterRef.current;
    if (!char) throw new Error('No character selected');

    const config = characterConfigs[char.slug.toLowerCase()];
    if (!config) throw new Error(`No config for ${char.slug}`);

    const openaiKey = ENV_OPENAI_KEY;
    if (!openaiKey) throw new Error('OpenAI API key missing');

    const res = await fetchWithTimeout(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: buildSystemPrompt(config.prompt) },
          { role: 'user', content: userText },
        ],
        max_tokens: 180,
        temperature: 0.85,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`OpenAI error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as { choices?: Array<{ message: { content: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty response from OpenAI');
    return { text, config };
  }, [buildSystemPrompt]);

  const fetchTTS = useCallback(async (text: string, voice: string) => {
    const openaiKey = ENV_OPENAI_KEY;
    if (!openaiKey) throw new Error('OpenAI API key missing');

    const res = await fetchWithTimeout(`${OPENAI_BASE}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice,
        input: text,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`OpenAI TTS error ${res.status}: ${err}`);
    }

    return await res.blob();
  }, []);

  const processUserText = useCallback(async (userText: string) => {
    const trimmed = stripEndCommandPhrases(userText);
    if (!trimmed) return;

    if (getMessageCount() === 0) {
      setSessionStart(Date.now());
    }

    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setTurnState('processing');
    setErrorMessage('');

    try {
      const { text: responseText, config } = await fetchLLMResponse(trimmed);
      setLastResponse(responseText);
      setMessages((prev) => [...prev, { role: 'assistant', text: responseText }]);
      incrementMessageCount(2);
      setMessageCount(getMessageCount());

      if (voiceEnabledRef.current) {
        try {
          const ttsBlob = await fetchTTS(responseText, config.voice);
          await playAudioResponse(ttsBlob, responseText);
        } catch (ttsErr) {
          logError('OpenAI TTS failed, falling back to browser speech', ttsErr, {
            character: characterRef.current?.slug,
          });
          speakWithWebSpeech(responseText);
        }
      } else {
        setTurnState('idle');
      }
    } catch (e) {
      logError('Voice response pipeline failed', e, { character: characterRef.current?.slug });
      const msg = e instanceof Error ? e.message : 'Voice response failed.';
      setErrorMessage(msg);
      setTurnState('error');
    }
  }, [fetchLLMResponse, fetchTTS, playAudioResponse, speakWithWebSpeech]);

  const sendText = useCallback(async (text: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    await processUserText(text);
  }, [processUserText]);

  const runPipeline = useCallback(async (audioBlob: Blob, mimeType: string) => {
    const deepgramKey = getDeepgramKey() ?? ENV_DEEPGRAM_KEY;
    if (!deepgramKey) {
      setErrorMessage('Deepgram API key missing.');
      setTurnState('error');
      return;
    }

    setTurnState('processing');
    setErrorMessage('');

    if (audioBlob.size < 100) {
      setErrorMessage('Recording too short. Try speaking a little longer.');
      setTurnState('idle');
      return;
    }

    try {
      // Deepgram's REST API does not accept codecs in the Content-Type (e.g. audio/webm;codecs=opus)
      const contentType = (mimeType || 'audio/webm').split(';')[0].trim();
      const sttRes = await fetchWithTimeout(
        'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true',
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${deepgramKey}`,
            'Content-Type': contentType,
          },
          body: audioBlob,
        }
      );

      if (!sttRes.ok) {
        const err = await sttRes.text().catch(() => '');
        throw new Error(`Deepgram error ${sttRes.status}: ${err}`);
      }

      const dgData = (await sttRes.json()) as {
        results?: { channels: { alternatives: { transcript: string }[] }[] };
      };
      const transcript = dgData.results?.channels[0]?.alternatives[0]?.transcript?.trim() || '';
      setLastTranscript(transcript);

      if (!transcript) {
        setErrorMessage('No speech detected. Try again.');
        setTurnState('idle');
        return;
      }

      await processUserText(transcript);
    } catch (e) {
      logError('Deepgram speech-to-text failed', e, {
        character: characterRef.current?.slug,
        mimeType,
        blobSize: audioBlob.size,
        deepgramKeyLength: deepgramKey.length,
      });

      // Fallback to browser SpeechRecognition when Deepgram is unreachable or fails.
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        setErrorMessage('Deepgram failed, trying browser speech...');
        setTurnState('listening');
        try {
          const transcript = await transcribeWithBrowserSpeech();
          setLastTranscript(transcript);
          if (!transcript) {
            setErrorMessage('No speech detected. Try again.');
            setTurnState('idle');
            return;
          }
          // Use browser speech as a one-time fallback; keep Deepgram as the
          // default so a transient failure doesn’t permanently break voice input.
          await processUserText(transcript);
          return;
        } catch (fallbackErr) {
          logError('Browser speech fallback failed', fallbackErr, {
            character: characterRef.current?.slug,
          });
        }
      }

      const msg = e instanceof Error ? e.message : 'Voice response failed.';
      setErrorMessage(msg);
      setTurnState('error');
    }
  }, [processUserText]);

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

  const startRecording = useCallback(async () => {
    // Stop wake-word listening so we can grab the mic.
    stopWakeListening();

    // Unlock/resume the AudioContext during this user gesture so later TTS
    // playback works on mobile Safari/iOS.
    await unlockAudioContext();

    if (getSttProvider() === 'browser') {
      setErrorMessage('');
      setTurnState('listening');
      try {
        const transcript = await transcribeWithBrowserSpeech();
        setLastTranscript(transcript);
        if (!transcript) {
          setErrorMessage('No speech detected. Try again.');
          setTurnState('idle');
          return;
        }
        await processUserText(transcript);
      } catch (e) {
        logError('Browser speech input failed', e, {
          character: characterRef.current?.slug,
        });
        const msg = e instanceof Error ? e.message : 'Browser speech input failed.';
        setErrorMessage(msg);
        setTurnState('error');
      }
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Microphone access is not supported in this browser.');
      setTurnState('error');
      return;
    }
    if (!window.MediaRecorder) {
      setErrorMessage('MediaRecorder is not supported in this browser.');
      setTurnState('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordingChunksRef.current = [];

      const mimeType = getMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob =
          recordingChunksRef.current.length > 0
            ? new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
            : null;
        recordingChunksRef.current = [];
        if (blob) {
          void runPipeline(blob, recorder.mimeType || 'audio/webm');
        } else {
          setTurnState('idle');
        }
      };

      recorder.onerror = () => {
        setErrorMessage('Microphone recording failed.');
        setTurnState('error');
      };

      setErrorMessage('');
      setTurnState('listening');
      recorder.start(100);

      autoStopTimerRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 10000);
    } catch (e) {
      logError('Microphone access/recording failed', e, {
        character: characterRef.current?.slug,
      });
      let msg = 'Could not access microphone.';
      if (e instanceof DOMException) {
        msg = `Mic error — ${e.name}: ${e.message}`;
      } else if (e instanceof Error) {
        msg = `Mic error — ${e.message}`;
      }
      setErrorMessage(msg);
      setTurnState('error');
    }
  }, [runPipeline, stopWakeListening, processUserText]);

  const startWakeListening = useCallback(() => {
    if (wakeRecognitionRef.current) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    // Interim results let us react to interrupt phrases as soon as they’re
    // spoken instead of waiting for a final result.
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
      if (intentionalWakeStopRef.current || !isWakeWordEnabled()) return;
      if (wakeErrorCountRef.current >= 10) return;
      const backoff = Math.min(300 * 2 ** wakeErrorCountRef.current, 3000);
      wakeRestartTimerRef.current = window.setTimeout(() => {
        if (isWakeWordEnabled() && wakeErrorCountRef.current < 10) startWakeListening();
      }, backoff);
    };

    recognition.onerror = (event) => {
      const errorType = (event as SpeechRecognitionErrorEvent).error || 'unknown';
      // Ignore routine no-speech / aborted errors; log real problems once.
      if (errorType !== 'no-speech' && errorType !== 'aborted' && errorType !== 'undefined') {
        logError('Wake-word recognition error', { error: errorType });
      }
      wakeErrorCountRef.current += 1;
      // Reset the error count if we get a clean result later.
      if (wakeErrorResetTimerRef.current) window.clearTimeout(wakeErrorResetTimerRef.current);
      wakeErrorResetTimerRef.current = window.setTimeout(() => {
        wakeErrorCountRef.current = 0;
      }, 10000);

      // Hard failures: stop trying and tell the user to use the mic button.
      if (errorType === 'not-allowed' || errorType === 'service-not-allowed' || wakeErrorCountRef.current >= 10) {
        intentionalWakeStopRef.current = true;
        setErrorMessage('Wake-word mic failed. Tap the mic button to talk.');
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

      // Any result means the mic/recognition pipeline is alive.
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
        matchedInterrupt = matchedInterrupt || phraseLists.interrupt.some((p) => matchesPhrase(transcript, p));
        if (result.isFinal) {
          matchedEnd = matchedEnd || phraseLists.end.some((p) => matchesPhrase(transcript, p));
        }
      }

      const stopAllAudio = () => {
        window.speechSynthesis?.cancel();
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        if (audioSourceRef.current) {
          try {
            audioSourceRef.current.stop();
          } catch {
            // ignore
          }
          audioSourceRef.current = null;
        }
      };

      if ((turnStateRef.current === 'idle' || turnStateRef.current === 'speaking') && (matchedStart || matchedInterrupt)) {
        // Start listening or interrupt current audio.
        intentionalWakeStopRef.current = true;
        recognition.stop();
        stopAllAudio();
        setLastTranscript('');
        setLastResponse('');
        void startRecording();
      } else if (turnStateRef.current !== 'idle' && matchedEnd) {
        // End the current turn.
        intentionalWakeStopRef.current = true;
        recognition.stop();
        stopRecording();
        stopAllAudio();
        setTurnState('idle');
      }
    };

    wakeRecognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      logError('Failed to start wake-word recognition', e);
      wakeRecognitionRef.current = null;
    }
  }, [startRecording, stopRecording]);

  const toggleRecording = useCallback(() => {
    if (turnStateRef.current === 'listening') {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    } else if (['idle', 'error', 'speaking'].includes(turnStateRef.current)) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      window.speechSynthesis?.cancel();
      setLastTranscript('');
      setLastResponse('');
      void startRecording();
    }
  }, [startRecording]);

  // Auto start/stop wake-word listening based on turn state and setting.
  useEffect(() => {
    if (!isWakeWordEnabled()) {
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
  }, [turnState, stopWakeListening, startWakeListening]);

  useEffect(() => {
    return () => {
      stopRecording();
      stopWakeListening();
      if (wakeRestartTimerRef.current) {
        window.clearTimeout(wakeRestartTimerRef.current);
      }
      abortRef.current?.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [stopRecording, stopWakeListening]);

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
    wakeListening,
  };
}
