import { useCallback, useEffect, useState } from 'react';
import { getModeBySlug, introductionMode } from '@/lib/modes';
import type { ModeConfig } from '@/types';

const STORAGE_KEYS = {
  groqKey: 'cc_groq_key',
  deepgramKey: 'cc_deepgram_key',
  openaiKey: 'cc_openai_key',
  favorites: 'cc_favorites',
  activeMode: 'cc_active_mode',
  voiceEnabled: 'cc_voice_enabled',
  timeCapMinutes: 'cc_time_cap',
  lockPin: 'cc_lock_pin',
  locked: 'cc_locked',
  bargeInEnabled: 'cc_barge_in',
  wakeWordEnabled: 'cc_wake_word_enabled',
  wakeWordPhrase: 'cc_wake_word',
  wakeStartPhrases: 'cc_wake_start_phrases',
  wakeInterruptPhrases: 'cc_wake_interrupt_phrases',
  wakeEndPhrases: 'cc_wake_end_phrases',
  sttProvider: 'cc_stt_provider',
  sessionStart: 'cc_session_start',
  messageCount: 'cc_message_count',
} as const;

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

const stripBom = (s: string | null): string | undefined => s?.replace(/^\uFEFF/, '') || undefined;

export function getGroqKey(): string | undefined {
  return stripBom(localStorage.getItem(STORAGE_KEYS.groqKey));
}

export function setGroqKey(key: string): void {
  localStorage.setItem(STORAGE_KEYS.groqKey, key.replace(/^\uFEFF/, ''));
}

export function getDeepgramKey(): string | undefined {
  return stripBom(localStorage.getItem(STORAGE_KEYS.deepgramKey));
}

export function setDeepgramKey(key: string): void {
  localStorage.setItem(STORAGE_KEYS.deepgramKey, key.replace(/^\uFEFF/, ''));
}

export function getOpenAIKey(): string | undefined {
  return stripBom(localStorage.getItem(STORAGE_KEYS.openaiKey));
}

export function setOpenAIKey(key: string): void {
  localStorage.setItem(STORAGE_KEYS.openaiKey, key.replace(/^\uFEFF/, ''));
}

export function getFavorites(): string[] {
  return safeGet<string[]>(STORAGE_KEYS.favorites, []);
}

export function addFavorite(slug: string): void {
  const favorites = new Set(getFavorites());
  favorites.add(slug);
  safeSet<string[]>(STORAGE_KEYS.favorites, Array.from(favorites));
}

export function removeFavorite(slug: string): void {
  const favorites = new Set(getFavorites());
  favorites.delete(slug);
  safeSet<string[]>(STORAGE_KEYS.favorites, Array.from(favorites));
}

export function toggleFavorite(slug: string): boolean {
  const favorites = getFavorites();
  if (favorites.includes(slug)) {
    removeFavorite(slug);
    return false;
  }
  addFavorite(slug);
  return true;
}

export function isFavorite(slug: string): boolean {
  return getFavorites().includes(slug);
}

// ---- Companion settings ----

export function getActiveModeSlug(): string {
  return safeGet<string>(STORAGE_KEYS.activeMode, introductionMode.slug);
}

export function setActiveModeSlug(slug: string): void {
  safeSet<string>(STORAGE_KEYS.activeMode, slug);
}

export function getActiveMode(): ModeConfig {
  return getModeBySlug(getActiveModeSlug());
}

export function isVoiceEnabled(): boolean {
  return safeGet<boolean>(STORAGE_KEYS.voiceEnabled, true);
}

export function setVoiceEnabled(enabled: boolean): void {
  safeSet<boolean>(STORAGE_KEYS.voiceEnabled, enabled);
}

export function getTimeCapMinutes(): number {
  return safeGet<number>(STORAGE_KEYS.timeCapMinutes, 0);
}

export function setTimeCapMinutes(minutes: number): void {
  safeSet<number>(STORAGE_KEYS.timeCapMinutes, minutes);
}

export function getLockPin(): string {
  return safeGet<string>(STORAGE_KEYS.lockPin, '');
}

export function setLockPin(pin: string): void {
  safeSet<string>(STORAGE_KEYS.lockPin, pin.replace(/\D/g, '').slice(0, 6));
}

export function isLocked(): boolean {
  return safeGet<boolean>(STORAGE_KEYS.locked, false);
}

export function setLocked(locked: boolean): void {
  safeSet<boolean>(STORAGE_KEYS.locked, locked);
}

export function isBargeInEnabled(): boolean {
  return safeGet<boolean>(STORAGE_KEYS.bargeInEnabled, true);
}

export function setBargeInEnabled(enabled: boolean): void {
  safeSet<boolean>(STORAGE_KEYS.bargeInEnabled, enabled);
}

const WAKE_WORD_HOSTS = new Set([
  'web-mobile-peter.vercel.app',
  'casa-web-mobile-peter.fly.dev',
  'web-mobile-omega-sable.vercel.app',
]);

export function isWakeWordEnabled(): boolean {
  // Wake word is enabled for Peter's test site; disabled everywhere else.
  if (typeof window !== 'undefined' && WAKE_WORD_HOSTS.has(window.location.hostname)) {
    return true;
  }
  return false;
}

export function setWakeWordEnabled(enabled: boolean): void {
  safeSet<boolean>(STORAGE_KEYS.wakeWordEnabled, enabled);
}

export function getWakeWordPhrase(): string {
  if (typeof window !== 'undefined' && WAKE_WORD_HOSTS.has(window.location.hostname)) {
    return 'and Casa, go ahead Casa, end Casa, capiche';
  }
  return safeGet<string>(STORAGE_KEYS.wakeWordPhrase, 'Hello Casa, Hey Casa, End Casa');
}

export function setWakeWordPhrase(phrase: string): void {
  safeSet<string>(
    STORAGE_KEYS.wakeWordPhrase,
    phrase.trim() || 'Hello Casa, Hey Casa, End Casa'
  );
}

const DEFAULT_START_PHRASES = 'Hello, Hey, Wake up, Wake';
const DEFAULT_INTERRUPT_PHRASES = 'Yo, WTF, One sec, Hold on';
const DEFAULT_END_PHRASES = 'Send, End, Capische';

export function getWakeStartPhrases(): string {
  return safeGet<string>(STORAGE_KEYS.wakeStartPhrases, DEFAULT_START_PHRASES);
}

export function setWakeStartPhrases(phrase: string): void {
  safeSet<string>(
    STORAGE_KEYS.wakeStartPhrases,
    phrase.trim() || DEFAULT_START_PHRASES
  );
}

export function getWakeInterruptPhrases(): string {
  return safeGet<string>(STORAGE_KEYS.wakeInterruptPhrases, DEFAULT_INTERRUPT_PHRASES);
}

export function setWakeInterruptPhrases(phrase: string): void {
  safeSet<string>(
    STORAGE_KEYS.wakeInterruptPhrases,
    phrase.trim() || DEFAULT_INTERRUPT_PHRASES
  );
}

export function getWakeEndPhrases(): string {
  return safeGet<string>(STORAGE_KEYS.wakeEndPhrases, DEFAULT_END_PHRASES);
}

export function setWakeEndPhrases(phrase: string): void {
  safeSet<string>(
    STORAGE_KEYS.wakeEndPhrases,
    phrase.trim() || DEFAULT_END_PHRASES
  );
}

export function resetWakePhrases(): void {
  setWakeStartPhrases(DEFAULT_START_PHRASES);
  setWakeInterruptPhrases(DEFAULT_INTERRUPT_PHRASES);
  setWakeEndPhrases(DEFAULT_END_PHRASES);
}

export type SttProvider = 'deepgram' | 'browser';

export function getSttProvider(): SttProvider {
  const raw = safeGet<string>(STORAGE_KEYS.sttProvider, 'deepgram');
  return raw === 'browser' ? 'browser' : 'deepgram';
}

export function setSttProvider(provider: SttProvider): void {
  safeSet<string>(STORAGE_KEYS.sttProvider, provider);
}

// ---- Usage stats ----

export function getSessionStart(): number {
  return safeGet<number>(STORAGE_KEYS.sessionStart, Date.now());
}

export function setSessionStart(ts: number): void {
  safeSet<number>(STORAGE_KEYS.sessionStart, ts);
}

export function resetSessionStart(): void {
  setSessionStart(Date.now());
  setMessageCount(0);
}

export function getMessageCount(): number {
  return safeGet<number>(STORAGE_KEYS.messageCount, 0);
}

export function setMessageCount(count: number): void {
  safeSet<number>(STORAGE_KEYS.messageCount, count);
}

export function incrementMessageCount(amount = 1): void {
  setMessageCount(getMessageCount() + amount);
}

export function resetUsage(): void {
  resetSessionStart();
}

export async function clearAllCache(): Promise<void> {
  // Clear app storage
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));

  // Unregister service workers
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  }

  // Clear caches if available
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

export function useFavorites(): [string[], (slug: string) => boolean] {
  const [favorites, setFavorites] = useState<string[]>(() => getFavorites());

  useEffect(() => {
    setFavorites(getFavorites());
  }, []);

  const toggle = useCallback((slug: string): boolean => {
    const next = toggleFavorite(slug);
    setFavorites(getFavorites());
    return next;
  }, []);

  return [favorites, toggle];
}

export interface AppSettingsState {
  activeMode: ModeConfig;
  voiceEnabled: boolean;
  timeCapMinutes: number;
  lockPin: string;
  locked: boolean;
  bargeInEnabled: boolean;
  wakeWordEnabled: boolean;
  wakeWordPhrase: string;
  wakeStartPhrases: string;
  wakeInterruptPhrases: string;
  wakeEndPhrases: string;
  sttProvider: SttProvider;
}

export function useAppSettings(): {
  settings: AppSettingsState;
  setActiveMode: (mode: ModeConfig) => void;
  setVoiceEnabled: (enabled: boolean) => void;
  setTimeCapMinutes: (minutes: number) => void;
  setLockPin: (pin: string) => void;
  setLocked: (locked: boolean) => void;
  setBargeInEnabled: (enabled: boolean) => void;
  setWakeWordEnabled: (enabled: boolean) => void;
  setWakeWordPhrase: (phrase: string) => void;
  setWakeStartPhrases: (phrase: string) => void;
  setWakeInterruptPhrases: (phrase: string) => void;
  setWakeEndPhrases: (phrase: string) => void;
  setSttProvider: (provider: SttProvider) => void;
} {
  const [settings, setSettings] = useState<AppSettingsState>(() => ({
    activeMode: getActiveMode(),
    voiceEnabled: isVoiceEnabled(),
    timeCapMinutes: getTimeCapMinutes(),
    lockPin: getLockPin(),
    locked: isLocked(),
    bargeInEnabled: isBargeInEnabled(),
    wakeWordEnabled: isWakeWordEnabled(),
    wakeWordPhrase: getWakeWordPhrase(),
    wakeStartPhrases: getWakeStartPhrases(),
    wakeInterruptPhrases: getWakeInterruptPhrases(),
    wakeEndPhrases: getWakeEndPhrases(),
    sttProvider: getSttProvider(),
  }));

  const update = useCallback(
    <K extends keyof AppSettingsState>(key: K, value: AppSettingsState[K]) => {
      setSettings((prev) => {
        if (prev[key] === value) return prev;
        const next = { ...prev, [key]: value };
        if (key === 'activeMode') setActiveModeSlug((value as ModeConfig).slug);
        if (key === 'voiceEnabled') safeSet(STORAGE_KEYS.voiceEnabled, value);
        if (key === 'timeCapMinutes') safeSet(STORAGE_KEYS.timeCapMinutes, value);
        if (key === 'lockPin') setLockPin(value as string);
        if (key === 'locked') safeSet(STORAGE_KEYS.locked, value);
        if (key === 'bargeInEnabled') safeSet(STORAGE_KEYS.bargeInEnabled, value);
        if (key === 'wakeWordEnabled') safeSet(STORAGE_KEYS.wakeWordEnabled, value);
        if (key === 'wakeWordPhrase') setWakeWordPhrase(value as string);
        if (key === 'wakeStartPhrases') setWakeStartPhrases(value as string);
        if (key === 'wakeInterruptPhrases') setWakeInterruptPhrases(value as string);
        if (key === 'wakeEndPhrases') setWakeEndPhrases(value as string);
        if (key === 'sttProvider') setSttProvider(value as SttProvider);
        return next;
      });
    },
    []
  );

  // Keep in sync if another tab changes storage
  useEffect(() => {
    const onStorage = () => {
      setSettings({
        activeMode: getActiveMode(),
        voiceEnabled: isVoiceEnabled(),
        timeCapMinutes: getTimeCapMinutes(),
        lockPin: getLockPin(),
        locked: isLocked(),
        bargeInEnabled: isBargeInEnabled(),
        wakeWordEnabled: isWakeWordEnabled(),
        wakeWordPhrase: getWakeWordPhrase(),
        wakeStartPhrases: getWakeStartPhrases(),
        wakeInterruptPhrases: getWakeInterruptPhrases(),
        wakeEndPhrases: getWakeEndPhrases(),
        sttProvider: getSttProvider(),
      });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return {
    settings,
    setActiveMode: useCallback((mode) => update('activeMode', mode), [update]),
    setVoiceEnabled: useCallback((enabled) => update('voiceEnabled', enabled), [update]),
    setTimeCapMinutes: useCallback((minutes) => update('timeCapMinutes', minutes), [update]),
    setLockPin: useCallback((pin) => update('lockPin', pin), [update]),
    setLocked: useCallback((locked) => update('locked', locked), [update]),
    setBargeInEnabled: useCallback((enabled) => update('bargeInEnabled', enabled), [update]),
    setWakeWordEnabled: useCallback((enabled) => update('wakeWordEnabled', enabled), [update]),
    setWakeWordPhrase: useCallback((phrase) => update('wakeWordPhrase', phrase), [update]),
    setWakeStartPhrases: useCallback((phrase) => update('wakeStartPhrases', phrase), [update]),
    setWakeInterruptPhrases: useCallback((phrase) => update('wakeInterruptPhrases', phrase), [update]),
    setWakeEndPhrases: useCallback((phrase) => update('wakeEndPhrases', phrase), [update]),
    setSttProvider: useCallback((provider) => update('sttProvider', provider), [update]),
  };
}
