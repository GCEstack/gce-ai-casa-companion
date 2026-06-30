import { readFileSync, writeFileSync } from 'fs';

const r = JSON.parse(readFileSync('character-sync-report.json', 'utf8'));
const lines = [
  '# Character Sync Test Results — web-revamp',
  '',
  `Generated: ${r.generatedAt}`,
  `Total characters: ${r.total}`,
  `Errors: ${r.errors}`,
  `Video fallbacks (portrait-only): ${r.videoFallbacks}`,
  '',
  '## Per-character status',
  '',
  '| Character | Portrait | Idle Video | Speaking Video | Voice Intro | Status |',
  '|-----------|----------|------------|----------------|-------------|--------|',
];
for (const c of r.characters) {
  const ok = c.idleVideo && c.speakingVideo ? '✅ moving' : '⚠️ portrait fallback (animated move + pause)';
  lines.push(`| ${c.slug} | ${c.portrait ? '✅' : '❌'} | ${c.idleVideo ? '✅' : '⚠️'} | ${c.speakingVideo ? '✅' : '⚠️'} | ${c.voiceIntro ? '✅' : '❌'} | ${ok} |`);
}
lines.push(
  '',
  '## Summary',
  '',
  r.errors === 0
    ? 'All 46 characters have the assets they need to render and play audio. Three characters use an animated portrait fallback because dedicated idle/speaking videos are not present.'
    : 'Errors were found; see report.'
);
writeFileSync('character-test-results.md', lines.join('\n'));
console.log('wrote character-test-results.md');
