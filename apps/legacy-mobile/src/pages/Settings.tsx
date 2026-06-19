import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Trash2,
  KeyRound,
  Info,
  Mic,
  Sparkles,
  Gamepad2,
  BookOpen,
  HeartHandshake,
  Hand,
  Clock,
  Lock,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react';
import {
  getGroqKey,
  setGroqKey,
  getDeepgramKey,
  setDeepgramKey,
  getOpenAIKey,
  setOpenAIKey,
  clearAllCache,
  useAppSettings,
  getMessageCount,
  getSessionStart,
  resetUsage,
  setLocked,
} from '@/lib/settings';
import { allModes, playModes, learnModes, supportModes } from '@/lib/modes';
import { ModeIcon } from '@/components/ModeIcon';
import type { ModeConfig } from '@/types';

const categoryMeta: Record<
  string,
  { label: string; icon: React.ElementType; modes: ModeConfig[] }
> = {
  introduction: { label: 'Introduction', icon: Hand, modes: [allModes[0]] },
  play: { label: 'Play', icon: Gamepad2, modes: playModes },
  learn: { label: 'Learn', icon: BookOpen, modes: learnModes },
  support: { label: 'Support', icon: HeartHandshake, modes: supportModes },
};

const CAP_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '60 min', value: 60 },
];

function SecureInput({
  label,
  icon: Icon,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  icon: React.ElementType;
  value: string;
  placeholder: string;
  onSave: (val: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const [show, setShow] = useState(false);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-gray-300">
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex gap-2">
        <input
          type={show ? 'text' : 'password'}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => onSave(local.trim())}
          placeholder={placeholder}
          className="flex-1 bg-background text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:border-accent outline-none"
        />
        <button
          onClick={() => setShow((s) => !s)}
          className="px-3 text-xs text-gray-400 bg-background rounded-xl border border-white/10 active:bg-white/5"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`w-full flex items-center justify-between p-3 rounded-xl bg-background border border-white/5 text-left ${
        disabled ? 'opacity-50' : 'active:bg-white/5'
      }`}
    >
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        {description && <p className="text-[10px] text-gray-400">{description}</p>}
      </div>
      <div
        className={`w-11 h-6 rounded-full relative transition-colors ${
          checked ? 'bg-accent' : 'bg-white/10'
        }`}
        style={{ backgroundColor: checked ? undefined : '' }}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </div>
    </button>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const {
    settings,
    setActiveMode,
    setVoiceEnabled,
    setTimeCapMinutes,
    setLockPin,
    setBargeInEnabled,
    setWakeWordEnabled,
    setWakeStartPhrases,
    setWakeInterruptPhrases,
    setWakeEndPhrases,
    setSttProvider,
  } = useAppSettings();
  const [cleared, setCleared] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [groqKey, setGroqKeyState] = useState('');
  const [deepgramKey, setDeepgramKeyState] = useState('');
  const [openaiKey, setOpenaiKeyState] = useState('');

  const [messageCount, setMessageCount] = useState(getMessageCount());
  const [sessionSeconds, setSessionSeconds] = useState(() =>
    Math.floor((Date.now() - getSessionStart()) / 1000)
  );

  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    setGroqKeyState(getGroqKey() ?? '');
    setDeepgramKeyState(getDeepgramKey() ?? '');
    setOpenaiKeyState(getOpenAIKey() ?? '');
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSessionSeconds(Math.floor((Date.now() - getSessionStart()) / 1000));
      setMessageCount(getMessageCount());
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const minutes = Math.floor(sessionSeconds / 60);
  const estimatedCost = messageCount * 0.003;
  const capMinutes = settings.timeCapMinutes;
  const capPercent = capMinutes > 0 ? Math.min(100, (minutes / capMinutes) * 100) : 0;

  const handleClear = async () => {
    if (!window.confirm('Clear all saved settings, favorites, and cached files?')) return;
    await clearAllCache();
    setGroqKeyState('');
    setDeepgramKeyState('');
    setOpenaiKeyState('');
    setMessageCount(0);
    setSessionSeconds(0);
    setCleared(true);
    setTimeout(() => setCleared(false), 3000);
  };

  const handleResetUsage = () => {
    resetUsage();
    setMessageCount(0);
    setSessionSeconds(0);
  };

  const handleSetPin = () => {
    if (pinInput.length < 4) {
      setPinError('PIN must be at least 4 digits.');
      return;
    }
    if (pinInput !== pinConfirm) {
      setPinError('PINs do not match.');
      return;
    }
    setLockPin(pinInput);
    setPinInput('');
    setPinConfirm('');
    setPinError('');
  };

  const handleLockNow = () => {
    if (!settings.lockPin) {
      setPinError('Set a PIN first, then lock.');
      return;
    }
    setLocked(true);
    setMessageCount(getMessageCount());
  };

  return (
    <div className="min-h-full flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 pt-3 pb-2 safe-top shrink-0 border-b border-white/5">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full text-gray-300 hover:bg-white/5 active:bg-white/10 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-white">Companion Settings</h1>
      </header>

      <div className="flex-1 px-4 py-5 space-y-5 overflow-y-auto">
        {/* Active Mode */}
        <section className="bg-surface rounded-2xl p-4 space-y-4">
          <div className="flex items-center gap-2 text-accent">
            <Sparkles className="w-5 h-5" />
            <h2 className="font-semibold text-white">Active Mode</h2>
          </div>
          <p className="text-xs text-gray-400">
            Choose what your companion should focus on right now.
          </p>

          {Object.entries(categoryMeta).map(([key, meta]) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-1.5 text-gray-300">
                <meta.icon className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold uppercase tracking-wider">{meta.label}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {meta.modes.map((mode) => {
                  const active = settings.activeMode.slug === mode.slug;
                  return (
                    <button
                      key={mode.slug}
                      onClick={() => setActiveMode(mode)}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        active
                          ? 'bg-white/10 border-accent'
                          : 'bg-background border-white/5 active:bg-white/5'
                      }`}
                      style={active ? { borderColor: mode.accentColor } : {}}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className="w-6 h-6 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: mode.accentMuted }}
                        >
                          <ModeIcon name={mode.icon} className="w-3.5 h-3.5" style={{ color: mode.accentColor }} />
                        </div>
                        <span className="text-xs font-semibold text-white leading-tight">
                          {mode.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 line-clamp-2">{mode.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {/* Companion settings */}
        <section className="bg-surface rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-accent">
            <Mic className="w-5 h-5" />
            <h2 className="font-semibold text-white">Mic & Voice</h2>
          </div>
          <Toggle
            checked={settings.voiceEnabled}
            onChange={setVoiceEnabled}
            label="Voice output"
            description="Speak responses aloud using the character's voice"
          />
          <Toggle
            checked={settings.bargeInEnabled}
            onChange={setBargeInEnabled}
            label="Cut off while speaking"
            description="Press the mic button to interrupt your companion"
          />
          <Toggle
            checked={settings.sttProvider === 'browser'}
            onChange={(v) => setSttProvider(v ? 'browser' : 'deepgram')}
            label="Use browser speech for input"
            description="Bypass Deepgram if it’s blocked on your network"
          />
          <Toggle
            checked={settings.wakeWordEnabled}
            onChange={setWakeWordEnabled}
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
                onClick={() => {
                  setWakeStartPhrases('Hello, Hey, Wake up, Wake');
                  setWakeInterruptPhrases('Yo, WTF, One sec, Hold on');
                  setWakeEndPhrases('Send, End, Capische');
                }}
                className="text-[10px] text-accent active:text-white"
              >
                Reset
              </button>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400">Wake / start listening</label>
              <input
                type="text"
                value={settings.wakeStartPhrases}
                onChange={(e) => setWakeStartPhrases(e.target.value)}
                placeholder="Hello, Hey, Wake up, Wake"
                className="w-full bg-surface text-white text-sm rounded-xl px-3 py-2 border border-white/10 focus:border-accent outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400">Interrupt while speaking</label>
              <input
                type="text"
                value={settings.wakeInterruptPhrases}
                onChange={(e) => setWakeInterruptPhrases(e.target.value)}
                placeholder="Yo, WTF, One sec, Hold on"
                className="w-full bg-surface text-white text-sm rounded-xl px-3 py-2 border border-white/10 focus:border-accent outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400">End the turn</label>
              <input
                type="text"
                value={settings.wakeEndPhrases}
                onChange={(e) => setWakeEndPhrases(e.target.value)}
                placeholder="Send, End, Capische"
                className="w-full bg-surface text-white text-sm rounded-xl px-3 py-2 border border-white/10 focus:border-accent outline-none"
              />
            </div>
          </div>
        </section>

        {/* Usage */}
        <section className="bg-surface rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-accent">
              <Clock className="w-5 h-5" />
              <h2 className="font-semibold text-white">Usage Today</h2>
            </div>
            <button
              onClick={handleResetUsage}
              className="flex items-center gap-1 text-[10px] text-gray-400 active:text-white"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-background rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-white">{messageCount}</p>
              <p className="text-[10px] text-gray-400">messages</p>
            </div>
            <div className="bg-background rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-white">{minutes}</p>
              <p className="text-[10px] text-gray-400">minutes</p>
            </div>
            <div className="bg-background rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-white">~${estimatedCost.toFixed(2)}</p>
              <p className="text-[10px] text-gray-400">est. cost</p>
            </div>
          </div>

          {capMinutes > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Daily cap</span>
                <span>
                  {minutes} / {capMinutes} min
                </span>
              </div>
              <div className="h-2 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${capPercent}%`,
                    backgroundColor: capPercent >= 90 ? '#ef4444' : '#22c55e',
                  }}
                />
              </div>
            </div>
          )}
        </section>

        {/* Parental Controls */}
        <section className="bg-surface rounded-2xl p-4 space-y-4">
          <div className="flex items-center gap-2 text-accent">
            <ShieldAlert className="w-5 h-5" />
            <h2 className="font-semibold text-white">Parental Controls</h2>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-gray-300">Daily time cap</p>
            <div className="grid grid-cols-4 gap-2">
              {CAP_OPTIONS.map((opt) => {
                const active = settings.timeCapMinutes === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTimeCapMinutes(opt.value)}
                    className={`py-2 rounded-xl text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-accent text-white border-accent'
                        : 'bg-background text-gray-300 border-white/5 active:bg-white/5'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-gray-300">Parent PIN</p>
            <div className="flex gap-2">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={settings.lockPin ? 'New PIN' : 'Set PIN'}
                className="flex-1 bg-background text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:border-accent outline-none"
              />
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Confirm"
                className="flex-1 bg-background text-white text-sm rounded-xl px-3 py-2.5 border border-white/10 focus:border-accent outline-none"
              />
            </div>
            {pinError && <p className="text-xs text-red-400">{pinError}</p>}
            <button
              onClick={handleSetPin}
              className="w-full py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium active:bg-white/20"
            >
              Save PIN
            </button>
          </div>

          <button
            onClick={handleLockNow}
            className="w-full py-2.5 rounded-xl bg-red-500/10 text-red-400 text-sm font-medium border border-red-500/20 active:bg-red-500/20 flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            Lock App Now
          </button>
        </section>

        {/* Advanced / API Keys */}
        <section className="bg-surface rounded-2xl overflow-hidden">
          <button
            onClick={() => setAdvancedOpen((o) => !o)}
            className="w-full flex items-center justify-between p-4"
          >
            <div className="flex items-center gap-2 text-gray-300">
              <KeyRound className="w-5 h-5" />
              <h2 className="font-semibold text-white">Advanced API Keys</h2>
            </div>
            {advancedOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
          </button>
          {advancedOpen && (
            <div className="px-4 pb-4 space-y-5">
              <p className="text-xs text-gray-400">
                Stored locally. Usually not needed because the app uses built-in keys.
              </p>
              <SecureInput
                label="Groq API Key"
                icon={Sparkles}
                value={groqKey}
                placeholder="gsk_..."
                onSave={setGroqKey}
              />
              <SecureInput
                label="Deepgram API Key"
                icon={Mic}
                value={deepgramKey}
                placeholder="..."
                onSave={setDeepgramKey}
              />
              <SecureInput
                label="OpenAI API Key"
                icon={Sparkles}
                value={openaiKey}
                placeholder="sk-..."
                onSave={setOpenAIKey}
              />
            </div>
          )}
        </section>

        {/* Data */}
        <section className="bg-surface rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-400">
            <Trash2 className="w-5 h-5" />
            <h2 className="font-semibold text-white">Reset App Data</h2>
          </div>
          <p className="text-xs text-gray-400">
            Clears local settings, favorites, and cached files. You will need to reinstall the app for offline use.
          </p>
          <button
            onClick={handleClear}
            className="w-full py-2.5 rounded-xl bg-red-500/10 text-red-400 text-sm font-medium border border-red-500/20 active:bg-red-500/20"
          >
            Clear All Data
          </button>
          {cleared && (
            <p className="text-[10px] text-green-400 text-center">All data cleared.</p>
          )}
        </section>

        {/* About */}
        <section className="bg-surface rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-gray-400">
            <Info className="w-5 h-5" />
            <h2 className="font-semibold text-white">About</h2>
          </div>
          <p className="text-xs text-gray-400">Casa Companion Mobile</p>
          <p className="text-[10px] text-gray-500">Version 0.0.3</p>
        </section>
      </div>
    </div>
  );
}
