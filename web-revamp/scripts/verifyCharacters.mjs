import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const webRoot = resolve(__dirname, '..');
const charactersPath = resolve(webRoot, '../packages/characters/src/characters.ts');

const charactersText = readFileSync(charactersPath, 'utf-8');
const blocks = charactersText.split(/(?=\s+slug:\s*')/);

const results = [];
let errors = 0;
let videoFallbacks = 0;

function publicPath(ref) {
  return resolve(webRoot, 'public', ref.replace(/^\//, ''));
}

for (const block of blocks) {
  const slugMatch = block.match(/slug:\s*'([^']+)'/);
  if (!slugMatch) continue;
  const slug = slugMatch[1];

  const grab = (key) => {
    const m = block.match(new RegExp(`${key}:\\s*(?:'([^']+)'|undefined)`));
    return m && m[1] ? m[1] : null;
  };

  const portrait = grab('portrait');
  const idleVideo = grab('idleVideo');
  const speakingVideo = grab('speakingVideo');
  const rawVoiceIntro = grab('voiceIntro');
  // webCharacters remaps /audio/characters/ -> /audio/
  const voiceIntro = rawVoiceIntro ? rawVoiceIntro.replace('/audio/characters/', '/audio/') : null;

  const row = { slug, portrait, idleVideo, speakingVideo, voiceIntro };

  if (!portrait) {
    row.error = 'missing portrait reference';
    errors++;
  } else if (!existsSync(publicPath(portrait))) {
    row.error = `missing portrait file: ${portrait}`;
    errors++;
  }

  if (!idleVideo || !speakingVideo) {
    row.fallback = true;
    videoFallbacks++;
  } else {
    if (!existsSync(publicPath(idleVideo))) {
      row.error = row.error ? `${row.error}; missing idle video: ${idleVideo}` : `missing idle video: ${idleVideo}`;
      errors++;
    }
    if (!existsSync(publicPath(speakingVideo))) {
      row.error = row.error ? `${row.error}; missing speaking video: ${speakingVideo}` : `missing speaking video: ${speakingVideo}`;
      errors++;
    }
  }

  if (!voiceIntro) {
    row.error = row.error ? `${row.error}; missing voice intro reference` : 'missing voice intro reference';
    errors++;
  } else if (!existsSync(publicPath(voiceIntro))) {
    row.error = row.error ? `${row.error}; missing voice intro: ${voiceIntro}` : `missing voice intro: ${voiceIntro}`;
    errors++;
  }

  results.push(row);
}

const report = {
  generatedAt: new Date().toISOString(),
  total: results.length,
  errors,
  videoFallbacks,
  characters: results,
};

const reportPath = resolve(webRoot, 'character-sync-report.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`Checked ${report.total} characters`);
console.log(`Video fallbacks (portrait-only): ${report.videoFallbacks}`);
console.log(`Errors: ${report.errors}`);
console.log(`Report written to ${reportPath}`);

if (report.errors > 0) {
  for (const c of results.filter((r) => r.error)) {
    console.error(`  ❌ ${c.slug}: ${c.error}`);
  }
  process.exitCode = 1;
} else {
  console.log('✅ All characters have required assets and will render.');
}
