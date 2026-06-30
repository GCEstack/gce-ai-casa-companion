import { characters } from '@casa/characters';

interface CharacterVideoConfig {
  idle: string;
  speaking: string;
}

// Build the video map from the shared character registry so it stays in sync.
const videoMap: Record<string, CharacterVideoConfig> = characters.reduce(
  (acc, c) => {
    if (c.idleVideo && c.speakingVideo) {
      acc[c.slug] = { idle: c.idleVideo, speaking: c.speakingVideo };
    }
    return acc;
  },
  {} as Record<string, CharacterVideoConfig>
);

export function getCharacterVideos(slug: string): { idle: string | null; speaking: string | null } {
  const config = videoMap[slug];
  if (!config) return { idle: null, speaking: null };
  return { idle: config.idle, speaking: config.speaking };
}
