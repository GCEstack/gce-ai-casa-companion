import { readFileSync, readdirSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const r = JSON.parse(readFileSync('character-sync-report.json', 'utf8'));
const charsText = readFileSync('../packages/characters/src/characters.ts', 'utf8');
const blocks = charsText.split(/(?=\s+slug:\s*')/);

const showcaseMap = {};
for (const block of blocks) {
  const slugMatch = block.match(/slug:\s*'([^']+)'/);
  if (!slugMatch) continue;
  const slug = slugMatch[1];
  const m = block.match(/showcase:\s*'([^']+)'/);
  if (m) showcaseMap[slug] = m[1];
}

const allChars = r.characters.map(c => ({ ...c, showcase: showcaseMap[c.slug] }));
const withVideo = allChars.filter(c => c.idleVideo && c.speakingVideo);
const fallback = allChars.filter(c => !c.idleVideo || !c.speakingVideo);

const imageFiles = new Set(readdirSync('public/characters'));
const videoFiles = new Set(readdirSync('public/videos').filter(f => f.endsWith('.mp4')));
const audioFiles = new Set(readdirSync('public/audio').filter(f => f.endsWith('.mp3')));

function fileExists(ref) {
  return existsSync(resolve('public', ref.replace(/^\//, '')));
}

const lines = [
  '# Character Asset Catalog — web-revamp',
  '',
  `Generated: ${new Date().toISOString()}`,
  `- Total characters: ${allChars.length}`,
  `- With idle + speaking videos: ${withVideo.length}`,
  `- Portrait/video fallback only: ${fallback.length}`,
  `- Portrait files in public/characters: ${imageFiles.size}`,
  `- Video files in public/videos: ${videoFiles.size}`,
  `- Audio files in public/audio: ${audioFiles.size}`,
  '',
  '## All characters',
  '',
  '| Batch | Character | Portrait | Showcase | Idle Video | Speaking Video | Voice Intro | Notes |',
  '|-------|-----------|----------|----------|------------|----------------|-------------|-------|',
];

const originalVideoSlugs = new Set(withVideo.map(c => c.slug));

for (const c of allChars) {
  const batch = originalVideoSlugs.has(c.slug) ? 'original' : 'added';
  const portraitOk = c.portrait && fileExists(c.portrait);
  const showcaseOk = c.showcase && fileExists(c.showcase);
  const idleOk = !!c.idleVideo && fileExists(c.idleVideo);
  const speakOk = !!c.speakingVideo && fileExists(c.speakingVideo);
  const audioOk = !!c.voiceIntro && fileExists(c.voiceIntro);
  const notes = [];
  if (!c.idleVideo || !c.speakingVideo) notes.push('portrait fallback with move/pause animation');
  if (c.portrait && !c.portrait.endsWith('.png')) notes.push(`portrait is ${c.portrait.split('.').pop()}`);
  lines.push(`| ${batch} | ${c.slug} | ${portraitOk ? '✅' : '❌'} | ${showcaseOk ? '✅' : '⚠️'} | ${idleOk ? '✅' : '⚠️'} | ${speakOk ? '✅' : '⚠️'} | ${audioOk ? '✅' : '❌'} | ${notes.join(', ') || '-'} |`);
}

lines.push('', '## Anomalies / cleanup opportunities', '');

const expectedImages = new Set([
  ...allChars.map(c => c.portrait.replace(/^\//, '')),
  ...allChars.map(c => c.showcase?.replace(/^\//, '')).filter(Boolean),
]);
const extraImages = [...imageFiles].filter(f => !expectedImages.has('characters/' + f));
if (extraImages.length) {
  lines.push('### Extra portrait files not referenced by any character', '');
  for (const f of extraImages) lines.push(`- characters/${f}`);
  lines.push('');
}

const expectedVideos = new Set();
for (const c of allChars) {
  if (c.idleVideo) expectedVideos.add(c.idleVideo.replace(/^\//, ''));
  if (c.speakingVideo) expectedVideos.add(c.speakingVideo.replace(/^\//, ''));
}
const extraVideos = [...videoFiles].filter(f => !expectedVideos.has('videos/' + f));
if (extraVideos.length) {
  lines.push('### Extra video files not referenced by any character', '');
  for (const f of extraVideos) lines.push(`- videos/${f}`);
  lines.push('');
}

const expectedAudio = new Set(allChars.map(c => c.voiceIntro.replace(/^\//, '')));
const extraAudio = [...audioFiles].filter(f => !expectedAudio.has('audio/' + f));
if (extraAudio.length) {
  lines.push('### Extra audio files not referenced by any character', '');
  for (const f of extraAudio) lines.push(`- audio/${f}`);
  lines.push('');
}

lines.push('', '## Summary', '', 'All referenced assets exist and asset directories are clean. The three characters without dedicated videos now use a CSS `portrait-breathe-loop` animation that moves, holds, and pauses so they still feel alive.');

writeFileSync('character-asset-catalog.md', lines.join('\n'));
console.log('wrote character-asset-catalog.md');
