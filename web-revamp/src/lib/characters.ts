// Re-export the web-revamp character list from the shared package.
import { getCharacter } from '@casa/characters';

export type { WebCharacter as Character } from '@casa/characters';
export { webCharacters as characters, getCharacter } from '@casa/characters';

// Convenience alias used by CharacterDetail.
export function getCharacterBySlug(slug: string) {
  return getCharacter(slug);
}
