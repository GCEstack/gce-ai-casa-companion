#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHARACTERS_TS = path.join(ROOT, 'src/lib/characters.ts');
const CONFIG_TS = path.join(ROOT, 'src/lib/characterConfig.ts');
const OUT_DIR = path.join(ROOT, 'public/audio/characters');
const OPENAI_KEY = 'REDACTED_OPENAI_KEY';

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

async function openaiTTS({ voice, instructions, input }, outPath) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice,
      input,
      instructions,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS error ${res.status}: ${err}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buffer);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withConcurrency(tasks, limit) {
  const results = [];
  const executing = [];
  for (const [index, task] of tasks.entries()) {
    const p = Promise.resolve().then(() => task()).then((r) => ({ index, result: r }));
    results.push(p);
    if (results.length >= limit) {
      executing.push(p);
      if (executing.length >= limit) {
        await Promise.race(executing);
        executing.splice(executing.findIndex((e) => e === p), 1);
      }
    }
  }
  const settled = await Promise.allSettled(results);
  return settled.map((s) => (s.status === 'fulfilled' ? s.value.result : s.reason));
}

async function main() {
  const chars = parseTsArray(CHARACTERS_TS);
  const configs = parseTsRecord(CONFIG_TS);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const roster = chars.map((c) => ({
    slug: c.slug,
    name: c.name,
    meaning: c.italianMeaning,
    category: c.category,
    voice: configs[c.slug]?.voice || 'alloy',
    personality: configs[c.slug]?.prompt?.split('\n')[0] || '',
  }));

  console.log('Generating voice directions via OpenAI...');
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

  console.log(`Parsed directions for ${Object.keys(directions).length} characters.`);

  const tasks = chars.map((c) => async () => {
    const dir = directions[c.slug];
    if (!dir) {
      console.warn(`No directions for ${c.slug}, skipping.`);
      return;
    }
    const outPath = path.join(OUT_DIR, `${c.slug}-intro.mp3`);
    try {
      await openaiTTS(
        {
          voice: dir.voice || configs[c.slug]?.voice || 'alloy',
          instructions: dir.instructions,
          input: dir.intro,
        },
        outPath
      );
      console.log(`✅ ${c.slug}: ${dir.voice} -> ${path.relative(ROOT, outPath)}`);
    } catch (err) {
      console.error(`❌ ${c.slug}:`, err.message);
    }
  });

  await withConcurrency(tasks, 5);

  // Update voiceIntro paths in characters.ts
  let charsText = fs.readFileSync(CHARACTERS_TS, 'utf-8');
  for (const c of chars) {
    const slug = c.slug;
    const re = new RegExp(
      `(slug:\s*['"]${slug}['"][\\s\\S]*?voiceIntro:\s*)([^,\n]+)(,?)`,
      'm'
    );
    charsText = charsText.replace(re, `$1'/audio/characters/${slug}-intro.mp3'$3`);
  }
  fs.writeFileSync(CHARACTERS_TS, charsText, 'utf-8');
  console.log('Updated voiceIntro paths in characters.ts');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
