"use client";

import Image from "next/image";
import { characters } from "@/lib/characters";

interface Props {
  selected: string;
  onSelect: (key: string) => void;
}

export function CharacterGrid({ selected, onSelect }: Props) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <h2 className="text-center font-serif text-2xl font-bold text-casa-goldLight">Pick a Companion</h2>
      <p className="mt-2 text-center text-sm text-casa-taupe">Choose who you want to talk to.</p>
      <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {characters.map((c) => (
          <button
            key={c.key}
            onClick={() => onSelect(c.key)}
            className={`flex flex-col items-center rounded-2xl border p-3 transition ${
              selected === c.key
                ? "border-casa-gold bg-casa-gold/15"
                : "border-casa-border bg-casa-card hover:border-casa-gold/40"
            }`}
          >
            <div className="relative h-16 w-16 overflow-hidden rounded-full">
              <Image src={c.image} alt={c.name} fill className="object-contain p-1" />
            </div>
            <span className="mt-2 text-xs font-bold text-casa-cream">{c.name}</span>
            <span className="text-[10px] italic text-casa-taupe">{c.meaning}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
