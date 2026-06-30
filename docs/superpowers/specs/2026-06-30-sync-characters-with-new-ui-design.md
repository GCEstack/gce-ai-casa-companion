# Sync Casa Companion characters with the new web-revamp UI

**Date:** 2026-06-30  
**Scope:** `web-revamp`, `packages/characters`

## Problem

The `web-revamp` “new UI” keeps a full vendored copy of the character registry in `src/lib/@casa/characters/`. It defines 46 characters with `portrait`, `idleVideo`, `speakingVideo`, and `voiceIntro` paths. Current state:

- Portraits and idle/speaking videos are present on disk.
- `voiceIntro` audio files are referenced but **all 46 are missing** from `public/audio/`.
- Three characters (`xolo`, `stellino`, `vinile`) have `idleVideo`/`speakingVideo` set to `undefined`.
- The registry is a duplicate of `packages/characters`, creating drift risk.

## Goal

Make every character in `web-revamp` render and move (idle/speaking video) without errors, while wiring the app to the shared `packages/characters` source of truth.

## Design

### 1. Keep the shared package as the source of truth

- Delete `web-revamp/src/lib/@casa/characters/` vendored copy.
- Update `web-revamp/tsconfig.app.json` so `@casa/characters` resolves to `../../packages/characters/src/index.ts`.
- Extend `packages/characters/src/characters.ts` with optional web asset fields (`portrait`, `idleVideo`, `speakingVideo`, `voiceIntro`) so the shared type can carry the mapping. Keep the package usable by non-web consumers by making the fields optional.

### 2. Add a thin web-specific asset layer

Create `web-revamp/src/lib/characterAssets.ts`:

- Import the base `webCharacters` (or all character configs) from `@casa/characters`.
- For each slug, overlay the asset paths that live in `web-revamp/public/`.
- Where a video is missing or undefined, fall back to the portrait image so the UI still renders something.
- Export `getWebCharacter(slug)` used by `CharacterDetail` and the landing grid.

### 3. Update the UI to handle missing video gracefully

- `CharacterDetail` already plays idle/speaking videos. Ensure it falls back to the portrait when `idleVideo`/`speakingVideo` is missing.
- Remove or suppress `voiceIntro` playback until audio files are generated (do not block the video loop on missing MP3s).

### 4. Verification loop

Add a dev-only test page or script:

- Route `/character-test` (or a Node script) iterates all characters.
- Confirms each character’s `portrait` file exists.
- Confirms each character has either a video file or a fallback portrait.
- Renders each character briefly and reports any slugs that fail.
- Writes a concise JSON report to `web-revamp/character-sync-report.json`.

## Approach

Recommended approach: **(2) overlay asset layer**. It keeps web assets decoupled from the shared package while eliminating the vendored copy. We avoid generating 46 audio files or 6 new videos in this pass; instead we guarantee every character renders and moves via existing assets plus portrait fallback.

## Success criteria

- `npm run build` in `web-revamp` passes.
- The verification loop reports **0 missing required assets** and **0 render failures** for all 46 characters.
- `apps/landing` and `apps/mobile` are not broken by `packages/characters` type changes (optional fields only).

## Out of scope

- Generating new video/audio assets.
- Replacing character copies in `apps/mobile`.
- Backend voice pipeline changes.
- Pushing to GitHub or Vercel.
