import type { Character } from '@/types';

const stripBom = (s: string | undefined): string | undefined => s?.replace(/^\uFEFF/, '');

const rawUserName = stripBom((import.meta as Record<string, any>).env.VITE_USER_NAME as string | undefined);
const rawEnabled = (import.meta as Record<string, any>).env.VITE_ENABLED_CHARACTERS as string | undefined;
const rawFeatured = stripBom((import.meta as Record<string, any>).env.VITE_FEATURED_CHARACTER as string | undefined);

export const userName = rawUserName ? rawUserName.trim() : undefined;

export const enabledCharacterSlugs = rawEnabled
  ? rawEnabled
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  : undefined;

export const featuredCharacterSlug =
  rawFeatured?.trim().toLowerCase() || enabledCharacterSlugs?.[0];

export const isPersonalized = Boolean(userName && enabledCharacterSlugs);

export function isCharacterEnabled(slug: string): boolean {
  if (!enabledCharacterSlugs) return true;
  return enabledCharacterSlugs.includes(slug.toLowerCase());
}

export function getLandingCharacters(all: Character[]): Character[] {
  if (!enabledCharacterSlugs) return all;
  const map = new Map(all.map((c) => [c.slug.toLowerCase(), c]));
  return enabledCharacterSlugs
    .map((slug) => map.get(slug))
    .filter((c): c is Character => Boolean(c));
}

export function getFeaturedCharacter(all: Character[]): Character | undefined {
  if (!featuredCharacterSlug) return undefined;
  return all.find((c) => c.slug.toLowerCase() === featuredCharacterSlug);
}
