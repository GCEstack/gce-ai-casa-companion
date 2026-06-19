import { useMemo } from 'react';
import { characters } from '@/lib/characters';
import {
  userName,
  isPersonalized,
  enabledCharacterSlugs,
  featuredCharacterSlug,
} from '@/lib/personalization';
import type { Character } from '@/types';

// Per-site character sets. If no build-time personalization is configured, the
// landing page shows only the characters associated with the current hostname.
const HOST_CHARACTER_SETS: Record<string, string[]> = {
  'casa-web-mobile-liam.netlify.app': ['jack', 'tartaruga', 'veloce', 'corvo'],
  'casa-jack.netlify.app': ['jack', 'tartaruga', 'veloce', 'corvo'],
  'casa-mobile-liam.vercel.app': ['jack', 'tartaruga', 'veloce', 'corvo'],
  'casa-web-mobile-liam.fly.dev': ['jack', 'tartaruga', 'veloce', 'corvo'],
  'casa-web-mobile-jenny.netlify.app': ['agenda'],
  'casa-jenny.netlify.app': ['agenda'],
  'casa-mobile-jenny.vercel.app': ['agenda'],
  'casa-web-mobile-jenny.fly.dev': ['agenda'],
  'casa-web-mobile-jimmy.netlify.app': ['papa', 'gufo', 'fraggl', 'stellino', 'rocco', 'onda'],
  'casa-jimmy.netlify.app': ['papa', 'gufo', 'fraggl', 'stellino', 'rocco', 'onda'],
  'casa-mobile-jimmy.vercel.app': ['papa', 'gufo', 'fraggl', 'stellino', 'rocco', 'onda'],
  'casa-web-mobile-jimmy.fly.dev': ['papa', 'gufo', 'fraggl', 'stellino', 'rocco', 'onda'],
  'casa-web-mobile-peter.netlify.app': ['pietro', 'jack', 'corvo'],
  'casa-mobile-peter.vercel.app': ['pietro', 'jack', 'corvo'],
  'casa-web-mobile-peter.fly.dev': ['pietro', 'jack', 'corvo'],
};

function getHostFilteredCharacters(all: Character[]): Character[] {
  const slugs = HOST_CHARACTER_SETS[window.location.hostname];
  if (!slugs || slugs.length === 0) return all;
  const map = new Map(all.map((c) => [c.slug, c]));
  return slugs.map((slug) => map.get(slug)).filter(Boolean) as Character[];
}

function getEnvFilteredCharacters(all: Character[]): Character[] {
  if (!enabledCharacterSlugs) return all;
  const map = new Map(all.map((c) => [c.slug.toLowerCase(), c]));
  return enabledCharacterSlugs
    .map((slug) => map.get(slug))
    .filter((c): c is Character => Boolean(c));
}

function getFeaturedCharacter(all: Character[]): Character | undefined {
  if (!featuredCharacterSlug) return undefined;
  return all.find((c) => c.slug.toLowerCase() === featuredCharacterSlug);
}

interface UseAvailableCharactersResult {
  characters: Character[];
  featured: Character | undefined;
  userName: string | undefined;
  isPersonalized: boolean;
  isEnabled: (slug: string) => boolean;
}

export function useAvailableCharacters(): UseAvailableCharactersResult {
  return useMemo(() => {
    // Build-time env vars take precedence over hostname filtering.
    const base = enabledCharacterSlugs ? characters : getHostFilteredCharacters(characters);
    const available = getEnvFilteredCharacters(base);
    const featured = getFeaturedCharacter(characters);
    const enabledSlugs = new Set(available.map((c) => c.slug.toLowerCase()));

    return {
      characters: available,
      featured,
      userName,
      isPersonalized,
      isEnabled: (slug: string) => enabledSlugs.has(slug.toLowerCase()),
    };
  }, []);
}
