// AUTO-GENERATED from packages/characters — do not edit manually.
// Run `npm run sync:characters` to regenerate.

export interface Character {
  slug: string;
  name: string;
  italianMeaning: string;
  accentColor: string;
  category: 'animal' | 'fantasy' | 'person' | 'object';
  traits: string[];
  portrait: string;
  showcase: string;
  voiceIntro: string;
  idleVideo?: string;
  speakingVideo?: string;
  modes: {
    play: string[];
    learn: string[];
    support: string[];
  };
}


export const DEFAULT_CHARACTER_MODES: Character['modes'] = {
  play: ['Story Time', 'Music & Rhythm', 'Geography', 'STEM Sparks'],
  learn: ['All Languages', 'Homework Helper', 'Coding'],
  support: ['Calm & Breathe', 'Milestones', 'Teaching Mode'],
};

export const characters: Character[] = [
  {
    slug: 'corvo',
    name: 'Corvo',
    italianMeaning: 'Corvo means Crow in Italian',
    accentColor: '#6b7fd7',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/corvo.png',
    showcase: '/characters/corvo.png',
    voiceIntro: '/audio/characters/corvo-intro.mp3',
    idleVideo: '/videos/corvo_idle.mp4',
    speakingVideo: '/videos/corvo_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'gufo',
    name: 'Gufo',
    italianMeaning: 'Gufo means Owl in Italian',
    accentColor: '#c49a6c',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/gufo.png',
    showcase: '/characters/gufo.png',
    voiceIntro: '/audio/characters/gufo-intro.mp3',
    idleVideo: '/videos/gufo_idle.mp4',
    speakingVideo: '/videos/gufo_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'orsetto',
    name: 'Orsetto',
    italianMeaning: 'Orsetto means Little Bear in Italian',
    accentColor: '#d4a843',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/orsetto.png',
    showcase: '/characters/orsetto.png',
    voiceIntro: '/audio/characters/orsetto-intro.mp3',
    idleVideo: '/videos/orsetto_idle.mp4',
    speakingVideo: '/videos/orsetto_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'coniglio',
    name: 'Coniglio',
    italianMeaning: 'Coniglio means Bunny in Italian',
    accentColor: '#f5a0b5',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/coniglio.png',
    showcase: '/characters/coniglio.png',
    voiceIntro: '/audio/characters/coniglio-intro.mp3',
    idleVideo: '/videos/coniglio_idle.mp4',
    speakingVideo: '/videos/coniglio_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'tartaruga',
    name: 'Tartaruga',
    italianMeaning: 'Tartaruga means Sea Turtle in Italian',
    accentColor: '#5cb88a',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/tartaruga.webp',
    showcase: '/characters/tartaruga-showcase.png',
    voiceIntro: '/audio/characters/tartaruga-intro.mp3',
    idleVideo: '/videos/tartaruga_idle.mp4',
    speakingVideo: '/videos/tartaruga_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'elefante',
    name: 'Elefante',
    italianMeaning: 'Elefante means Elephant in Italian',
    accentColor: '#8a9bb5',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/elefante.png',
    showcase: '/characters/elefante.png',
    voiceIntro: '/audio/characters/elefante-intro.mp3',
    idleVideo: '/videos/elefante_idle.mp4',
    speakingVideo: '/videos/elefante_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'leone',
    name: 'Leone',
    italianMeaning: 'Leone means Lion in Italian',
    accentColor: '#e8913a',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/leone.png',
    showcase: '/characters/leone.png',
    voiceIntro: '/audio/characters/leone-intro.mp3',
    idleVideo: '/videos/leone_idle.mp4',
    speakingVideo: '/videos/leone_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'delfino',
    name: 'Delfino',
    italianMeaning: 'Delfino means Dolphin in Italian',
    accentColor: '#7ab8d4',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/delfino.png',
    showcase: '/characters/delfino.png',
    voiceIntro: '/audio/characters/delfino-intro.mp3',
    idleVideo: '/videos/delfino_idle.mp4',
    speakingVideo: '/videos/delfino_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'volpe',
    name: 'Volpe',
    italianMeaning: 'Volpe means Fox in Italian',
    accentColor: '#e07a3e',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/volpe.png',
    showcase: '/characters/volpe.png',
    voiceIntro: '/audio/characters/volpe-intro.mp3',
    idleVideo: '/videos/volpe_idle.mp4',
    speakingVideo: '/videos/volpe_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'drago',
    name: 'Drago',
    italianMeaning: 'Drago means Dragon in Italian',
    accentColor: '#5cdb7c',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/drago.png',
    showcase: '/characters/drago.png',
    voiceIntro: '/audio/characters/drago-intro.mp3',
    idleVideo: '/videos/drago_idle.mp4',
    speakingVideo: '/videos/drago_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'xolo',
    name: 'Xolo',
    italianMeaning: 'Xolo is a Xoloitzcuintli, the ancient Aztec dog',
    accentColor: '#b8926a',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/xolo.png',
    showcase: '/characters/xolo.png',
    voiceIntro: '/audio/characters/xolo-intro.mp3',
    idleVideo: undefined,
    speakingVideo: undefined,
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'scheletro',
    name: 'Scheletro',
    italianMeaning: 'Scheletro means Skeleton in Italian — The Funny Bones',
    accentColor: '#d7d7d7',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/scheletro.png',
    showcase: '/characters/scheletro.png',
    voiceIntro: '/audio/characters/scheletro-intro.mp3',
    idleVideo: '/videos/scheletro_idle.mp4',
    speakingVideo: '/videos/scheletro_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'ragno',
    name: 'Ragno',
    italianMeaning: 'Ragno means Spider in Italian — The Web Artist',
    accentColor: '#8a6fd7',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/ragno.png',
    showcase: '/characters/ragno.png',
    voiceIntro: '/audio/characters/ragno-intro.mp3',
    idleVideo: '/videos/ragno_idle.mp4',
    speakingVideo: '/videos/ragno_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'veloce',
    name: 'Veloce',
    italianMeaning: 'Veloce means Fast in Italian — The Speedy Rabbit',
    accentColor: '#d7933e',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/veloce.png',
    showcase: '/characters/veloce.png',
    voiceIntro: '/audio/characters/veloce-intro.mp3',
    idleVideo: '/videos/veloce_idle.mp4',
    speakingVideo: '/videos/veloce_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'stellino',
    name: 'Stellino',
    italianMeaning: 'Stellino means Little Star in Italian — The Dreamer',
    accentColor: '#d7a3d7',
    category: 'object',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/stellino.png',
    showcase: '/characters/stellino.png',
    voiceIntro: '/audio/characters/stellino-intro.mp3',
    idleVideo: undefined,
    speakingVideo: undefined,
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'sacco',
    name: 'Sacco',
    italianMeaning: 'Sacco means Sack in Italian — The DJ Sack',
    accentColor: '#d7c36f',
    category: 'object',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/sacco.png',
    showcase: '/characters/sacco.png',
    voiceIntro: '/audio/characters/sacco-intro.mp3',
    idleVideo: '/videos/sacco_idle.mp4',
    speakingVideo: '/videos/sacco_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'spugna',
    name: 'Spugna',
    italianMeaning: 'Spugna means Sponge in Italian',
    accentColor: '#d7c36f',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/spugna.png',
    showcase: '/characters/spugna.png',
    voiceIntro: '/audio/characters/spugna-intro.mp3',
    idleVideo: '/videos/spugna_idle.mp4',
    speakingVideo: '/videos/spugna_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'rocco',
    name: 'Rocco',
    italianMeaning: 'Rocco is a Cockroach — Rock Frontman',
    accentColor: '#d74a3e',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/rocco.png',
    showcase: '/characters/rocco.png',
    voiceIntro: '/audio/characters/rocco-intro.mp3',
    idleVideo: '/videos/rocco_idle.mp4',
    speakingVideo: '/videos/rocco_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'vinile',
    name: 'Vinile',
    italianMeaning: 'Vinile means Vinyl in Italian — The Record Collector',
    accentColor: '#7a6fd7',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/vinile.png',
    showcase: '/characters/vinile.png',
    voiceIntro: '/audio/characters/vinile-intro.mp3',
    idleVideo: undefined,
    speakingVideo: undefined,
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'battito',
    name: 'Battito',
    italianMeaning: 'Battito means Heartbeat in Italian',
    accentColor: '#5c7ad7',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/battito.png',
    showcase: '/characters/battito.png',
    voiceIntro: '/audio/characters/battito-intro.mp3',
    idleVideo: '/videos/battito_idle.mp4',
    speakingVideo: '/videos/battito_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'onda',
    name: 'Onda',
    italianMeaning: 'Onda means Wave in Italian — The Surf Punk',
    accentColor: '#3ed7d7',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/onda.png',
    showcase: '/characters/onda.png',
    voiceIntro: '/audio/characters/onda-intro.mp3',
    idleVideo: '/videos/onda_idle.mp4',
    speakingVideo: '/videos/onda_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'maestra',
    name: 'Maestra',
    italianMeaning: 'Maestra means Teacher in Italian',
    accentColor: '#d76f8a',
    category: 'person',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/maestra.png',
    showcase: '/characters/maestra.png',
    voiceIntro: '/audio/characters/maestra-intro.mp3',
    idleVideo: '/videos/maestra_idle.mp4',
    speakingVideo: '/videos/maestra_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'costruttore',
    name: 'Costruttore',
    italianMeaning: 'Costruttore means Builder in Italian',
    accentColor: '#d4a843',
    category: 'person',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/costruttore.png',
    showcase: '/characters/costruttore.png',
    voiceIntro: '/audio/characters/costruttore-intro.mp3',
    idleVideo: '/videos/costruttore_idle.mp4',
    speakingVideo: '/videos/costruttore_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'dottore',
    name: 'Dottore',
    italianMeaning: 'Dottore means Doctor in Italian',
    accentColor: '#7ad75c',
    category: 'person',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/dottore.png',
    showcase: '/characters/dottore.png',
    voiceIntro: '/audio/characters/dottore-intro.mp3',
    idleVideo: '/videos/dottore_idle.mp4',
    speakingVideo: '/videos/dottore_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'pietro',
    name: 'Pietro',
    italianMeaning: 'Pietro is the Founder of Casa Companion — The Leader',
    accentColor: '#6f8ad7',
    category: 'person',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/pietro.png',
    showcase: '/characters/pietro.png',
    voiceIntro: '/audio/characters/pietro-intro.mp3',
    idleVideo: '/videos/pietro_idle.mp4',
    speakingVideo: '/videos/pietro_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'borsa',
    name: 'Borsa',
    italianMeaning: 'Borsa means Purse/Bag in Italian — The Fashionista',
    accentColor: '#6fd7a3',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/borsa.png',
    showcase: '/characters/borsa.png',
    voiceIntro: '/audio/characters/borsa-intro.mp3',
    idleVideo: '/videos/borsa_idle.mp4',
    speakingVideo: '/videos/borsa_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'mamma',
    name: 'Mamma',
    italianMeaning: 'Mamma means Mom in Italian — The Nurturer',
    accentColor: '#d76fd7',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/mamma.png',
    showcase: '/characters/mamma.png',
    voiceIntro: '/audio/characters/mamma-intro.mp3',
    idleVideo: '/videos/mamma_idle.mp4',
    speakingVideo: '/videos/mamma_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'verita',
    name: 'Verita',
    italianMeaning: 'Verita is an Eagle — Truth Eagle',
    accentColor: '#6f8ad7',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/verita.png',
    showcase: '/characters/verita.png',
    voiceIntro: '/audio/characters/verita-intro.mp3',
    idleVideo: '/videos/verita_idle.mp4',
    speakingVideo: '/videos/verita_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'forza',
    name: 'Forza',
    italianMeaning: 'Forza means Strength in Italian',
    accentColor: '#d7933e',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/forza.png',
    showcase: '/characters/forza.png',
    voiceIntro: '/audio/characters/forza-intro.mp3',
    idleVideo: '/videos/forza_idle.mp4',
    speakingVideo: '/videos/forza_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'bella',
    name: 'Bella',
    italianMeaning: 'Bella means Beautiful in Italian',
    accentColor: '#d66fd7',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/bella.png',
    showcase: '/characters/bella.png',
    voiceIntro: '/audio/characters/bella-intro.mp3',
    idleVideo: '/videos/bella_idle.mp4',
    speakingVideo: '/videos/bella_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'cuoco',
    name: 'Cuoco',
    italianMeaning: 'Cuoco is a Rooster — Chef Rooster',
    accentColor: '#d74a3e',
    category: 'person',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/cuoco.png',
    showcase: '/characters/cuoco.png',
    voiceIntro: '/audio/characters/cuoco-intro.mp3',
    idleVideo: '/videos/cuoco_idle.mp4',
    speakingVideo: '/videos/cuoco_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'nonna',
    name: 'Nonna',
    italianMeaning: 'Nonna means Grandmother in Italian',
    accentColor: '#d7a36f',
    category: 'person',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/nonna.png',
    showcase: '/characters/nonna.png',
    voiceIntro: '/audio/characters/nonna-intro.mp3',
    idleVideo: '/videos/nonna_idle.mp4',
    speakingVideo: '/videos/nonna_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'cucita',
    name: 'Cucita',
    italianMeaning: 'Cucita means Sewn/Stitched in Italian',
    accentColor: '#d77f8a',
    category: 'object',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/cucita.png',
    showcase: '/characters/cucita.png',
    voiceIntro: '/audio/characters/cucita-intro.mp3',
    idleVideo: '/videos/cucita_idle.mp4',
    speakingVideo: '/videos/cucita_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'polpo',
    name: 'Polpo',
    italianMeaning: 'Polpo means Octopus in Italian',
    accentColor: '#7a6fd7',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/polpo.png',
    showcase: '/characters/polpo.png',
    voiceIntro: '/audio/characters/polpo-intro.mp3',
    idleVideo: '/videos/polpo_idle.mp4',
    speakingVideo: '/videos/polpo_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'jack',
    name: 'Jack',
    italianMeaning: 'A playful friend',
    accentColor: '#e07a3e',
    category: 'person',
    traits: ['Playful', 'Friendly', 'Energetic', 'Curious'],
    portrait: '/characters/jack.png',
    showcase: '/characters/jack.png',
    voiceIntro: '/audio/characters/jack-intro.mp3',
    idleVideo: '/videos/jack_idle.mp4',
    speakingVideo: '/videos/jack_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'agenda',
    name: 'Agenda the Organizer',
    italianMeaning: 'The cheerful planner',
    accentColor: '#f0a500',
    category: 'object',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/agenda.png',
    showcase: '/characters/agenda.png',
    voiceIntro: '/audio/characters/agenda-intro.mp3',
    idleVideo: '/videos/agenda_idle.mp4',
    speakingVideo: '/videos/agenda_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'alien',
    name: 'Ziggy the Alien',
    italianMeaning: 'The friendly alien explorer',
    accentColor: '#8a2be2',
    category: 'fantasy',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/alien.png',
    showcase: '/characters/alien.png',
    voiceIntro: '/audio/characters/alien-intro.mp3',
    idleVideo: '/videos/alien_idle.mp4',
    speakingVideo: '/videos/alien_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'dragon',
    name: 'Flame the Dragon',
    italianMeaning: 'The kind-hearted dragon',
    accentColor: '#ff4500',
    category: 'fantasy',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/dragon.png',
    showcase: '/characters/dragon.png',
    voiceIntro: '/audio/characters/dragon-intro.mp3',
    idleVideo: '/videos/dragon_idle.mp4',
    speakingVideo: '/videos/dragon_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'fraggl',
    name: 'Wobble the Fraggl',
    italianMeaning: 'The playful creature',
    accentColor: '#ffd700',
    category: 'fantasy',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/fraggl.png',
    showcase: '/characters/fraggl.png',
    voiceIntro: '/audio/characters/fraggl-intro.mp3',
    idleVideo: '/videos/fraggl_idle.mp4',
    speakingVideo: '/videos/fraggl_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'grouch',
    name: 'Grumble the Grouch',
    italianMeaning: 'The lovable grump',
    accentColor: '#708090',
    category: 'fantasy',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/grouch.png',
    showcase: '/characters/grouch.png',
    voiceIntro: '/audio/characters/grouch-intro.mp3',
    idleVideo: '/videos/grouch_idle.mp4',
    speakingVideo: '/videos/grouch_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'lucha_bee',
    name: 'Buzz the Lucha Bee',
    italianMeaning: 'The wrestling bee champion',
    accentColor: '#ff6347',
    category: 'fantasy',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/lucha_bee.png',
    showcase: '/characters/lucha_bee.png',
    voiceIntro: '/audio/characters/lucha_bee-intro.mp3',
    idleVideo: '/videos/lucha_bee_idle.mp4',
    speakingVideo: '/videos/lucha_bee_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'ninja_cat',
    name: 'Stealth the Ninja Cat',
    italianMeaning: 'The agile protector',
    accentColor: '#000000',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/ninja_cat.png',
    showcase: '/characters/ninja_cat.png',
    voiceIntro: '/audio/characters/ninja_cat-intro.mp3',
    idleVideo: '/videos/ninja_cat_idle.mp4',
    speakingVideo: '/videos/ninja_cat_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'papa',
    name: 'Papa the Wise Owl',
    italianMeaning: 'The wise companion',
    accentColor: '#8b4513',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/papa.png',
    showcase: '/characters/papa.png',
    voiceIntro: '/audio/characters/papa-intro.mp3',
    idleVideo: '/videos/papa_idle.mp4',
    speakingVideo: '/videos/papa_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'pirate_parrot',
    name: 'Captain Squawk',
    italianMeaning: 'The adventurous parrot',
    accentColor: '#ff1493',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/pirate_parrot.png',
    showcase: '/characters/pirate_parrot.png',
    voiceIntro: '/audio/characters/pirate_parrot-intro.mp3',
    idleVideo: '/videos/pirate_parrot_idle.mp4',
    speakingVideo: '/videos/pirate_parrot_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'transformer_bot',
    name: 'Spark the Transformer Bot',
    italianMeaning: 'The creative robot',
    accentColor: '#4682b4',
    category: 'object',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/transformer_bot.png',
    showcase: '/characters/transformer_bot.png',
    voiceIntro: '/audio/characters/transformer_bot-intro.mp3',
    idleVideo: '/videos/transformer_bot_idle.mp4',
    speakingVideo: '/videos/transformer_bot_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  },

  {
    slug: 'trex',
    name: 'Tiny the T-Rex',
    italianMeaning: 'The gentle giant',
    accentColor: '#32cd32',
    category: 'animal',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/trex.png',
    showcase: '/characters/trex.png',
    voiceIntro: '/audio/characters/trex-intro.mp3',
    idleVideo: '/videos/trex_idle.mp4',
    speakingVideo: '/videos/trex_speaking.mp4',
    modes: DEFAULT_CHARACTER_MODES,
  }
];

export function getCharacterDescription(character: Character): string {
  return `${character.name} — ${character.italianMeaning}`;
}

export function getCharacterRole(character: Character): string {
  return getCharacterDescription(character).split(' — ')[1]?.trim() || character.italianMeaning;
}

export function getCharacterSubtitle(_character?: Character): string {
  return 'Introduction';
}

export function getCharacterAccentHue(character: Character): number {
  // Derive a hue from the hex accent color. Returns 0 for grayscale/black.
  const hex = character.accentColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  let hue = 0;
  const d = max - min;
  switch (max) {
    case r:
      hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      hue = ((b - r) / d + 2) / 6;
      break;
    case b:
      hue = ((r - g) / d + 4) / 6;
      break;
  }
  return Math.round(hue * 360);
}

export function getCharacterBySlug(slug: string): Character | undefined {
  return characters.find((c) => c.slug === slug);
}

export interface WebCharacter {
  slug: string;
  name: string;
  description: string;
  subtitle: string;
  italianMeaning: string;
  accentColor: string;
  accentHue: number;
  category: 'animal' | 'fantasy' | 'person' | 'object';
  traits: string[];
  portrait: string;
  showcase: string;
  voiceIntro: string;
  videoSrc?: string;
  modes: {
    play: string[];
    learn: string[];
    support: string[];
  };
}

export const webCharacters: WebCharacter[] = characters.map((c) => ({
  ...c,
  description: `${c.name} — ${c.italianMeaning}`,
  subtitle: 'Introduction',
  accentHue: getCharacterAccentHue(c),
  videoSrc: c.idleVideo,
  voiceIntro: c.voiceIntro.replace('/audio/characters/', '/audio/'),
}));

export const characterMap = new Map(webCharacters.map((c) => [c.slug, c]));

export function getCharacter(key?: string): WebCharacter | undefined {
  if (!key) return undefined;
  return characterMap.get(key);
}
