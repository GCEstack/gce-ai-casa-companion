import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart } from 'lucide-react';
import CharacterCard from '@/components/CharacterCard';
import BottomNav from '@/components/BottomNav';
import { useAvailableCharacters } from '@/hooks/useAvailableCharacters';
import { useFavorites } from '@/lib/settings';
import { getCharacterRole } from '@/lib/characters';

export default function Favorites() {
  const navigate = useNavigate();
  const [favorites] = useFavorites();
  const { characters: availableCharacters } = useAvailableCharacters();
  const favoriteCharacters = availableCharacters.filter((c) => favorites.includes(c.slug));

  return (
    <div className="min-h-full flex flex-col px-4 pt-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/')} className="p-2 -ml-2 text-gray-300">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-xl font-bold text-white">Favorites</h1>
      </div>

      <div className="flex-1">
        {favoriteCharacters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
            <Heart className="w-12 h-12 text-gray-600" />
            <p className="text-gray-400 text-sm">No favorites yet.</p>
            <p className="text-gray-500 text-xs">Tap the heart on a character to add them here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {favoriteCharacters.map((character) => (
              <CharacterCard key={character.slug} character={character} role={getCharacterRole(character)} />
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
