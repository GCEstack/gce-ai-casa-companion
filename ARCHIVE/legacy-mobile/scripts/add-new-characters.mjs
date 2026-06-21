#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHARACTERS_TS = path.join(ROOT, 'src/lib/characters.ts');
const CONFIG_TS = path.join(ROOT, 'src/lib/characterConfig.ts');
const ROSTER_DIR = 'C:/Users/Dekan AI Brother/Desktop/04-Data/Downloads/kimi agenyt new vioice s/roster';
const OPENAI_KEY = 'REDACTED_OPENAI_KEY';

function parseTsArray(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const start = text.indexOf('[');
  const end = text.indexOf('];', start);
  if (start === -1 || end === -1) throw new Error('Could not locate array');
  return new Function(`return ${text.slice(start, end + 2)}`)();
}

async function openaiChat(messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.85,
      max_tokens: 4000,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chat error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

function toTitleCase(slug) {
  return slug
    .split(/[_\-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function main() {
  const existingChars = parseTsArray(CHARACTERS_TS);
  const existingSlugs = new Set(existingChars.map((c) => c.slug));

  const files = fs.readdirSync(ROSTER_DIR);
  const portraits = files.filter((f) => f.endsWith('_portrait.png'));
  const newSlugs = portraits
    .map((f) => f.replace('_portrait.png', ''))
    .filter((slug) => !existingSlugs.has(slug));

  if (newSlugs.length === 0) {
    console.log('No new characters to add.');
    return;
  }

  console.log('New slugs:', newSlugs.join(', '));

  const prompt = `I am adding new plush-toy AI companions to a kids' app. For each slug below, generate a JSON object keyed by slug with:
- name: a friendly display name
- meaning: a short role/description phrase (e.g., "The friendly alien explorer")
- voice: one of [alloy, ash, coral, echo, fable, nova, onyx, sage, shimmer]
- accentColor: a hex color that fits the character (e.g., "#6b7fd7")
- category: one of [animal, fantasy, person, object]
- prompt: a 4-6 sentence system prompt describing personality, how they speak, and how they interact with kids. Keep it warm and kid-friendly.
- features: an empty array []

Slugs: ${newSlugs.join(', ')}

Output ONLY raw JSON. No markdown, no explanation.`;

  const jsonText = await openaiChat([
    { role: 'system', content: 'You are a helpful assistant that returns only raw JSON.' },
    { role: 'user', content: prompt },
  ]);

  let generated;
  try {
    const cleaned = jsonText.replace(/```json\s*|\s*```/g, '').trim();
    generated = JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse generated JSON:', jsonText.slice(0, 500));
    throw e;
  }

  // Build characters.ts entries
  const charEntries = [];
  const configEntries = [];
  for (const slug of newSlugs) {
    const g = generated[slug] || {};
    const name = g.name || toTitleCase(slug);
    const meaning = g.meaning || `A friendly companion`;
    const voice = g.voice || 'alloy';
    const accentColor = g.accentColor || '#d4a843';
    const category = g.category || 'animal';
    const promptText =
      g.prompt || `You are ${name}, a friendly companion from Casa Companion. Be warm, playful, and speak in short sentences for kids.`;

    charEntries.push(`  {
    slug: '${slug}',
    name: '${name}',
    description: '${name} — ${meaning}',
    subtitle: 'Introduction',
    italianMeaning: '${meaning}',
    accentColor: '${accentColor}',
    accentHue: 0,
    category: '${category}',
    traits: ['Friendly', 'Curious', 'Supportive', 'Playful'],
    portrait: '/characters/${slug}.png',
    showcase: '/characters/${slug}.png',
    voiceIntro: '/audio/characters/${slug}-intro.mp3',
    videoSrc: '/videos/${slug}_idle.mp4',
    modes: {
      play: ['Story Time', 'Music & Rhythm', 'Geography', 'STEM Sparks'],
      learn: ['All Languages', 'Homework Helper', 'Coding'],
      support: ['Calm & Breathe', 'Milestones', 'Teaching Mode'],
    },
  },`);

    configEntries.push(`  ${slug}: {


    name: "${name}",
    slug: "${slug}",
    meaning: "${meaning}",
    voice: "${voice}",
    prompt: "${promptText.replace(/"/g, '\\"').replace(/\n/g, '\\n')}",
    features: [],
  },`);
  }

  // Append characters
  let charsText = fs.readFileSync(CHARACTERS_TS, 'utf-8');
  charsText = charsText.replace(
    /(\n\];\s*\nexport function getCharacterBySlug)/,
    `\n${charEntries.join('\n')}\n];\n\nexport function getCharacterBySlug`
  );
  fs.writeFileSync(CHARACTERS_TS, charsText, 'utf-8');

  // Append configs
  let cfgText = fs.readFileSync(CONFIG_TS, 'utf-8');
  cfgText = cfgText.replace(
    /(\n\};\s*)$/,
    `\n${configEntries.join('\n')}\n};\n`
  );
  fs.writeFileSync(CONFIG_TS, cfgText, 'utf-8');

  console.log(`Added ${newSlugs.length} new characters.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
