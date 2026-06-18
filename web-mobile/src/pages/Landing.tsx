import { Mic, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CharacterCard from '@/components/CharacterCard';
import BottomNav from '@/components/BottomNav';
import { useAvailableCharacters } from '@/hooks/useAvailableCharacters';
import { getCharacterRole } from '@/lib/characters';
import type { Character } from '@/types';

function FeaturedCard({ character }: { character: Character }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/character/${character.slug}`)}
      className="relative w-full p-5 rounded-3xl bg-surface active:scale-95 transition-transform text-left overflow-hidden"
      style={{ border: `1px solid ${character.accentColor}30` }}
    >
      <div
        className="absolute -right-6 -top-6 w-32 h-32 rounded-full opacity-10"
        style={{ backgroundColor: character.accentColor }}
      />
      <div className="flex items-center gap-4 relative z-10">
        <img
          src={character.portrait}
          alt={character.name}
          className="w-24 h-24 rounded-full object-cover border-2 border-white/10"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="w-3.5 h-3.5" style={{ color: character.accentColor }} />
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: character.accentColor }}>
              Main companion
            </span>
          </div>
          <h3 className="text-xl font-bold text-white">{character.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{getCharacterRole(character)}</p>
          <p className="text-[10px] text-gray-500 mt-2">Tap to start talking</p>
        </div>
      </div>
    </button>
  );
}

export default function Landing() {
  const { characters: availableCharacters, featured, userName, isPersonalized } = useAvailableCharacters();
  const others = availableCharacters.filter((c) => c.slug !== featured?.slug);

  return (
    <div className="min-h-full flex flex-col">
      {/* Hero */}
      <section className="relative px-6 pt-10 pb-6 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Mic className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-bold text-white">
            {isPersonalized ? `${userName}'s Companions` : 'Casa Companion'}
          </h1>
        </div>
        <p className="text-sm text-gray-400">
          {isPersonalized
            ? `Pick a friend, ${userName}. Start talking.`
            : 'Pick a friend. Start talking.'}
        </p>
      </section>

      {/* Character grid */}
      <section className="flex-1 px-4 pb-24 space-y-5">
        {featured && <FeaturedCard character={featured} />}

        {others.length > 0 && (
          <>
            <h2 className="text-sm font-semibold text-gray-300 px-1">
              {featured ? 'More friends' : 'Pick Your Companion'}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {others.map((character) => (
                <CharacterCard key={character.slug} character={character} role={getCharacterRole(character)} />
              ))}
            </div>
          </>
        )}
      </section>

      <BottomNav />
    </div>
  );
}
