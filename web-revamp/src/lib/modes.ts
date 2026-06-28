// Re-export UI mode registry from the shared character package.
import {
  modeConfigs,
  getModeConfig,
  type ModeConfig,
} from '@casa/characters';
import type { CharacterFeature } from '@/types';

export const allModes: ModeConfig[] = modeConfigs;
export const introductionMode: ModeConfig = modeConfigs[0];
export const playModes = modeConfigs.filter((m) => m.category === 'play');
export const learnModes = modeConfigs.filter((m) => m.category === 'learn');
export const supportModes = modeConfigs.filter((m) => m.category === 'support');

export function getModeBySlug(slug: string): ModeConfig {
  return getModeConfig(slug) ?? introductionMode;
}

export function findModeBySlug(slug: string): ModeConfig | undefined {
  return getModeConfig(slug);
}

export function modeFromFeature(
  feature: CharacterFeature,
  accentColor: string
): ModeConfig {
  const slug = feature.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return {
    slug,
    label: feature.name,
    icon: 'Sparkles',
    category: 'feature',
    accentColor,
    accentMuted: `${accentColor}26`,
    dotColor: accentColor,
    description: feature.description,
    prompt: feature.behavior,
  };
}
