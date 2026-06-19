#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHARACTERS_TS = path.join(ROOT, 'src/lib/characters.ts');
const CONFIG_TS = path.join(ROOT, 'src/lib/characterConfig.ts');
const OUT = path.join(ROOT, 'docs/voice-directions.md');
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

function parseTsArray(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const start = text.indexOf('[');
  const end = text.indexOf('];', start);
  if (start === -1 || end === -1) throw new Error('Could not locate array');
  return new Function(`return ${text.slice(start, end + 2)}`)();
}

function parseTsRecord(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const decl = text.indexOf('export const characterConfigs');
  const start = text.indexOf('{', decl);
  const end = text.indexOf('};', start);
  if (start === -1 || end === -1) throw new Error('Could not locate record');
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
      temperature: 0.8,
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

async function main() {
  const chars = parseTsArray(CHARACTERS_TS);
  const configs = parseTsRecord(CONFIG_TS);

  const roster = chars.map((c) => ({
    slug: c.slug,
    name: c.name,
    meaning: c.italianMeaning,
    category: c.category,
    voice: configs[c.slug]?.voice || 'alloy',
    personality: configs[c.slug]?.prompt?.split('\n')[0] || '',
  }));

  const directionsJson = await openaiChat([
    {
      role: 'system',
      content:
        'You are a voice director for a children\'s AI companion app. Return ONLY raw JSON. No markdown, no explanation.',
    },
    {
      role: 'user',
      content: `Here is a roster of characters. For each one, return a JSON object keyed by slug with these fields:
- "voice": must be one of [alloy, ash, coral, echo, fable, nova, onyx, sage, shimmer]. Use the voice already assigned if provided.
- "instructions": a short TTS voice-direction prompt (max 2 sentences) describing pitch, pace, energy, warmth, accent, and delivery. Make it unique and tied to the animal/object and personality.
- "intro": a 1-2 sentence in-character greeting the companion would say to a child. Keep it warm and kid-friendly.

Roster:
${JSON.stringify(roster, null, 2)}`,
    },
  ]);

  let directions;
  try {
    const cleaned = directionsJson.replace(/```json\s*|\s*```/g, '').trim();
    directions = JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse directions JSON:', directionsJson.slice(0, 500));
    throw e;
  }

  const lines = [
    '# Character Voice Directions',
    '',
    'These are the voice presets and directions used for each companion intro.',
    '',
    '| Character | Voice | Directions | Intro Sample |',
    '|-----------|-------|------------|--------------|',
  ];

  for (const c of chars) {
    const dir = directions[c.slug] || {};
    const voice = dir.voice || configs[c.slug]?.voice || 'alloy';
    const instructions = (dir.instructions || '').replace(/\|/g, '\\|');
    const intro = (dir.intro || '').replace(/\|/g, '\\|');
    lines.push(`| ${c.name} | ${voice} | ${instructions} | ${intro} |`);
  }

  lines.push(
    '',
    '## File output',
    '',
    'Generated intro MP3s are saved to `public/audio/characters/{slug}-intro.mp3` and referenced by `voiceIntro` in `src/lib/characters.ts`.'
  );

  fs.writeFileSync(OUT, lines.join('\n'), 'utf-8');
  console.log(`Wrote voice directions to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
