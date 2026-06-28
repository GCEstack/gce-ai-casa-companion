import { useNavigate } from 'react-router-dom';
import { getCharacterDescription } from '@/lib/characters';
import type { Character } from '@/types';

interface CharacterCardProps {
  character: Character;
  role?: string;
}

export default function CharacterCard({ character, role }: CharacterCardProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/character/${character.slug}`)}
      aria-label={`Select ${getCharacterDescription(character)}`}
      className="flex flex-col items-center justify-center p-3 rounded-2xl bg-surface active:scale-95 transition-transform min-h-[120px] w-full"
    >
      <div className="rounded-full bg-white/10 p-1 mb-2">
        <img
          src={character.portrait}
          alt=""
          className="w-20 h-20 rounded-full object-cover"
          loading="lazy"
        />
      </div>
      <span className="text-sm font-semibold text-white">{character.name}</span>
      {role && <span className="text-[10px] text-gray-400 text-center leading-tight mt-0.5">{role}</span>}
    </button>
  );
}
