import { useCallback, useMemo, useRef } from 'react';
import type React from 'react';
import type { Character, ModeConfig } from '@/types';
import { characterConfigs } from '@/lib/characterConfig';
import { userName } from '@/lib/personalization';

function logError(message: string, error?: unknown, extra?: Record<string, unknown>) {
  console.error(message, error, extra);
}

const stripBom = (s: string | undefined): string | undefined => s?.replace(/^\uFEFF/, '');
const ENV_OPENAI_KEY = stripBom(import.meta.env.VITE_OPENAI_API_KEY as string | undefined);

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
  onResponseText: (text: string) => void;
  onComplete: () => void;
  onError: (message: string) => void;
}

export interface UseSpeechReturn {
  speak: (userText: string) => Promise<void>;
  stop: () => void;
}

export function useSpeech(options: UseSpeechOptions): UseSpeechReturn {
  const { characterRef, modeRef, onResponseText, onComplete, onError } = options;
  const abortRef = useRef<AbortController | null>(null);

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
      return text;
    },
    [characterRef, buildSystemPrompt]
  );

  const speak = useCallback(
    async (userText: string) => {
      try {
        const responseText = await fetchLLMResponse(userText);
        onResponseText(responseText);
        onComplete();
      } catch (e) {
        logError('Voice response pipeline failed', e, { character: characterRef.current?.slug });
        const msg = e instanceof Error ? e.message : 'Voice response failed.';
        onError(msg);
      }
    },
    [characterRef, fetchLLMResponse, onResponseText, onComplete, onError]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return useMemo(() => ({ speak, stop }), [speak, stop]);
}
