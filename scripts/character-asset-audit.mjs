import fs from 'fs';
import path from 'path';

const root = process.cwd();
const reportPath = path.join(root, 'docs', 'character-asset-inventory-with-dates.md');

const charactersJson = JSON.parse(fs.readFileSync(path.join(root, 'packages', 'characters', 'characters.json'), 'utf8'));
const canonicalSlugs = Object.keys(charactersJson);

const landingTs = fs.readFileSync(path.join(root, 'apps', 'landing', 'lib', 'characters.ts'), 'utf8');
const landingMatch = landingTs.match(/const landingSlugs = new Set\(\[([\s\S]*?)\]\)/);
const landingSlugs = landingMatch
  ? [...landingMatch[1].matchAll(/"([a-z_]+)"/g)].map(m => m[1])
  : [];

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function rel(p) {
  return path.relative(root, p).replace(/\\/g, '/');
}

function mtime(p) {
  try { return fs.statSync(p).mtime.toISOString().replace(/T/, ' ').replace(/\.\d+Z$/, ' UTC'); } catch { return null; }
}

function findFile(dir, base, exts) {
  for (const ext of exts) {
    const p = path.join(dir, `${base}${ext}`);
    if (exists(p)) return { path: rel(p), mtime: mtime(p) };
  }
  return null;
}

function newest(dates) {
  const valid = dates.filter(Boolean);
  if (!valid.length) return null;
  return valid.sort().reverse()[0];
}

const rows = canonicalSlugs.map(slug => {
  const name = charactersJson[slug].name;
  const mobilePortrait = findFile(path.join(root, 'apps', 'mobile', 'public', 'characters'), slug, ['.png', '.webp']);
  const mobileIdle = findFile(path.join(root, 'apps', 'mobile', 'public', 'videos'), `${slug}_idle`, ['.mp4']);
  const mobileSpeaking = findFile(path.join(root, 'apps', 'mobile', 'public', 'videos'), `${slug}_speaking`, ['.mp4']);
  const webPortrait = findFile(path.join(root, 'web-revamp', 'public', 'characters'), slug, ['.png', '.webp']);
  const webIdle = findFile(path.join(root, 'web-revamp', 'public', 'videos'), `${slug}_idle`, ['.mp4']);
  const webSpeaking = findFile(path.join(root, 'web-revamp', 'public', 'videos'), `${slug}_speaking`, ['.mp4']);

  const dates = [
    mobilePortrait?.mtime,
    mobileIdle?.mtime,
    mobileSpeaking?.mtime,
    webPortrait?.mtime,
    webIdle?.mtime,
    webSpeaking?.mtime,
  ];

  return {
    slug,
    name,
    inLanding: landingSlugs.includes(slug),
    mobilePortrait: mobilePortrait?.path || 'MISSING',
    mobileIdle: mobileIdle?.path || 'MISSING',
    mobileSpeaking: mobileSpeaking?.path || 'MISSING',
    webPortrait: webPortrait?.path || 'MISSING',
    webIdle: webIdle?.path || 'MISSING',
    webSpeaking: webSpeaking?.path || 'MISSING',
    newest: newest(dates) || 'NO ASSETS',
  };
});

const sourceFiles = [
  { label: 'packages/characters/characters.json', path: path.join(root, 'packages', 'characters', 'characters.json') },
  { label: 'packages/characters/src/characters.ts', path: path.join(root, 'packages', 'characters', 'src', 'characters.ts') },
  { label: 'packages/characters/src/modes.ts', path: path.join(root, 'packages', 'characters', 'src', 'modes.ts') },
  { label: 'apps/mobile/src/lib/casaCharacters/characters.ts', path: path.join(root, 'apps', 'mobile', 'src', 'lib', 'casaCharacters', 'characters.ts') },
  { label: 'apps/landing/lib/characters.ts', path: path.join(root, 'apps', 'landing', 'lib', 'characters.ts') },
  { label: 'web-revamp/src/lib/characters.ts', path: path.join(root, 'web-revamp', 'src', 'lib', 'characters.ts') },
];

let md = `# Character Asset Inventory with Last-Modified Dates

Generated: ${new Date().toISOString()}

## Source-of-truth character files

| File | Last modified |
|------|---------------|
`;
for (const f of sourceFiles) {
  md += `| ${f.label} | ${mtime(f.path) || 'MISSING'} |\n`;
}

md += `
## Roster counts

- Canonical characters (packages/characters/characters.json): **${canonicalSlugs.length}**
- Landing page roster (apps/landing/lib/characters.ts): **${landingSlugs.length}**
- Characters in landing but not canonical: **${landingSlugs.filter(s => !canonicalSlugs.includes(s)).join(', ') || 'none'}**
- Characters in canonical but not landing: **${canonicalSlugs.filter(s => !landingSlugs.includes(s)).join(', ') || 'none'}**

## “Pietra” check

- “Pietra” slug exists: **${canonicalSlugs.includes('pietra') ? 'YES' : 'NO'}**
- “Pietro” slug exists: **${canonicalSlugs.includes('pietro') ? 'YES' : 'NO'}**

## Per-character assets

| Slug | Landing? | Mobile portrait | Mobile idle | Mobile speaking | Web portrait | Web idle | Web speaking | Newest asset date |
|------|----------|-----------------|-------------|-----------------|--------------|----------|--------------|-------------------|
`;

for (const r of rows) {
  md += `| ${r.slug} | ${r.inLanding ? '✅' : ''} | ${r.mobilePortrait} | ${r.mobileIdle} | ${r.mobileSpeaking} | ${r.webPortrait} | ${r.webIdle} | ${r.webSpeaking} | ${r.newest} |\n`;
}

md += `
## Missing assets summary

`;
const missingMobilePortrait = rows.filter(r => r.mobilePortrait === 'MISSING');
const missingMobileIdle = rows.filter(r => r.mobileIdle === 'MISSING');
const missingMobileSpeaking = rows.filter(r => r.mobileSpeaking === 'MISSING');
const missingWebPortrait = rows.filter(r => r.webPortrait === 'MISSING');
const missingWebIdle = rows.filter(r => r.webIdle === 'MISSING');
const missingWebSpeaking = rows.filter(r => r.webSpeaking === 'MISSING');

md += `- Mobile portraits missing: ${missingMobilePortrait.length} (${missingMobilePortrait.map(r => r.slug).join(', ') || 'none'})\n`;
md += `- Mobile idle videos missing: ${missingMobileIdle.length} (${missingMobileIdle.map(r => r.slug).join(', ') || 'none'})\n`;
md += `- Mobile speaking videos missing: ${missingMobileSpeaking.length} (${missingMobileSpeaking.map(r => r.slug).join(', ') || 'none'})\n`;
md += `- Web portraits missing: ${missingWebPortrait.length} (${missingWebPortrait.map(r => r.slug).join(', ') || 'none'})\n`;
md += `- Web idle videos missing: ${missingWebIdle.length} (${missingWebIdle.map(r => r.slug).join(', ') || 'none'})\n`;
md += `- Web speaking videos missing: ${missingWebSpeaking.length} (${missingWebSpeaking.map(r => r.slug).join(', ') || 'none'})\n`;

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, md, 'utf8');
console.log(`Wrote ${reportPath}`);
