import { Mic } from 'lucide-react';
import { Toggle } from './Toggle';
import type { SttProvider } from '@/lib/settings';

interface VoiceSettingsProps {
  voiceEnabled: boolean;
  bargeInEnabled: boolean;
  sttProvider: SttProvider;
  wakeWordEnabled: boolean;
  wakeStartPhrases: string;
  wakeInterruptPhrases: string;
  wakeEndPhrases: string;
  onVoiceEnabledChange: (enabled: boolean) => void;
  onBargeInEnabledChange: (enabled: boolean) => void;
  onSttProviderChange: (provider: SttProvider) => void;
  onWakeWordEnabledChange: (enabled: boolean) => void;
  onWakeStartPhrasesChange: (phrases: string) => void;
  onWakeInterruptPhrasesChange: (phrases: string) => void;
  onWakeEndPhrasesChange: (phrases: string) => void;
}

export function VoiceSettings({
  voiceEnabled,
  bargeInEnabled,
  sttProvider,
  wakeWordEnabled,
  wakeStartPhrases,
  wakeInterruptPhrases,
  wakeEndPhrases,
  onVoiceEnabledChange,
  onBargeInEnabledChange,
  onSttProviderChange,
  onWakeWordEnabledChange,
  onWakeStartPhrasesChange,
  onWakeInterruptPhrasesChange,
  onWakeEndPhrasesChange,
}: VoiceSettingsProps) {
  const resetWakePhrases = () => {
    onWakeStartPhrasesChange('Hello, Hey, Wake up, Wake');
    onWakeInterruptPhrasesChange('Yo, WTF, One sec, Hold on');
    onWakeEndPhrasesChange('Send, End, Capische');
  };

  return (
    <section className="bg-surface rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-accent">
        <Mic className="w-5 h-5" />
        <h2 className="font-semibold text-white">Mic & Voice</h2>
      </div>
      <Toggle
        checked={voiceEnabled}
        onChange={onVoiceEnabledChange}
        label="Voice output"
        description="Speak responses aloud using the character's voice"
      />
      <Toggle
        checked={bargeInEnabled}
        onChange={onBargeInEnabledChange}
        label="Cut off while speaking"
        description="Press the mic button to interrupt your companion"
      />
      <Toggle
        checked={sttProvider === 'browser'}
        onChange={(v) => onSttProviderChange(v ? 'browser' : 'deepgram')}
        label="Use browser speech for input"
        description="Bypass Deepgram if it’s blocked on your network"
      />
      <Toggle
        checked={wakeWordEnabled}
        onChange={onWakeWordEnabledChange}
        label="Wake-word listening"
        description="Say a wake phrase to start or stop the mic hands-free"
      />
      <div className="bg-background rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Wake phrases</p>
            <p className="text-[10px] text-gray-400">
              Comma-separated. Three actions: start listening, interrupt, end turn.
            </p>
          </div>
          <button
            onClick={resetWakePhrases}
            className="text-[10px] text-accent active:text-white"
          >
            Reset
          </button>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-gray-400">Wake / start listening</label>
          <input
            type="text"
            value={wakeStartPhrases}
            onChange={(e) => onWakeStartPhrasesChange(e.target.value)}
            placeholder="Hello, Hey, Wake up, Wake"
            className="w-full bg-surface text-white text-sm rounded-xl px-3 py-2 border border-white/10 focus:border-accent outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-gray-400">Interrupt while speaking</label>
          <input
            type="text"
            value={wakeInterruptPhrases}
            onChange={(e) => onWakeInterruptPhrasesChange(e.target.value)}
            placeholder="Yo, WTF, One sec, Hold on"
            className="w-full bg-surface text-white text-sm rounded-xl px-3 py-2 border border-white/10 focus:border-accent outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-gray-400">End the turn</label>
          <input
            type="text"
            value={wakeEndPhrases}
            onChange={(e) => onWakeEndPhrasesChange(e.target.value)}
            placeholder="Send, End, Capische"
            className="w-full bg-surface text-white text-sm rounded-xl px-3 py-2 border border-white/10 focus:border-accent outline-none"
          />
        </div>
      </div>
    </section>
  );
}
