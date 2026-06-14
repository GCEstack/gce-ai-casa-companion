import { characters } from '@/lib/characters';

interface CompanionLaneProps {
  activeSlug: string;
  onSelect: (slug: string) => void;
}

export default function CompanionLane({ activeSlug, onSelect }: CompanionLaneProps) {
  return (
    <aside className="companion-lane">
      {characters.map((char) => (
        <button
          key={char.slug}
          className={`lane-companion ${char.slug === activeSlug ? 'active' : ''}`}
          onClick={() => onSelect(char.slug)}
          title={char.name}
          type="button"
        >
          <img
            src={char.portrait}
            alt={char.name}
            className="lane-avatar"
          />
          <span className="lane-name">{char.name}</span>
        </button>
      ))}
    </aside>
  );
}
