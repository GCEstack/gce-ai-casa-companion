import { Mic, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CharacterCard from '@/components/CharacterCard';
import BottomNav from '@/components/BottomNav';
import { characters } from '@/lib/characters';
import {
  userName,
  isPersonalized,
  getLandingCharacters,
  getFeaturedCharacter,
} from '@/lib/personalization';
import type { Character } from '@/types';

// Per-site character sets. If a hostname has an entry, the landing page shows
// only those characters (in order). Otherwise it shows the full grid.
const HOST_CHARACTER_SETS: Record<string, string[]> = {
  'casa-jack.netlify.app': ['jack', 'tartaruga', 'veloce', 'corvo'],
  'casa-kids-liam.vercel.app': ['jack', 'tartaruga', 'veloce', 'corvo'],
  'web-mobile-liam.vercel.app': ['jack', 'tartaruga', 'veloce', 'corvo'],
  'casa-web-mobile-liam.fly.dev': ['jack', 'tartaruga', 'veloce', 'corvo'],
  'casa-jenny.netlify.app': ['agenda'],
  'casa-kids-jenny.vercel.app': ['agenda'],
  'web-mobile-jenny.vercel.app': ['agenda'],
  'casa-web-mobile-jenny.fly.dev': ['agenda'],
  'casa-jimmy.netlify.app': ['papa', 'gufo', 'fraggl', 'stellino', 'rocco', 'onda'],
  'casa-kids-jimmy.vercel.app': ['papa', 'gufo', 'fraggl', 'stellino', 'rocco', 'onda'],
  'web-mobile-jimmy.vercel.app': ['papa', 'gufo', 'fraggl', 'stellino', 'rocco', 'onda'],
  'casa-web-mobile-jimmy.fly.dev': ['papa', 'gufo', 'fraggl', 'stellino', 'rocco', 'onda'],
  'casa-kids-peter.vercel.app': ['pietro', 'jack', 'corvo'],
  'web-mobile-peter.vercel.app': ['pietro', 'jack', 'corvo'],
  'casa-web-mobile-peter.fly.dev': ['pietro', 'jack', 'corvo'],
};

function getRole(character: Character): string {
  const parts = character.description.split('—');
  const last = parts[parts.length - 1]?.trim() ?? '';
  return last || character.italianMeaning;
}

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
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{getRole(character)}</p>
          <p className="text-[10px] text-gray-500 mt-2">Tap to start talking</p>
        </div>
      </div>
    </button>
  );
}

function getSiteCharacters(all: Character[]): Character[] {
  const slugs = HOST_CHARACTER_SETS[window.location.hostname];
  if (!slugs || slugs.length === 0) return all;
  const map = new Map(all.map((c) => [c.slug, c]));
  return slugs.map((slug) => map.get(slug)).filter(Boolean) as Character[];
}

export default function Landing() {
  const siteCharacters = getSiteCharacters(characters);
  const landingCharacters = getLandingCharacters(siteCharacters);
  const featured = getFeaturedCharacter(siteCharacters);
  const others = landingCharacters.filter((c) => c.slug !== featured?.slug);

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
                <CharacterCard key={character.slug} character={character} role={getRole(character)} />
              ))}
            </div>
          </>
        )}
      </section>

      <BottomNav />
    </div>
  );
}
