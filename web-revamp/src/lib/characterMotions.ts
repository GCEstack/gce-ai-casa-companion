/**
 * Per-character CSS motion/reaction class.
 *
 * These are CSS-only animations applied to character portraits in the grid.
 * They do not replace real video assets, but give each character a unique
 * "alive" feel on hover.
 */

export type MotionName =
  | 'roar'
  | 'jump'
  | 'float'
  | 'shake'
  | 'wiggle'
  | 'bounce'
  | 'spin'
  | 'pulse';

const motionMap: Record<string, MotionName> = {
  // Big / fierce characters — roar
  leone: 'roar',
  drago: 'roar',
  trex: 'roar',
  forza: 'roar',
  grouch: 'roar',
  lucha_bee: 'roar',
  pirate_parrot: 'roar',
  transformer_bot: 'roar',

  // Quick / bouncy characters — jump
  coniglio: 'jump',
  veloce: 'jump',
  ninja_cat: 'jump',
  volpe: 'jump',
  xolo: 'jump',
  alien: 'jump',
  fraggl: 'jump',

  // Air / water / dreamy characters — float
  delfino: 'float',
  polpo: 'float',
  onda: 'float',
  stellino: 'float',
  tartaruga: 'float',

  // Birds / insects / teachers — shake (head-bob / flutter)
  corvo: 'shake',
  gufo: 'shake',
  papa: 'shake',
  scheletro: 'shake',
  ragno: 'shake',
  maestra: 'shake',

  // Warm / cuddly characters — wiggle
  orsetto: 'wiggle',
  mamma: 'wiggle',
  nonna: 'wiggle',
  cucita: 'wiggle',
  borsa: 'wiggle',
  sacco: 'wiggle',
  spugna: 'wiggle',

  // Heavy / energetic characters — bounce
  elefante: 'bounce',
  rocco: 'bounce',
  battito: 'bounce',
  cuoco: 'bounce',
  dottore: 'bounce',
  jack: 'bounce',
  pietro: 'bounce',

  // Round / rotating characters — spin
  vinile: 'spin',
  dragon: 'spin',
  agenda: 'spin',

  // Calm / glowing characters — pulse
  bella: 'pulse',
  verita: 'pulse',
};

export function getCharacterMotion(slug: string): MotionName {
  return motionMap[slug] ?? 'pulse';
}
