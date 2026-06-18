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
    instruction:
      'Introduce yourself warmly. Keep it short and friendly, and invite the child to ask you anything.',
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
    instruction:
      'Tell an imaginative, age-appropriate story. Make the child the hero when possible. Keep it short and engaging.',
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
    instruction:
      'Encourage music, singing, clapping, or movement. Share simple songs, rhythms, or fun sound games.',
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
    instruction:
      'Teach a fun geography fact about a place. Keep it simple, visual, and ask curious follow-up questions.',
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
    instruction:
      'Explain a fun science, tech, engineering, or math concept in a simple, hands-on way. Use examples.',
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
    instruction:
      'Teach a useful word or phrase in another language. Pronounce it clearly and make it playful.',
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
    instruction:
      'Help with the school question step by step. Do not give the answer outright; guide the child to learn.',
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
    instruction:
      'Explain a coding concept with a simple analogy or mini-challenge. Keep it age-appropriate.',
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
    instruction:
      'Guide a short calming or breathing exercise. Speak slowly and softly. Help the child feel safe.',
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
    instruction:
      'Celebrate something the child has learned or accomplished. Encourage them to set a small goal.',
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
    instruction:
      'Act as a gentle tutor following a parent-guided topic. Ask what they want to learn today.',
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
    instruction: feature.behavior,
  };
}
