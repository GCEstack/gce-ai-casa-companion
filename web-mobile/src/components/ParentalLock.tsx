import { useState } from 'react';
import type { ReactNode } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { useAppSettings } from '@/lib/settings';

interface ParentalLockProps {
  children: ReactNode;
}

export default function ParentalLock({ children }: ParentalLockProps) {
  const { settings, setLocked } = useAppSettings();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  // If no PIN has been set, the lock is disabled entirely.
  if (!settings.lockPin || !settings.locked) {
    return <>{children}</>;
  }

  const handleUnlock = () => {
    if (pin === settings.lockPin) {
      setLocked(false);
      setPin('');
      setError(false);
    } else {
      setError(true);
      setPin('');
    }
  };

  return (
    <>
      {children}
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center px-8">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6">
          <Lock className="w-8 h-8 text-white/70" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Locked</h2>
        <p className="text-sm text-gray-400 text-center mb-6">
          This device is locked by a parent. Enter the PIN to continue.
        </p>

        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
            setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleUnlock();
          }}
          placeholder="Enter PIN"
          className="w-full max-w-[240px] h-12 px-4 rounded-xl bg-surface text-white text-center text-lg tracking-[0.3em] placeholder-gray-600 outline-none border border-white/10 focus:border-white/30"
        />

        {error && (
          <p className="text-xs text-red-400 mt-3">Wrong PIN. Try again.</p>
        )}

        <button
          onClick={handleUnlock}
          disabled={!pin}
          className="mt-6 flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 text-white font-medium disabled:opacity-40 active:scale-95 transition-transform"
        >
          <Unlock className="w-4 h-4" />
          Unlock
        </button>
      </div>
    </>
  );
}
