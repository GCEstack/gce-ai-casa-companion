import { useNavigate } from 'react-router';
import { Mic } from 'lucide-react';
import { characters } from '@/lib/characters';

const FEATURED_SLUGS = [
  'pietro',
  'mamma',
  'tartaruga',
  'delfino',
  'leone',
  'rocco',
  'bella',
  'drago',
  'volpe',
  'maestra',
];

export default function CharactersPage() {
  const navigate = useNavigate();

  const featured = FEATURED_SLUGS.map(
    (slug) => characters.find((c) => c.slug === slug)
  ).filter(Boolean) as typeof characters;

  return (
    <main className="relative min-h-[100dvh] w-full flex flex-col overflow-hidden bg-[#060610]">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, rgba(255,110,199,0.12) 0%, transparent 70%)' }}
        />
        <div
          className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, rgba(0,245,255,0.10) 0%, transparent 70%)' }}
        />
      </div>

      {/* Top: brand */}
      <div className="relative z-10 flex items-center justify-center gap-2 pt-8 pb-4">
        <Mic className="w-5 h-5 text-[#FF6EC7]" />
        <span className="text-lg font-bold text-white/90 tracking-tight">Casa Companion</span>
      </div>

      {/* Title */}
      <div className="relative z-10 px-6 text-center mb-8">
        <h1
          className="text-3xl md:text-5xl font-black text-white mb-2"
          style={{
            textShadow: '0 0 60px rgba(255,110,199,0.3)',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          Choose Your Companion
        </h1>
        <p className="text-white/50 text-sm md:text-base">Pick a friend and start talking.</p>
      </div>

      {/* Grid */}
      <div className="relative z-10 flex-1 px-6 pb-12 overflow-y-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6 max-w-5xl mx-auto">
          {featured.map((character) => (
            <button
              key={character.slug}
              type="button"
              onClick={() => navigate(`/character/${character.slug}`)}
              className="group flex flex-col items-center gap-3 transition-transform active:scale-95"
            >
              <div
                className="relative w-full aspect-square rounded-3xl overflow-hidden border-2 border-transparent transition-all"
                style={{
                  boxShadow: `0 0 20px ${character.accentColor}30`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = character.accentColor;
                  e.currentTarget.style.boxShadow = `0 0 40px ${character.accentColor}60`;
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
              <span className="text-sm font-bold text-white/90">{character.name}</span>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
