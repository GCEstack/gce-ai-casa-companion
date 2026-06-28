import { useState } from 'react';

interface PairingFormProps {
  onSubmit: (code: string) => void;
  disabled?: boolean;
}

export function PairingForm({ onSubmit, disabled }: PairingFormProps) {
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = code.trim().toUpperCase();
    if (cleaned.length === 6) {
      onSubmit(cleaned);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4 w-full max-w-xs">
      <label htmlFor="pairing-code" className="text-white text-lg font-semibold">
        Enter 6-character code
      </label>
      <input
        id="pairing-code"
        type="text"
        inputMode="text"
        autoComplete="off"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        disabled={disabled}
        className="w-full text-center text-3xl tracking-[0.5em] uppercase bg-surface text-white rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-primary disabled:opacity-50"
        placeholder="ABC123"
      />
      <button
        type="submit"
        disabled={disabled || code.trim().length !== 6}
        className="w-full bg-primary text-white font-semibold rounded-xl py-3 px-6 disabled:opacity-50 active:scale-95 transition-transform"
      >
        Join
      </button>
    </form>
  );
}
