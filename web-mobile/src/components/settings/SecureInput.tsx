import { useEffect, useState } from 'react';

interface SecureInputProps {
  label: string;
  icon: React.ElementType;
  value: string;
  placeholder: string;
  onSave: (val: string) => void;
}

export function SecureInput({
  label,
  icon: Icon,
  value,
  placeholder,
  onSave,
}: SecureInputProps) {
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
