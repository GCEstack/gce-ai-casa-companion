"use client";

import Image from "next/image";
import { characters, Character } from "@/lib/characters";

interface CharacterSelectorProps {
  selectedKey?: string;
  onSelect: (character: Character) => void;
}

export default function CharacterSelector({
  selectedKey,
  onSelect,
}: CharacterSelectorProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-center text-xl font-bold text-white">
        Pick your Casa Companion
      </h2>
      <p className="text-center text-sm text-slate-400">
        Choose a friend. Their personality, stories, and voice come from who they are.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {characters.map((character) => {
          const isSelected = selectedKey === character.key;
          return (
            <button
              key={character.key}
              onClick={() => onSelect(character)}
              className={`relative flex flex-col items-center rounded-xl border bg-panel p-3 text-center transition hover:border-neon-cyan/50 hover:bg-surface ${
                isSelected
                  ? "border-neon-pink shadow-[0_0_20px_rgba(255,42,109,0.3)]"
                  : "border-slate-700"
              }`}
            >
              <div className="relative mb-2 h-20 w-20 overflow-hidden rounded-full border-2 border-slate-600">
                <Image
                  src={character.image}
                  alt={character.name}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </div>
              <span className="text-sm font-bold text-white">
                {character.name}
              </span>
              <span className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                {character.meaning}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
