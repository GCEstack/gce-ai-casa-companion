import characterPrompts from '../characters.json';

/**
 * Shared character definitions used by Casa Companion apps.
 *
 * This package centralises prompt configs and browser speech-synthesis voice
 * settings so they don't drift between `apps/mobile` and `web-revamp`.
 */

export * from './characters';

export interface CharacterFeature {
  name: string;
  description: string;
  triggers: string[];
  slashCommands: string[];
  behavior: string;
}

export interface CharacterConfig {
  name: string;
  slug: string;
  meaning: string;
  voice: 'alloy' | 'ash' | 'coral' | 'echo' | 'fable' | 'nova' | 'onyx' | 'sage' | 'shimmer';
  prompt: string;
  features: CharacterFeature[];
}

export const characterConfigs: Record<string, CharacterConfig> = {
  corvo: {
    name: "Corvo",
    slug: "corvo",
    meaning: "Corvo means Crow in Italian",
    voice: "onyx",
    prompt: characterPrompts.corvo,
    features: [],
  },
  gufo: {
    name: "Gufo",
    slug: "gufo",
    meaning: "Gufo means Owl in Italian",
    voice: "echo",
    prompt: characterPrompts.gufo,
    features: [],
  },
  orsetto: {
    name: "Orsetto",
    slug: "orsetto",
    meaning: "Orsetto means Little Bear in Italian",
    voice: "coral",
    prompt: characterPrompts.orsetto,
    features: [],
  },
  coniglio: {
    name: "Coniglio",
    slug: "coniglio",
    meaning: "Coniglio means Bunny in Italian",
    voice: "sage",
    prompt: characterPrompts.coniglio,
    features: [],
  },
  tartaruga: {
    name: "Tartaruga",
    slug: "tartaruga",
    meaning: "Tartaruga means Sea Turtle in Italian",
    voice: "alloy",
    prompt: characterPrompts.tartaruga,
    features: [],
  },
  elefante: {
    name: "Elefante",
    slug: "elefante",
    meaning: "Elefante means Elephant in Italian",
    voice: "nova",
    prompt: characterPrompts.elefante,
    features: [],
  },
  leone: {
    name: "Leone",
    slug: "leone",
    meaning: "Leone means Lion in Italian",
    voice: "shimmer",
    prompt: characterPrompts.leone,
    features: [],
  },
  delfino: {
    name: "Delfino",
    slug: "delfino",
    meaning: "Delfino means Dolphin in Italian",
    voice: "coral",
    prompt: characterPrompts.delfino,
    features: [],
  },
  volpe: {
    name: "Volpe",
    slug: "volpe",
    meaning: "Volpe means Fox in Italian",
    voice: "coral",
    prompt: characterPrompts.volpe,
    features: [],
  },
  drago: {
    name: "Drago",
    slug: "drago",
    meaning: "Drago means Dragon in Italian",
    voice: "fable",
    prompt: characterPrompts.drago,
    features: [],
  },
  xolo: {
    name: "Xolo",
    slug: "xolo",
    meaning: "Xolo is a Xoloitzcuintli, the ancient Aztec dog",
    voice: "alloy",
    prompt: characterPrompts.xolo,
    features: [],
  },
  scheletro: {
    name: "Scheletro",
    slug: "scheletro",
    meaning: "Scheletro means Skeleton in Italian — The Funny Bones",
    voice: "fable",
    prompt: characterPrompts.scheletro,
    features: [
      {
        name: "Pun Factory",
        description: "Bone puns, anatomy education, dance moves.",
        triggers: ["tell me a joke", "bone pun", "teach me anatomy"],
        slashCommands: ["/pun", "/bones", "/dance"],
        behavior: "You become a hilarious dancing skeleton. Crack bone puns, teach anatomy facts, and suggest silly dance moves. Keep it educational and never scary.",
      },
    ],
  },
  ragno: {
    name: "Ragno",
    slug: "ragno",
    meaning: "Ragno means Spider in Italian — The Web Artist",
    voice: "echo",
    prompt: characterPrompts.ragno,
    features: [
      {
        name: "Creative Studio",
        description: "Drawing prompts, UI/UX feedback, web dev help.",
        triggers: ["drawing prompt", "design feedback", "help me code"],
        slashCommands: ["/draw", "/design", "/code"],
        behavior: "You become an artistic tech-savvy spider. Give drawing prompts, UI/UX feedback, and web dev help. Be creative, patient, and detail-oriented.",
      },
    ],
  },
  veloce: {
    name: "Veloce",
    slug: "veloce",
    meaning: "Veloce means Fast in Italian — The Speedy Rabbit",
    voice: "shimmer",
    prompt: characterPrompts.veloce,
    features: [
      {
        name: "Performance Mode",
        description: "Productivity, HIIT, time management, focus.",
        triggers: ["productivity", "study schedule", "sprint workout"],
        slashCommands: ["/pomodoro", "/schedule", "/sprint"],
        behavior: "You become a high-energy performance coach. Help with productivity systems, HIIT workouts, time management, and focus sprints. Keep it fast and motivating.",
      },
    ],
  },
  stellino: {
    name: "Stellino",
    slug: "stellino",
    meaning: "Stellino means Little Star in Italian — The Dreamer",
    voice: "ash",
    prompt: characterPrompts.stellino,
    features: [
      {
        name: "Dreamscape",
        description: "Journaling, goals, astrology for fun, reflection.",
        triggers: ["journal prompt", "set a goal", "astrology"],
        slashCommands: ["/journal", "/goal", "/astro"],
        behavior: "You become a dreamy wise star. Offer journaling prompts, goal-setting help, playful astrology, and reflective conversation. Be gentle and inspiring.",
      },
    ],
  },
  sacco: {
    name: "Sacco",
    slug: "sacco",
    meaning: "Sacco means Sack in Italian — The DJ Sack",
    voice: "nova",
    prompt: characterPrompts.sacco,
    features: [
      {
        name: "Beat Lab",
        description: "Music production, chord progressions, beat patterns, song recommendations.",
        triggers: ["make a beat", "what chords", "recommend music"],
        slashCommands: ["/beatlab", "/chords", "/playlist"],
        behavior: "You shift into cool producer mode. Help with music production, chord progressions, beat patterns, and song recommendations. Use producer slang and keep the energy groovy.",
      },
    ],
  },
  spugna: {
    name: "Spugna",
    slug: "spugna",
    meaning: "Spugna means Sponge in Italian",
    voice: "sage",
    prompt: characterPrompts.spugna,
    features: [
      {
        name: "Study Mode",
        description: "Feynman technique, analogies, quizzes, mnemonics.",
        triggers: ["help me study", "explain like", "quiz me"],
        slashCommands: ["/study", "/analogy", "/quiz"],
        behavior: "You become a smart tutor. Use the Feynman technique, create analogies, give mini quizzes, and teach mnemonics. Make learning feel light and fun.",
      },
    ],
  },
  rocco: {
    name: "Rocco",
    slug: "rocco",
    meaning: "Rocco is a Cockroach — Rock Frontman",
    voice: "onyx",
    prompt: characterPrompts.rocco,
    features: [
      {
        name: "Songwriter's Den",
        description: "Co-write lyrics, rhyme suggestions, song structure.",
        triggers: ["write lyrics", "what rhymes", "song structure"],
        slashCommands: ["/lyrics", "/rhyme", "/structure"],
        behavior: "You become a punk rock collaborator. Co-write lyrics, suggest rhymes, and explain song structure. Keep it raw, encouraging, and high-energy.",
      },
    ],
  },
  vinile: {
    name: "Vinile",
    slug: "vinile",
    meaning: "Vinile means Vinyl in Italian — The Record Collector",
    voice: "fable",
    prompt: characterPrompts.vinile,
    features: [
      {
        name: "Crate Digger",
        description: "Music discovery, deep cuts, music history, listening journeys.",
        triggers: ["find music like", "deep cuts", "music history"],
        slashCommands: ["/crate", "/deepcut", "/journey"],
        behavior: "You become a crate-digging record store cat. Recommend music, share deep cuts, explain music history, and craft listening journeys. Stay cool and musical.",
      },
    ],
  },
  battito: {
    name: "Battito",
    slug: "battito",
    meaning: "Battito means Heartbeat in Italian",
    voice: "shimmer",
    prompt: characterPrompts.battito,
    features: [
      {
        name: "Check-In",
        description: "Emotional support, CBT techniques, venting space, grounding.",
        triggers: ["I need to vent", "check in", "help me calm down"],
        slashCommands: ["/checkin", "/vent", "/breathe"],
        behavior: "You become a warm emotionally intelligent friend. Offer CBT-style support, a venting space, and grounding exercises. Be gentle, validating, and never judgmental.",
      },
    ],
  },
  onda: {
    name: "Onda",
    slug: "onda",
    meaning: "Onda means Wave in Italian — The Surf Punk",
    voice: "coral",
    prompt: characterPrompts.onda,
    features: [
      {
        name: "Trip Planner",
        description: "Travel ideas, surf spots, hiking, budget travel.",
        triggers: ["plan a trip", "weekend getaway", "surf spots"],
        slashCommands: ["/trip", "/weekend", "/pack"],
        behavior: "You become a chill adventurous surfer. Suggest trips, surf spots, hikes, and budget travel ideas. Use surfer vibes and keep it adventurous.",
      },
    ],
  },
  maestra: {
    name: "Maestra",
    slug: "maestra",
    meaning: "Maestra means Teacher in Italian",
    voice: "echo",
    prompt: characterPrompts.maestra,
    features: [
      {
        name: "Tutor Mode",
        description: "All subjects, step-by-step, essay feedback.",
        triggers: ["help with math", "explain", "check my essay"],
        slashCommands: ["/tutor", "/solve", "/essay"],
        behavior: "You become a patient brilliant teacher. Give step-by-step help across subjects and constructive essay feedback. Celebrate curiosity and effort.",
      },
    ],
  },
  costruttore: {
    name: "Costruttore",
    slug: "costruttore",
    meaning: "Costruttore means Builder in Italian",
    voice: "alloy",
    prompt: characterPrompts.costruttore,
    features: [
      {
        name: "Project Lab",
        description: "Project management, coding architecture, startup MVP, DIY.",
        triggers: ["help me plan", "how do I build", "startup idea"],
        slashCommands: ["/project", "/build", "/mvp"],
        behavior: "You become a practical builder. Help plan projects, design coding architecture, shape startup MVPs, and guide DIY builds. Be structured and encouraging.",
      },
    ],
  },
  dottore: {
    name: "Dottore",
    slug: "dottore",
    meaning: "Dottore means Doctor in Italian",
    voice: "ash",
    prompt: characterPrompts.dottore,
    features: [
      {
        name: "Wellness Coach",
        description: "Workouts, nutrition, sleep, habits.",
        triggers: ["workout plan", "meal ideas", "sleep tips"],
        slashCommands: ["/workout", "/meal", "/sleep"],
        behavior: "You become a knowledgeable wellness friend. Offer workout ideas, meal suggestions, sleep tips, and habit-building advice. Be supportive, not preachy.",
      },
    ],
  },
  pietro: {
    name: "Pietro",
    slug: "pietro",
    meaning: "Pietro is the Founder of Casa Companion — The Leader",
    voice: "alloy",
    prompt: characterPrompts.pietro,
    features: [
      {
        name: "Founder's Desk",
        description: "Startup advice, pitch decks, innovation.",
        triggers: ["startup idea", "business model", "pitch deck"],
        slashCommands: ["/pitch", "/model", "/innovate"],
        behavior: "You become a visionary founder at your desk. Give startup advice, pitch deck feedback, business model help, and innovation prompts. Be passionate and practical.",
      },
    ],
  },
  borsa: {
    name: "Borsa",
    slug: "borsa",
    meaning: "Borsa means Purse/Bag in Italian — The Fashionista",
    voice: "nova",
    prompt: characterPrompts.borsa,
    features: [
      {
        name: "Style Studio",
        description: "Outfits, aesthetics, color theory, confidence.",
        triggers: ["what should I wear", "help my style", "outfit for"],
        slashCommands: ["/outfit", "/style", "/palette"],
        behavior: "You become a fabulous supportive stylist. Suggest outfits, explain aesthetics and color theory, and boost confidence. Be kind, fun, and fashion-forward.",
      },
    ],
  },
  mamma: {
    name: "Mamma",
    slug: "mamma",
    meaning: "Mamma means Mom in Italian — The Nurturer",
    voice: "sage",
    prompt: characterPrompts.mamma,
    features: [
      {
        name: "Casa Kitchen",
        description: "Italian recipes, cooking techniques, life wisdom.",
        triggers: ["recipe for", "how do I make pasta", "life advice"],
        slashCommands: ["/recipe", "/technique", "/saggio"],
        behavior: "You become a warm Italian mom in the kitchen. Share Italian recipes, cooking techniques, and gentle life wisdom. Use Italian endearments and comforting tones.",
      },
    ],
  },
  verita: {
    name: "Verita",
    slug: "verita",
    meaning: "Verita is an Eagle — Truth Eagle",
    voice: "onyx",
    prompt: characterPrompts.verita,
    features: [
      {
        name: "Debate Arena",
        description: "Structured debate, devil's advocate, philosophy.",
        triggers: ["debate me", "devil's advocate", "counterargument"],
        slashCommands: ["/debate", "/devil", "/fallacy"],
        behavior: "You become a noble truth-seeking eagle in debate mode. Offer structured debate, play devil's advocate, and point out logical fallacies with respect and clarity.",
      },
    ],
  },
  forza: {
    name: "Forza",
    slug: "forza",
    meaning: "Forza means Strength in Italian",
    voice: "coral",
    prompt: characterPrompts.forza,
    features: [],
  },
  bella: {
    name: "Bella",
    slug: "bella",
    meaning: "Bella means Beautiful in Italian",
    voice: "shimmer",
    prompt: characterPrompts.bella,
    features: [],
  },
  cuoco: {
    name: "Cuoco",
    slug: "cuoco",
    meaning: "Cuoco is a Rooster — Chef Rooster",
    voice: "coral",
    prompt: characterPrompts.cuoco,
    features: [
      {
        name: "Kitchen Lab",
        description: "Recipe development, flavor pairing, food science.",
        triggers: ["recipe development", "flavor pairing", "food science"],
        slashCommands: ["/develop", "/pair", "/science"],
        behavior: "You become a passionate chef scientist. Help develop recipes, pair flavors, and explain food science. Keep it enthusiastic and culinary.",
      },
    ],
  },
  nonna: {
    name: "Nonna",
    slug: "nonna",
    meaning: "Nonna means Grandmother in Italian",
    voice: "sage",
    prompt: characterPrompts.nonna,
    features: [],
  },
  cucita: {
    name: "Cucita",
    slug: "cucita",
    meaning: "Cucita means Sewn/Stitched in Italian",
    voice: "coral",
    prompt: characterPrompts.cucita,
    features: [],
  },
  polpo: {
    name: "Polpo",
    slug: "polpo",
    meaning: "Polpo means Octopus in Italian",
    voice: "coral",
    prompt: characterPrompts.polpo,
    features: [],
  },
  jack: {
    name: "Jack",
    slug: "jack",
    meaning: "A playful friend",
    voice: "fable",
    prompt: characterPrompts.jack,
    features: [],
  },
  agenda: {
    name: "Agenda the Organizer",
    slug: "agenda",
    meaning: "The cheerful planner",
    voice: "sage",
    prompt: characterPrompts.agenda,
    features: [],
  },
  alien: {
    name: "Ziggy the Alien",
    slug: "alien",
    meaning: "The friendly alien explorer",
    voice: "nova",
    prompt: characterPrompts.alien,
    features: [],
  },
  dragon: {
    name: "Flame the Dragon",
    slug: "dragon",
    meaning: "The kind-hearted dragon",
    voice: "shimmer",
    prompt: characterPrompts.dragon,
    features: [],
  },
  fraggl: {
    name: "Wobble the Fraggl",
    slug: "fraggl",
    meaning: "The playful creature",
    voice: "echo",
    prompt: characterPrompts.fraggl,
    features: [],
  },
  grouch: {
    name: "Grumble the Grouch",
    slug: "grouch",
    meaning: "The lovable grump",
    voice: "onyx",
    prompt: characterPrompts.grouch,
    features: [],
  },
  lucha_bee: {
    name: "Buzz the Lucha Bee",
    slug: "lucha_bee",
    meaning: "The wrestling bee champion",
    voice: "fable",
    prompt: characterPrompts.lucha_bee,
    features: [],
  },
  ninja_cat: {
    name: "Stealth the Ninja Cat",
    slug: "ninja_cat",
    meaning: "The agile protector",
    voice: "ash",
    prompt: characterPrompts.ninja_cat,
    features: [],
  },
  papa: {
    name: "Papa the Wise Owl",
    slug: "papa",
    meaning: "The wise companion",
    voice: "coral",
    prompt: characterPrompts.papa,
    features: [],
  },
  pirate_parrot: {
    name: "Captain Squawk",
    slug: "pirate_parrot",
    meaning: "The adventurous parrot",
    voice: "echo",
    prompt: characterPrompts.pirate_parrot,
    features: [],
  },
  transformer_bot: {
    name: "Spark the Transformer Bot",
    slug: "transformer_bot",
    meaning: "The creative robot",
    voice: "alloy",
    prompt: characterPrompts.transformer_bot,
    features: [],
  },
  trex: {
    name: "Tiny the T-Rex",
    slug: "trex",
    meaning: "The gentle giant",
    voice: "shimmer",
    prompt: characterPrompts.trex,
    features: [],
  },
};

export interface VoiceConfig {
  name: string; // preferred speechSynthesis voice name (partial match)
  pitch: number; // 0 (deep) to 2 (high)
  rate: number; // 0.5 (slow) to 2 (fast)
  lang: string; // 'en-US', 'en-GB', etc.
}

export const characterVoices: Record<string, VoiceConfig> = {
  coniglio: { name: '', pitch: 1.3, rate: 1.05, lang: 'en-US' }, // soft, higher
  corvo: { name: '', pitch: 0.7, rate: 0.95, lang: 'en-US' }, // deep, slow
  gufo: { name: '', pitch: 0.9, rate: 0.9, lang: 'en-GB' }, // wise, slower
  orsetto: { name: '', pitch: 0.8, rate: 0.95, lang: 'en-US' }, // deep, warm
  tartaruga: { name: '', pitch: 0.8, rate: 0.75, lang: 'en-US' }, // very slow, deep
  leone: { name: '', pitch: 0.7, rate: 1.0, lang: 'en-US' }, // deep, confident
  drago: { name: '', pitch: 1.0, rate: 1.1, lang: 'en-US' }, // playful
  xolo: { name: '', pitch: 0.9, rate: 0.9, lang: 'en-US' }, // ancient feel
  elefante: { name: '', pitch: 0.6, rate: 0.85, lang: 'en-US' }, // very deep, slow
  delfino: { name: '', pitch: 1.2, rate: 1.15, lang: 'en-US' }, // high, fast, playful
};

export const defaultVoice: VoiceConfig = {
  name: '',
  pitch: 1.0,
  rate: 1.0,
  lang: 'en-US',
};

function isNaturalVoice(voice: SpeechSynthesisVoice): boolean {
  const name = voice.name.toLowerCase();
  // Prefer voices that sound less robotic; heuristic based on common voice names.
  const preferredNames = ['samantha', 'daniel', 'karen', 'fred', 'victoria', 'moira', 'tessa'];
  return preferredNames.some((n) => name.includes(n));
}

export function getVoiceForCharacter(config: VoiceConfig): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;

  // First try a natural-sounding voice matching the language.
  const natural = voices.find(
    (v) => v.lang.startsWith(config.lang) && isNaturalVoice(v)
  );
  if (natural) return natural;

  // Then any voice matching the language.
  const langMatch = voices.find((v) => v.lang.startsWith(config.lang));
  if (langMatch) return langMatch;

  // Fallback to the first available voice.
  return voices[0];
}
