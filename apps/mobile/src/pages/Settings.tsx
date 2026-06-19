import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Info } from 'lucide-react';
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
import { ModeSettings } from '@/components/settings/ModeSettings';
import { VoiceSettings } from '@/components/settings/VoiceSettings';
import { UsageStats } from '@/components/settings/UsageStats';
import { ParentalControls } from '@/components/settings/ParentalControls';
import { ApiKeys } from '@/components/settings/ApiKeys';

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
  const [groqKey, setGroqKeyState] = useState('');
  const [deepgramKey, setDeepgramKeyState] = useState('');
  const [openaiKey, setOpenaiKeyState] = useState('');

  const [messageCount, setMessageCount] = useState(getMessageCount());
  const [sessionSeconds, setSessionSeconds] = useState(() =>
    Math.floor((Date.now() - getSessionStart()) / 1000)
  );

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

  const handleLockNow = () => {
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
        <ModeSettings
          activeMode={settings.activeMode}
          onSetActiveMode={setActiveMode}
        />

        <VoiceSettings
          voiceEnabled={settings.voiceEnabled}
          bargeInEnabled={settings.bargeInEnabled}
          sttProvider={settings.sttProvider}
          wakeWordEnabled={settings.wakeWordEnabled}
          wakeStartPhrases={settings.wakeStartPhrases}
          wakeInterruptPhrases={settings.wakeInterruptPhrases}
          wakeEndPhrases={settings.wakeEndPhrases}
          onVoiceEnabledChange={setVoiceEnabled}
          onBargeInEnabledChange={setBargeInEnabled}
          onSttProviderChange={setSttProvider}
          onWakeWordEnabledChange={setWakeWordEnabled}
          onWakeStartPhrasesChange={setWakeStartPhrases}
          onWakeInterruptPhrasesChange={setWakeInterruptPhrases}
          onWakeEndPhrasesChange={setWakeEndPhrases}
        />

        <UsageStats
          messageCount={messageCount}
          minutes={minutes}
          estimatedCost={estimatedCost}
          capMinutes={settings.timeCapMinutes}
          onReset={handleResetUsage}
        />

        <ParentalControls
          timeCapMinutes={settings.timeCapMinutes}
          lockPin={settings.lockPin}
          onTimeCapChange={setTimeCapMinutes}
          onLockPinChange={setLockPin}
          onLockNow={handleLockNow}
        />

        <ApiKeys
          groqKey={groqKey}
          deepgramKey={deepgramKey}
          openaiKey={openaiKey}
          onGroqKeySave={setGroqKey}
          onDeepgramKeySave={setDeepgramKey}
          onOpenAIKeySave={setOpenAIKey}
        />

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
