export type CharState = 'idle' | 'speaking';

export function getVideo(slug: string, state: CharState): string {
  return `/videos/${slug}_${state}.mp4`;
}
