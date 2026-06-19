"use client";

import { modes } from "@/lib/modes";

interface Props {
  selected?: string;
  onSelect: (key: string) => void;
}

export function ModeSelector({ selected, onSelect }: Props) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <h2 className="text-center font-serif text-2xl font-bold text-casa-goldLight">Pick a Mode</h2>
      <p className="mt-2 text-center text-sm text-casa-taupe">What do you want to do together?</p>
      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => onSelect(m.key)}
            className={`flex items-center gap-2 rounded-xl border p-3 text-left transition ${
              selected === m.key
                ? "border-casa-gold bg-casa-gold/15"
                : "border-casa-border bg-casa-card hover:border-casa-gold/40"
            }`}
          >
            <span className="text-xl">{m.icon}</span>
            <span className="text-xs font-bold text-casa-cream">{m.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
