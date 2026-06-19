import { useCallback, useRef } from 'react';
import type { Character, ModeConfig } from '@/types';
import { characterConfigs } from '@/lib/characterConfig';
import { userName } from '@/lib/personalization';

function logError(message: string, error?: unknown, extra?: Record<string, unknown>) {
  console.error(message, error, extra);
}

const stripBom = (s: string | undefined): string | undefined => s?.replace(/^\uFEFF/, '');
const ENV_OPENAI_KEY = stripBom((import.meta as Record<string, any>).env.VITE_OPENAI_API_KEY as string | undefined);

const OPENAI_BASE = 'https://api.openai.com/v1';
const FETCH_TIMEOUT = 25000;

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = FETCH_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export interface UseSpeechOptions {
  characterRef: React.RefObject<Character | null>;
  modeRef: React.RefObject<ModeConfig | undefined>;
  voiceEnabledRef: React.RefObject<boolean>;
  onResponseText: (text: string) => void;
  onAudioStart: () => void;
  onAudioEnd: () => void;
  onError: (message: string) => void;
}

export interface UseSpeechReturn {
  speak: (userText: string) => Promise<void>;
  stop: () => void;
  stopAudio: () => void;
  unlockAudioContext: () => Promise<boolean>;
}

export function useSpeech(options: UseSpeechOptions): UseSpeechReturn {
  const { characterRef, modeRef, voiceEnabledRef, onResponseText, onAudioStart, onAudioEnd, onError } = options;
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const stopAudio = useCallback(() => {
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
    window.speechSynthesis?.cancel();
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    stopAudio();
  }, [stopAudio]);

  const unlockAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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

  const speakWithWebSpeech = useCallback(
    (text: string) => {
      if (!window.speechSynthesis) {
        logError('Browser speech synthesis not available');
        onError('Voice output failed and browser speech is not available.');
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

      utter.onstart = () => onAudioStart();
      utter.onend = () => onAudioEnd();
      utter.onerror = (err) => {
        logError('Browser speech synthesis failed', err);
        onError('Browser speech playback failed.');
      };

      window.speechSynthesis.speak(utter);
    },
    [onAudioStart, onAudioEnd, onError]
  );

  const playAudioResponse = useCallback(
    async (blob: Blob, fallbackText: string) => {
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
            onAudioEnd();
          };
          onAudioStart();
          source.start(0);
          return;
        }
      } catch (e) {
        logError('Web Audio playback failed', e);
      }

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onplay = () => onAudioStart();
      audio.onended = () => {
        audioRef.current = null;
        URL.revokeObjectURL(url);
        onAudioEnd();
      };

      try {
        await audio.play();
        return;
      } catch (err) {
        audioRef.current = null;
        URL.revokeObjectURL(url);
        logError('Audio play() failed', err);
      }

      speakWithWebSpeech(fallbackText);
    },
    [onAudioStart, onAudioEnd, speakWithWebSpeech]
  );

  const buildSystemPrompt = useCallback(
    (basePrompt: string) => {
      const activeMode = modeRef.current;
      let prompt = basePrompt;
      if (activeMode?.instruction) {
        prompt += `\n\n--- Current mode: ${activeMode.label} ---\n${activeMode.instruction}`;
      }
      if (userName) {
        prompt += `\n\nThe child you are talking to is named ${userName}. Use their name naturally when greeting or encouraging them.`;
      }
      return prompt;
    },
    [modeRef]
  );

  const fetchLLMResponse = useCallback(
    async (userText: string) => {
      const char = characterRef.current;
      if (!char) throw new Error('No character selected');

      const config = characterConfigs[char.slug.toLowerCase()];
      if (!config) throw new Error(`No config for ${char.slug}`);

      const openaiKey = ENV_OPENAI_KEY;
      if (!openaiKey) throw new Error('OpenAI API key missing');

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const res = await fetchWithTimeout(
        `${OPENAI_BASE}/chat/completions`,
        {
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
          signal: abortRef.current.signal,
        }
      );

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        throw new Error(`OpenAI error ${res.status}: ${err}`);
      }

      const data = (await res.json()) as { choices?: Array<{ message: { content: string } }> };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('Empty response from OpenAI');
      return { text, config };
    },
    [characterRef, buildSystemPrompt]
  );

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

  const speak = useCallback(
    async (userText: string) => {
      try {
        const { text: responseText, config } = await fetchLLMResponse(userText);
        onResponseText(responseText);

        if (voiceEnabledRef.current) {
          await unlockAudioContext();
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
          onAudioEnd();
        }
      } catch (e) {
        logError('Voice response pipeline failed', e, { character: characterRef.current?.slug });
        const msg = e instanceof Error ? e.message : 'Voice response failed.';
        onError(msg);
      }
    },
    [
      characterRef,
      voiceEnabledRef,
      fetchLLMResponse,
      fetchTTS,
      playAudioResponse,
      speakWithWebSpeech,
      unlockAudioContext,
      onResponseText,
      onAudioEnd,
      onError,
    ]
  );

  return {
    speak,
    stop,
    stopAudio,
    unlockAudioContext,
  };
}
