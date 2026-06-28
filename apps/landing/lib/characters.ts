import { characterConfigs, type CharacterConfig } from "@casa/characters";

export interface Character {
  key: string;
  name: string;
  meaning: string;
  voice: string;
  realtimeVoice: string;
  prompt: string;
  image: string;
}

const landingSlugs = new Set([
  "corvo",
  "gufo",
  "orsetto",
  "coniglio",
  "tartaruga",
  "elefante",
  "leone",
  "delfino",
  "drago",
  "xolo",
  "scheletro",
  "ragno",
  "veloce",
  "stellino",
  "sacco",
  "spugna",
  "rocco",
  "vinile",
  "battito",
  "onda",
  "maestra",
  "costruttore",
  "dottore",
  "pietro",
  "borsa",
  "mamma",
  "verita",
  "forza",
  "bella",
  "cuoco",
  "nonna",
  "cucita",
  "polpo",
]);

// Landing uses its own hero webp assets and a few custom meaning strings.
const landingMeanings: Record<string, string> = {
  vinile: "Vinile is a Panther — House DJ",
  battito: "Battito is a Hawk — Techno Hawk",
  onda: "Onda is a Lion — Sunrise DJ",
  maestra: "Maestra is a Fox — Teacher Fox",
  costruttore: "Costruttore is a Bear — Builder Bear",
  dottore: "Dottore is a Panda — Doctor Panda",
  pietro: "Pietro is the Founder of Casa Companion",
  borsa: "Borsa is a Chameleon — Market Chameleon",
  mamma: "Mamma is a Swan",
  forza: "Forza is a Cat — Fitness Cat",
  bella: "Bella is a Peacock — Beauty Peacock",
  nonna: "Nonna is a Hedgehog — Grandmother Hedgehog",
  cucita: "Cucita is a Ragdoll — The Stitched Heart",
};

const imageBySlug: Record<string, string> = {
  corvo: "/heroes/crow.webp",
  gufo: "/heroes/owl.webp",
  orsetto: "/heroes/bear.webp",
  coniglio: "/heroes/bunny.webp",
  tartaruga: "/heroes/turtle.webp",
  elefante: "/heroes/elephant.webp",
  leone: "/heroes/lion.webp",
  delfino: "/heroes/dolphin.webp",
  drago: "/heroes/dragon.webp",
  xolo: "/heroes/xolo.webp",
  scheletro: "/heroes/scheletro.webp",
  ragno: "/heroes/ragno.webp",
  veloce: "/heroes/veloce.webp",
  stellino: "/heroes/stellino.webp",
  sacco: "/heroes/sacco.webp",
  spugna: "/heroes/spugna.webp",
  rocco: "/heroes/rocco.webp",
  vinile: "/heroes/vinile.webp",
  battito: "/heroes/battito.webp",
  onda: "/heroes/onda.webp",
  maestra: "/heroes/fox.webp",
  costruttore: "/heroes/costruttore.webp",
  dottore: "/heroes/dottore.webp",
  pietro: "/heroes/pietro.webp",
  borsa: "/heroes/borsa.webp",
  mamma: "/heroes/mamma.webp",
  verita: "/heroes/verita.webp",
  forza: "/heroes/forza.webp",
  bella: "/heroes/bella.webp",
  cuoco: "/heroes/cuoco.webp",
  nonna: "/heroes/nonna.webp",
  cucita: "/heroes/cucita.webp",
  polpo: "/heroes/octopus.webp",
};

function toLandingCharacter(config: CharacterConfig): Character {
  return {
    key: config.slug,
    name: config.name,
    meaning: landingMeanings[config.slug] ?? config.meaning,
    voice: config.realtimeVoice ?? config.voice,
    realtimeVoice: config.realtimeVoice ?? config.voice,
    prompt: config.prompt,
    image: imageBySlug[config.slug] ?? `/heroes/${config.slug}.webp`,
  };
}

export const characters: Character[] = Object.values(characterConfigs)
  .filter((c) => landingSlugs.has(c.slug))
  .map(toLandingCharacter);

export const characterMap = new Map(characters.map((c) => [c.key, c]));

export function getCharacter(key?: string): Character | undefined {
  if (!key) return undefined;
  return characterMap.get(key);
}
