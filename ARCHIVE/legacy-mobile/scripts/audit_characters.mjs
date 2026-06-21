#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHARACTERS_TS = path.join(ROOT, 'src/lib/characters.ts');
const CONFIG_TS = path.join(ROOT, 'src/lib/characterConfig.ts');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'docs/character-roster.md');

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

function exists(rel) {
  if (!rel) return false;
  return fs.existsSync(path.join(PUBLIC, rel.replace(/^\//, '')));
}

function personalitySummary(prompt) {
  if (!prompt) return '(no summary)';
  for (const line of prompt.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('-')) return trimmed;
  }
  return '(no summary)';
}

function main() {
  const chars = parseTsArray(CHARACTERS_TS);
  const configs = parseTsRecord(CONFIG_TS);

  const voiceCounts = {};
  for (const slug in configs) {
    const v = configs[slug].voice;
    voiceCounts[v] = (voiceCounts[v] || 0) + 1;
  }

  const lines = [
    '# Casa Companion Character Roster',
    '',
    `Total characters: **${chars.length}**`,
    '',
    '## Legend',
    '',
    '| Field | Meaning |',
    '|-------|---------|',
    '| **Slug** | URL/internal identifier |',
    '| **Name** | Display name |',
    '| **Italian meaning** | What the name means in Italian / role |',
    '| **Voice** | OpenAI TTS voice used for responses |',
    '| **Voice unique?** | `✅` if only this character uses that voice |',
    '| **Portrait** | Grid image in `public/characters/` |',
    '| **Showcase** | Larger image in `public/characters/` |',
    '| **Idle video** | Background loop in `public/videos/` |',
    '| **Speaking video** | Optional mouth-moving clip in `public/videos/` |',
    '| **Assets OK?** | `✅` if portrait + idle video exist, else notes |',
    '| **Accent** | UI accent color |',
    '| **Category** | Character type |',
    '| **Personality** | Short summary from the system prompt |',
    '| **Special features** | Custom modes / slash commands |',
    '',
    '## Roster',
    '',
    '| # | Slug | Name | Italian meaning | Voice | Unique | Portrait | Showcase | Idle video | Speaking video | Assets | Accent | Category | Personality | Features |',
    '|---|------|------|-----------------|-------|--------|----------|----------|------------|----------------|--------|--------|----------|-------------|----------|',
  ];

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const cfg = configs[c.slug] || {};
    const voice = cfg.voice || '—';
    const unique = voiceCounts[voice] === 1 ? '✅' : `❌ (${voiceCounts[voice] || 0})`;
    const portraitOk = exists(c.portrait);
    const showcaseOk = exists(c.showcase);
    const idleOk = exists(c.videoSrc);
    const speakingRel = `/videos/${c.slug}_speaking.mp4`;
    const speakingOk = exists(speakingRel);
    const assetsOk = portraitOk && idleOk ? '✅' : '⚠️';

    const features = (cfg.features || [])
      .map((f) => f.name)
      .filter(Boolean)
      .join(', ') || '—';

    lines.push(
      `| ${i + 1} | ${c.slug} | ${c.name} | ${c.italianMeaning} | ${voice} | ${unique} | ${
        portraitOk ? path.basename(c.portrait) : '❌ missing'
      } | ${showcaseOk ? path.basename(c.showcase) : '❌ missing'} | ${
        idleOk ? path.basename(c.videoSrc) : '❌ missing'
      } | ${speakingOk ? path.basename(speakingRel) : '—'} | ${assetsOk} | ${
        c.accentColor
      } | ${c.category} | ${personalitySummary(cfg.prompt)} | ${features} |`
    );
  }

  lines.push('', '## Voice usage summary', '');
  lines.push('| Voice | Count | Characters |');
  lines.push('|-------|-------|------------|');
  const sortedVoices = Object.entries(voiceCounts).sort((a, b) => b[1] - a[1]);
  for (const [voice, count] of sortedVoices) {
    const users = Object.entries(configs)
      .filter(([, cfg]) => cfg.voice === voice)
      .map(([slug, cfg]) => cfg.name || slug)
      .join(', ');
    lines.push(`| ${voice} | ${count} | ${users} |`);
  }

  const gaps = [];
  for (const c of chars) {
    if (!exists(c.portrait)) gaps.push(`- \`${c.slug}\` portrait missing: \`${c.portrait}\``);
    if (!exists(c.videoSrc)) gaps.push(`- \`${c.slug}\` idle video missing: \`${c.videoSrc}\``);
  }

  lines.push('', '## Asset gaps', '');
  if (gaps.length) lines.push(...gaps);
  else lines.push('All characters have their portrait and idle video. ✅');

  fs.writeFileSync(OUT, lines.join('\n'), 'utf-8');
  console.log(`Wrote roster to ${OUT}`);
}

main();
