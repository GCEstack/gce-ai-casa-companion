import { useNavigate } from 'react-router';
import { Mic } from 'lucide-react';
import VideoBackground from '@/components/VideoBackground';
import ParticleField from '@/components/ParticleField';
import CharacterCard from '@/components/CharacterCard';
import FooterSection from '@/sections/FooterSection';
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
  const gridCharacters = pietro ? [pietro, ...others] : others;

  return (
    <main className="relative min-h-[100dvh] pb-12">
      {/* Hero */}
      <section className="relative min-h-[50dvh] flex flex-col items-center justify-center overflow-hidden px-4 pt-10 pb-4">
        <VideoBackground blur={60} brightness={0.4} overlayOpacity={0.85} />
        <ParticleField count={60} hueMin={40} hueMax={55} />

        <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-4">
            <Mic className="w-6 h-6 text-[#d4a843]" />
            <span className="text-3xl font-extrabold text-white tracking-tight">Casa Companion</span>
          </div>

          {/* Tagline */}
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Your AI companion. Real voice. Real personality.
          </h1>
          <p className="text-base md:text-lg text-gray-400 mb-8">
            Pick a friend. Start talking.
          </p>
        </div>
      </section>

      {/* Featured Pietro */}
      {pietro && (
        <section className="relative z-10 px-4 mb-8">
          <div className="max-w-[1100px] mx-auto">
            <div
              className="pietro-featured cursor-pointer"
              onClick={() => navigate('/character/pietro')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') navigate('/character/pietro');
              }}
            >
              <div className="flex-1 text-left">
                <span className="pietro-badge">Meet the Founder</span>
                <h2 className="text-2xl md:text-3xl font-bold text-white mt-2 mb-3">
                  {pietro.name}
                </h2>
                <p className="text-sm md:text-base text-gray-400 mb-6 max-w-md">
                  {getRole(pietro)}
                </p>
                <button
                  type="button"
                  className="talk-to-pietro-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate('/character/pietro');
                  }}
                >
                  Talk to Pietro
                </button>
              </div>
              <img
                src={pietro.portrait}
                alt={pietro.name}
                className="pietro-portrait"
              />
            </div>
          </div>
        </section>
      )}

      {/* Character grid */}
      <section id="characters" className="relative z-10 py-8 px-4">
        <div className="max-w-[1100px] mx-auto">
          <div className="text-center mb-6">
            <h2 className="companion-heading">Pick Your Companion</h2>
          </div>

          <div className="character-grid">
            {gridCharacters.map((character) => (
              <CharacterCard key={character.slug} character={character} role={getRole(character)} />
            ))}
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  );
}
