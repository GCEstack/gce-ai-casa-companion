import { useNavigate } from 'react-router';
import { Mic } from 'lucide-react';
import { characters } from '@/lib/characters';
import type { Character } from '@/types';

function getRole(character: Character): string {
  const parts = character.description.split('—');
  const last = parts[parts.length - 1]?.trim() ?? '';
  return last || character.italianMeaning;
}

export default function Landing() {
  const navigate = useNavigate();

  const pietro = characters.find((c) => c.slug === 'pietro');
  const others = characters
    .filter((c) => c.slug !== 'pietro')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const roster = pietro ? [pietro, ...others] : others;

  return (
    <main className="relative h-[100dvh] w-full flex flex-col overflow-hidden bg-[#060610]">
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, rgba(255,110,199,0.12) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, rgba(0,245,255,0.10) 0%, transparent 70%)' }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(6,6,16,0.3) 0%, rgba(6,6,16,0.85) 60%, rgba(6,6,16,1) 100%)',
          }}
        />
      </div>

      {/* Top: brand */}
      <div className="relative z-10 flex items-center justify-center gap-2 pt-8 pb-4">
        <Mic className="w-5 h-5 text-[#FF6EC7]" />
        <span className="text-lg font-bold text-white/90 tracking-tight">Casa Companion</span>
      </div>

      {/* Center: title and featured companion */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h1
          className="text-4xl md:text-6xl font-black text-white mb-4"
          style={{
            textShadow: '0 0 60px rgba(255,110,199,0.3)',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          Pick Your Companion
        </h1>
        <p className="text-base md:text-lg text-white/50 max-w-md mb-10">
          Choose a friend and start talking.
        </p>

        {pietro && (
          <button
            type="button"
            onClick={() => navigate('/character/pietro')}
            className="group relative flex flex-col items-center gap-3 transition-transform active:scale-95"
          >
            <div
              className="relative w-40 h-40 md:w-52 md:h-52 rounded-3xl overflow-hidden"
              style={{
                boxShadow: '0 0 40px rgba(255,110,199,0.25), 0 8px 32px rgba(0,0,0,0.4)',
              }}
            >
              <img
                src={pietro.portrait}
                alt={pietro.name}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-white/70 text-sm font-medium">{getRole(pietro)}</span>
          </button>
        )}
      </div>

      {/* Bottom: rolodex */}
      <div className="relative z-10 pb-8 md:pb-12">
        <div className="px-4 mb-3">
          <p className="text-[10px] md:text-xs font-bold tracking-[0.2em] uppercase text-white/40 text-center">
            Scroll to find more friends
          </p>
        </div>
        <div
          className="flex gap-4 overflow-x-auto px-6 pb-4 snap-x snap-mandatory hide-scrollbar"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {roster.map((character) => (
            <button
              key={character.slug}
              type="button"
              onClick={() => navigate(`/character/${character.slug}`)}
              className="group flex-shrink-0 snap-center flex flex-col items-center gap-2 transition-transform active:scale-90"
            >
              <div
                className="relative w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden border-2 border-transparent transition-all"
                style={{
                  boxShadow: `0 0 20px ${character.accentColor}30`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = character.accentColor;
                  e.currentTarget.style.boxShadow = `0 0 30px ${character.accentColor}60`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.boxShadow = `0 0 20px ${character.accentColor}30`;
                }}
              >
                <img
                  src={character.portrait}
                  alt={character.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="text-[10px] md:text-xs font-medium text-white/70 max-w-[72px] truncate">
                {character.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
