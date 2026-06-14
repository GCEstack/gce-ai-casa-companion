import type { CharacterFeature, ModeConfig } from '@/types';

export const allModes: ModeConfig[] = [
  {
    slug: 'introduction',
    label: 'Introduction',
    icon: 'Hand',
    category: 'introduction',
    accentColor: '#d4a843',
    accentMuted: 'rgba(212,168,67,0.15)',
    dotColor: '#d4a843',
    description: 'Meet your companion and hear their voice',
  },
  {
    slug: 'story-time',
    label: 'Story Time',
    icon: 'BookOpen',
    category: 'play',
    accentColor: '#f97316',
    accentMuted: 'rgba(249,115,22,0.15)',
    dotColor: '#f97316',
    description: 'Listen to magical stories and adventures',
  },
  {
    slug: 'music-rhythm',
    label: 'Music & Rhythm',
    icon: 'Music',
    category: 'play',
    accentColor: '#f97316',
    accentMuted: 'rgba(249,115,22,0.15)',
    dotColor: '#f97316',
    description: 'Sing, dance, and explore musical worlds',
  },
  {
    slug: 'geography',
    label: 'Geography',
    icon: 'Globe',
    category: 'play',
    accentColor: '#f97316',
    accentMuted: 'rgba(249,115,22,0.15)',
    dotColor: '#f97316',
    description: 'Travel the world with your companion',
  },
  {
    slug: 'stem-sparks',
    label: 'STEM Sparks',
    icon: 'FlaskConical',
    category: 'play',
    accentColor: '#f97316',
    accentMuted: 'rgba(249,115,22,0.15)',
    dotColor: '#f97316',
    description: 'Explore science, tech, engineering, and math',
  },
  {
    slug: 'all-languages',
    label: 'All Languages',
    icon: 'Languages',
    category: 'learn',
    accentColor: '#eab308',
    accentMuted: 'rgba(234,179,8,0.15)',
    dotColor: '#eab308',
    description: 'Learn words and phrases in any language',
  },
  {
    slug: 'homework-helper',
    label: 'Homework Helper',
    icon: 'Pencil',
    category: 'learn',
    accentColor: '#eab308',
    accentMuted: 'rgba(234,179,8,0.15)',
    dotColor: '#eab308',
    description: 'Get help with school assignments',
  },
  {
    slug: 'coding',
    label: 'Coding',
    icon: 'Code',
    category: 'learn',
    accentColor: '#eab308',
    accentMuted: 'rgba(234,179,8,0.15)',
    dotColor: '#eab308',
    description: 'Learn programming fundamentals',
  },
  {
    slug: 'calm-breathe',
    label: 'Calm & Breathe',
    icon: 'Wind',
    category: 'support',
    accentColor: '#ec4899',
    accentMuted: 'rgba(236,72,153,0.15)',
    dotColor: '#ec4899',
    description: 'Guided breathing and relaxation',
  },
  {
    slug: 'milestones',
    label: 'Milestones',
    icon: 'Trophy',
    category: 'support',
    accentColor: '#ec4899',
    accentMuted: 'rgba(236,72,153,0.15)',
    dotColor: '#ec4899',
    description: 'Track your learning achievements',
  },
  {
    slug: 'teaching-mode',
    label: 'Teaching Mode',
    icon: 'GraduationCap',
    category: 'support',
    accentColor: '#ec4899',
    accentMuted: 'rgba(236,72,153,0.15)',
    dotColor: '#ec4899',
    description: 'Parent-guided lesson controls',
  },
];

export const introductionMode: ModeConfig = allModes[0];

export const playModes = allModes.filter((m) => m.category === 'play');
export const learnModes = allModes.filter((m) => m.category === 'learn');
export const supportModes = allModes.filter((m) => m.category === 'support');

export function getModeBySlug(slug: string): ModeConfig {
  return allModes.find((m) => m.slug === slug) || introductionMode;
}

export function findModeBySlug(slug: string): ModeConfig | undefined {
  return allModes.find((m) => m.slug === slug);
}

export function modeFromFeature(feature: CharacterFeature, accentColor: string): ModeConfig {
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
  };
}
