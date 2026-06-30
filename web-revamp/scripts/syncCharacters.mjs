#!/usr/bin/env node
/**
 * Mirrors packages/characters into web-revamp/src/lib/@casa/characters
 * so the Vercel build (which only uploads the web-revamp directory) can
 * resolve the shared character package without leaving the project root.
 *
 * Run this whenever packages/characters changes:
 *   npm run sync:characters
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const sourceDir = join(repoRoot, 'packages', 'characters');
const destDir = join(__dirname, '..', 'src', 'lib', '@casa', 'characters');
const header = `// AUTO-GENERATED from packages/characters — do not edit manually.\n// Run \`npm run sync:characters\` to regenerate.\n\n`;

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

function copyTextWithHeader(src, dest) {
  const content = readFileSync(src, 'utf8');
  writeFileSync(dest, header + content, 'utf8');
}

function copyJson(src, dest) {
  const content = readFileSync(src, 'utf8');
  writeFileSync(dest, content, 'utf8');
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.endsWith('.ts')) {
      copyTextWithHeader(srcPath, destPath);
    } else if (entry.endsWith('.json')) {
      copyJson(srcPath, destPath);
    }
  }
}

if (!statSync(sourceDir, { throwIfNoEntry: false })?.isDirectory()) {
  console.log(`Source character package not found (${sourceDir}); using committed mirror.`);
  process.exit(0);
}

ensureDir(destDir);
// Copy characters.json next to src/ so ../characters.json resolves.
copyJson(join(sourceDir, 'characters.json'), join(destDir, 'characters.json'));
// Copy all TypeScript sources into src/.
copyDir(join(sourceDir, 'src'), join(destDir, 'src'));

console.log(`Synced characters package to ${relative(repoRoot, destDir)}`);
