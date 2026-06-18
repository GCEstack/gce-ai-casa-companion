export interface VoiceConfig {
  name: string; // preferred speechSynthesis voice name (partial match)
  pitch: number; // 0 (deep) to 2 (high)
  rate: number; // 0.5 (slow) to 2 (fast)
  lang: string; // 'en-US', 'en-GB', etc.
}

export const characterVoices: Record<string, VoiceConfig> = {
  coniglio: { name: '', pitch: 1.3, rate: 1.05, lang: 'en-US' }, // soft, higher
  corvo: { name: '', pitch: 0.7, rate: 0.95, lang: 'en-US' }, // deep, slow
  gufo: { name: '', pitch: 0.9, rate: 0.9, lang: 'en-GB' }, // wise, slower
  orsetto: { name: '', pitch: 0.8, rate: 0.95, lang: 'en-US' }, // deep, warm
  tartaruga: { name: '', pitch: 0.8, rate: 0.75, lang: 'en-US' }, // very slow, deep
  leone: { name: '', pitch: 0.7, rate: 1.0, lang: 'en-US' }, // deep, confident
  drago: { name: '', pitch: 1.0, rate: 1.1, lang: 'en-US' }, // playful
  xolo: { name: '', pitch: 0.9, rate: 0.9, lang: 'en-US' }, // ancient feel
  elefante: { name: '', pitch: 0.6, rate: 0.85, lang: 'en-US' }, // very deep, slow
  delfino: { name: '', pitch: 1.2, rate: 1.15, lang: 'en-US' }, // high, fast, playful
};

export const defaultVoice: VoiceConfig = {
  name: '',
  pitch: 1.0,
  rate: 1.0,
  lang: 'en-US',
};

function isNaturalVoice(voice: SpeechSynthesisVoice): boolean {
  const name = voice.name.toLowerCase();
  // Prefer voices that sound less robotic; heuristic based on common voice names.
  const preferredNames = ['samantha', 'daniel', 'karen', 'fred', 'victoria', 'moira', 'tessa'];
  return preferredNames.some((n) => name.includes(n));
}

export function getVoiceForCharacter(config: VoiceConfig): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // First try a natural-sounding voice matching the language.
  const natural = voices.find(
    (v) => v.lang.startsWith(config.lang) && isNaturalVoice(v)
  );
  if (natural) return natural;

  // Then any voice matching the language.
  const langMatch = voices.find((v) => v.lang.startsWith(config.lang));
  if (langMatch) return langMatch;

  // Fallback to the first available voice.
  return voices[0];
}
