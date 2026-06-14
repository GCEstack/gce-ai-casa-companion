import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { characters } from '@/lib/characters';
import CharacterCard from '@/components/CharacterCard';

gsap.registerPlugin(ScrollTrigger);

export default function CharacterGrid() {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!titleRef.current || !containerRef.current) return;

    // Title reveal
    gsap.fromTo(
      titleRef.current,
      { y: 40, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: titleRef.current,
          start: 'top 90%',
        },
      }
    );

    // Cards stagger reveal
    const cards = containerRef.current.querySelectorAll('.character-card-wrapper');
    gsap.fromTo(
      cards,
      { y: 60, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.08,
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top 85%',
        },
      }
    );
  }, { scope: containerRef });

  return (
    <section id="characters" className="relative z-10 py-16 px-4">
      {/* Section title */}
      <div ref={titleRef} className="text-center mb-10">
        <h2 className="text-2xl font-semibold text-white mb-2">Pick your Casa Companion</h2>
        <p className="text-sm text-gray-400">
          Choose a friend. Their personality, stories, and voice come from who they are.
        </p>
      </div>

      {/* Character grid */}
      <div
        ref={containerRef}
        className="grid gap-4 max-w-[1100px] mx-auto"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
      >
        {characters.map((character) => (
          <div key={character.slug} className="character-card-wrapper">
            <CharacterCard character={character} />
          </div>
        ))}
      </div>
    </section>
  );
}
