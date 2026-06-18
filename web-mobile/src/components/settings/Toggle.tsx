interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: ToggleProps) {
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
