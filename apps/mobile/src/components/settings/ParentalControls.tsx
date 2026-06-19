import { useState } from 'react';
import { ShieldAlert, Lock } from 'lucide-react';

const CAP_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '60 min', value: 60 },
];

interface ParentalControlsProps {
  timeCapMinutes: number;
  lockPin: string;
  onTimeCapChange: (minutes: number) => void;
  onLockPinChange: (pin: string) => void;
  onLockNow: () => void;
}

export function ParentalControls({
  timeCapMinutes,
  lockPin,
  onTimeCapChange,
  onLockPinChange,
  onLockNow,
}: ParentalControlsProps) {
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');

  const handleSetPin = () => {
    if (pinInput.length < 4) {
      setPinError('PIN must be at least 4 digits.');
      return;
    }
    if (pinInput !== pinConfirm) {
      setPinError('PINs do not match.');
      return;
    }
    onLockPinChange(pinInput);
    setPinInput('');
    setPinConfirm('');
    setPinError('');
  };

  const handleLockNow = () => {
    if (!lockPin) {
      setPinError('Set a PIN first, then lock.');
      return;
    }
    onLockNow();
  };

  return (
    <section className="bg-surface rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2 text-accent">
        <ShieldAlert className="w-5 h-5" />
        <h2 className="font-semibold text-white">Parental Controls</h2>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-gray-300">Daily time cap</p>
        <div className="grid grid-cols-4 gap-2">
          {CAP_OPTIONS.map((opt) => {
            const active = timeCapMinutes === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onTimeCapChange(opt.value)}
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
        {!lockPin && (
          <p className="text-[11px] text-gray-400">
            Set and save a PIN to enable the parental lock.
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder={lockPin ? 'New PIN' : 'Set PIN'}
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
        disabled={!lockPin}
        className="w-full py-2.5 rounded-xl bg-red-500/10 text-red-400 text-sm font-medium border border-red-500/20 active:bg-red-500/20 disabled:opacity-40 disabled:active:bg-transparent flex items-center justify-center gap-2"
      >
        <Lock className="w-4 h-4" />
        {!lockPin ? 'Save a PIN to lock' : 'Lock App Now'}
      </button>
    </section>
  );
}
