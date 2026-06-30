import { useNavigate } from 'react-router';
import type { Character } from '@/types';
import { getCharacterMotion } from '@/lib/characterMotions';

interface CharacterCardProps {
  character: Character;
  role?: string;
  featured?: boolean;
}

export default function CharacterCard({ character, role, featured }: CharacterCardProps) {
  const navigate = useNavigate();
  const motion = getCharacterMotion(character.slug);

  return (
    <button
      onClick={() => navigate(`/character/${character.slug}`)}
      className={`character-card group ${featured ? 'featured' : ''}`}
    >
      <img
        src={character.portrait}
        alt={character.name}
        className={`char-portrait motion-${motion}`}
      />
      <div className="char-name">{character.name}</div>
      {role && <div className="char-role">{role}</div>}
    </button>
  );
}
