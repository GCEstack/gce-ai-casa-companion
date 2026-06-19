import { useCallback, useRef, useState } from 'react';
import { getDeepgramKey } from '@/lib/settings';

function logError(message: string, error?: unknown, extra?: Record<string, unknown>) {
  console.error(message, error, extra);
}

const stripBom = (s: string | undefined): string | undefined => s?.replace(/^\uFEFF/, '');
const ENV_DEEPGRAM_KEY = stripBom((import.meta as Record<string, any>).env.VITE_DEEPGRAM_API_KEY as string | undefined);

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

export interface UseTranscriptionOptions {
  onBrowserFallbackStart?: () => void;
}

export interface UseTranscriptionReturn {
  transcribeAudio: (audioBlob: Blob, mimeType: string) => Promise<string>;
  transcribeWithBrowser: () => Promise<string>;
  isTranscribing: boolean;
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

export function useTranscription(options: UseTranscriptionOptions = {}): UseTranscriptionReturn {
  const { onBrowserFallbackStart } = options;
  const [isTranscribing, setIsTranscribing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const transcribeAudio = useCallback(
    async (audioBlob: Blob, mimeType: string): Promise<string> => {
      const deepgramKey = getDeepgramKey() ?? ENV_DEEPGRAM_KEY;
      if (!deepgramKey) {
        throw new Error('Deepgram API key missing.');
      }

      setIsTranscribing(true);
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
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
            signal: abortRef.current.signal,
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
        return transcript;
      } catch (e) {
        logError('Deepgram speech-to-text failed', e, {
          mimeType,
          blobSize: audioBlob.size,
          deepgramKeyLength: deepgramKey.length,
        });

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          onBrowserFallbackStart?.();
          try {
            const transcript = await transcribeWithBrowserSpeech();
            return transcript;
          } catch (fallbackErr) {
            logError('Browser speech fallback failed', fallbackErr);
          }
        }

        const msg = e instanceof Error ? e.message : 'Voice response failed.';
        throw new Error(msg);
      } finally {
        setIsTranscribing(false);
      }
    },
    [onBrowserFallbackStart]
  );

  const transcribeWithBrowser = useCallback(async (): Promise<string> => {
    setIsTranscribing(true);
    try {
      return await transcribeWithBrowserSpeech();
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  return {
    transcribeAudio,
    transcribeWithBrowser,
    isTranscribing,
  };
}
