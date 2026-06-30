# Casa Companion — Frontend / Backend Sync Audit

**Date:** 2026-06-30  
**Repo:** `C:/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/casa-companion`  
**Canonical upstream:** `https://github.com/GCEstack/gce-ai-casa-companion.git` (`origin`)  
**Local branch:** `main`  
**Local commit:** `b4a2b54` — *assets(web-revamp): wire in missing character portraits and speaking videos* (2026-06-29 21:19 CDT)

---

## 1. Executive Summary

This audit inspected the active frontends, the shared character package, and the canonical voice backend, then checked whether the local repository, GitHub `main`, and the Vercel/Fly deployments are in sync.

**Bottom line:**

- **GitHub is in sync with local commits.** `origin/main` points to the same commit (`b4a2b54`) as the local working tree.
- **There are no uncommitted code changes**, but **43 untracked files/folders** exist. None of these are deployed from the canonical Git branch unless they are committed.
- **Vercel CLI/API is not authenticated in this environment**, so I could not read the exact deployed commit for each Vercel project. The live sites respond, but I cannot verify they are on `b4a2b54` without a Vercel token.
- **All active apps build**, but `web-revamp` has **31 ESLint errors / 2 warnings**.
- **The backend test suite passes** (68/68 of the AGENTS.md-recommended tests).
- **The biggest architectural risk is shared-package drift:** `apps/mobile` and `web-revamp` vendored copies of `packages/characters` instead of consuming the shared package.

---

## 2. GitHub Sync

| Check | Result |
|-------|--------|
| Local HEAD | `b4a2b54` |
| `origin/main` | `b4a2b54` |
| Local ahead of origin | No |
| Origin ahead of local | No |
| Uncommitted changes | None |
| Untracked files | 43 (see list below) |

**Important untracked items:**

- `.superpowers/`
- `apps/web-revamp/` — **untracked duplicate of the root `web-revamp/` directory**
- `apps/vercel.json`
- `apps/mobile/Kimi_Agent_Deployment 404 Investigation.zip`
- `ARCHIVE/casa-voice-agent-github/`
- Several `ARCHIVE/**/.env.example` files
- `BACKLOG_20260623.md`, `RESTART_BACKLOG.md`
- Asset zips: `Kimi_Agent_Deployment_v19.zip`, `Kimi_Agent_Deployment_v25.zip`
- Character/design docs under `docs/` and `character-audit/`

**Implication:** Any code or config in the untracked paths is **not on GitHub** and therefore **not being deployed** from the canonical branch. The root `web-revamp/` is tracked and is the one linked to the `casa-redesign-temp` Vercel project; the untracked `apps/web-revamp/` is a duplicate/confusion risk.

---

## 3. Active Application Health

### 3.1 `apps/landing` — Marketing / demo site

| Item | Value |
|------|-------|
| Framework | Next.js 14 (App Router), React 18, TypeScript 5.9, Tailwind 3.4 |
| Tracked files | 210 |
| Local `.vercel` project | `landing` (`prj_v8G2gJUwYiP7dlqF7PjeJ8rqfnEb`) |
| Canonical Vercel URL | `https://casa-landing.vercel.app` |
| Type-check (`npx tsc --noEmit`) | ✅ Pass |
| Build (`npm run build`) | ✅ Pass (build-time env validation falls back to dummy values) |
| Lint (`npm run lint`) | ✅ Pass |
| Tests | None configured |

**Notes:**

- Uses `@casa/characters` shared package correctly.
- `.env.example` has a stale `ELEVENLABS_API_KEY` entry that is not referenced in code.
- `SUPABASE_ANON_KEY` is required by `lib/config.ts` but never used.
- `OPENAI_REALTIME_MODEL` defaults to `gpt-realtime-2`, which is not a known OpenAI realtime model.
- `@supabase/ssr` is installed but never imported.

### 3.2 `web-revamp` — Evaluation / new-design frontend

| Item | Value |
|------|-------|
| Framework | Vite + React 19 + TypeScript 5.9, Tailwind 3.4, shadcn/ui |
| Tracked files | 355 |
| Local `.vercel` project | `casa-redesign-temp` (`prj_fnDKYCZrMiKdcs2mh1J2IxGIkvqe`) |
| Canonical Vercel URL | `https://casa-redesign-temp.vercel.app` |
| Type-check (`npx tsc --noEmit`) | ✅ Pass |
| Build (`npm run build`) | ✅ Pass |
| Lint (`npm run lint`) | ❌ **31 errors, 2 warnings** |
| Tests | None configured |

**Notes:**

- `@casa/characters` alias resolves to a **vendored copy inside `src/lib/@casa/characters/`**, not the shared `packages/characters`.
- `public/audio/` is missing; 46 character intro MP3s referenced in code will 404.
- `package.json` still uses the Vite template name `my-app`.
- `fly.toml` exists for legacy Fly project `casa-companion-app`; `Dockerfile` does not build the app.

### 3.3 `apps/mobile` — Kids’ voice PWA

| Item | Value |
|------|-------|
| Framework | Vite 6 + React 18 + TypeScript 5.6, Tailwind, React Router 7, PWA |
| Tracked files | 262 |
| Local `.vercel` project | `mobile` (`prj_kRJZlAiSJAwuQMvGOnFxDGFCGHjb`) — *likely stale* |
| Canonical deployments | Fly.io (`casa-web-mobile-liam`, etc.) per `AGENTS.md` |
| Type-check (`npx tsc -b`) | ✅ Pass |
| Build (`npm run build`) | ✅ Pass |
| Lint | Not configured |
| Tests | None configured |

**Notes:**

- `src/lib/casaCharacters/` is a **verbatim copy of `packages/characters/src/`**.
- `fly.toml` is hardcoded to `casa-web-mobile-liam`.
- API keys entered in Settings are stored in `localStorage` in plaintext.
- `useVoiceSocket.ts` logs the WebSocket URL, potentially leaking the `token` query param.
- Sentry SDK is installed but instrumentation is disabled.

### 3.4 `packages/characters` — Shared character definitions

| Item | Value |
|------|-------|
| Tracked files | 6 |
| Package name | `@casa/characters` |
| Build / test scripts | None |
| Consumers | `apps/landing` ✅, `voice/v3-dual` ✅ (loads `characters.json`), `apps/mobile` ❌ (copy), `web-revamp` ❌ (copy) |

**Notes:**

- No `tsconfig.json`, no build step, no tests.
- `modeConfigs` does not include `travel_games` or `lullaby`, so those modes have no UI in mobile/web-revamp.
- Some character video assets (`xolo`, `stellino`, `vinile`) are undefined.

### 3.5 `voice/v3-dual` — FastAPI voice backend

| Item | Value |
|------|-------|
| Tracked files | 102 |
| Runtime | Python ≥3.10, FastAPI, uvicorn |
| Canonical deployment | `casa-voice-agent` on Fly.io (`https://casa-voice-agent.fly.dev`) |
| Recommended tests | ✅ **68 passed** |
| CI | `.github/workflows/backend-deploy.yml` runs `test_commands.py` + `test_filler.py`, then deploys to Fly.io |

**Notes:**

- `.env.example` is incomplete and duplicates `OPENROUTER_API_KEY`.
- `scripts/setup-casa.ps1` hardcodes a wrong project root path.
- Admin endpoints are unprotected when `VOICE_SERVER_API_KEY` is unset.
- CI only runs 2 of the 5 recommended test files.

---

## 4. Vercel / Deployment Sync

| App / Site | Local `.vercel/project.json` name | Project ID | Known live URL | Deployed commit verified? |
|------------|-----------------------------------|------------|----------------|---------------------------|
| Root (repo level) | `casa-companion` | `prj_OkCsxdtLD1xEQxCiG7gmQn9AwIh4` | — | No |
| `apps/` | `apps` | `prj_GfoN5SzCgzfO6g4Pyg5YlzfcUpbo` | — | No |
| `apps/landing` | `landing` | `prj_v8G2gJUwYiP7dlqF7PjeJ8rqfnEb` | `https://casa-landing.vercel.app` | No |
| `apps/mobile` | `mobile` | `prj_kRJZlAiSJAwuQMvGOnFxDGFCGHjb` | — | No |
| `web-revamp` | `casa-redesign-temp` | `prj_fnDKYCZrMiKdcs2mh1J2IxGIkvqe` | `https://casa-redesign-temp.vercel.app` | No |

**Observations:**

- Vercel CLI is not installed/authenticated, so the exact deployed commit could not be retrieved.
- Both live sites return `X-Vercel-Cache` headers, confirming they are served by Vercel.
- `apps/mobile` is documented to deploy on **Fly.io**, not Vercel, yet it has a local `.vercel` link. This is likely leftover from an earlier experiment.
- The root and `apps/` `.vercel` links (`casa-companion`, `apps`) do not match the canonical project names in `AGENTS.md` and may also be stale.
- There is **no GitHub Actions workflow for Vercel**. Deployment relies on the Vercel Git integration in each project’s dashboard. I cannot verify that integration is enabled without dashboard or CLI access.

---

## 5. Environment / Secrets Hygiene

- No real `.env`, `.env.local`, or `.env.production` files are committed — good.
- `.env.example` files exist in the active apps/backend.
- Both `apps/landing/.env.example` and `web-revamp/.env.example` warn that a previous `ELEVENLABS_API_KEY` was committed and must be rotated.
- Required production secrets are documented in `AGENTS.md` but not present locally.
- `NODE_ENV=production` guard workflow (`.github/workflows/vercel-env-guard.yml`) passes.

---

## 6. Build / Lint / Test Results

| Project | Type-check | Build | Lint | Tests |
|---------|------------|-------|------|-------|
| `apps/landing` | ✅ | ✅ | ✅ | N/A |
| `web-revamp` | ✅ | ✅ | ❌ 31 errors, 2 warnings | N/A |
| `apps/mobile` | ✅ | ✅ | N/A | N/A |
| `voice/v3-dual` | N/A | N/A | N/A | ✅ 68/68 recommended tests |

---

## 7. Red Flags (prioritized)

1. **Vendored character copies** — `apps/mobile` and `web-revamp` do not consume `packages/characters`; they keep full local copies. This breaks the monorepo’s single source of truth and will cause drift.
2. **Untracked `apps/web-revamp/` duplicate** — This folder is not tracked and partially shadows the real `web-revamp/`. It is a source of confusion and bloat.
3. **Vercel deployment commit unverified** — Without Vercel auth, I cannot confirm that `casa-landing` or `casa-redesign-temp` are running `b4a2b54`.
4. **Stale `.vercel` links** — Root `casa-companion`, `apps`, and `apps/mobile` `.vercel` project links do not match canonical project names.
5. **`web-revamp` lint is broken** — 31 ESLint errors; the project builds anyway.
6. **Missing audio assets in `web-revamp`** — 46 intro MP3s are referenced but `public/audio/` does not exist.
7. **Backend `.env.example` incomplete** — Missing `GEMINI_API_KEY`, `TTS_PROVIDER`, `SILERO_VAD_DISABLED`, `LOG_LEVEL`, `WEBSITES_PORT`, etc., and duplicates `OPENROUTER_API_KEY`.
8. **Backend CI runs only 2 of 5 recommended test files** — `test_characters.py`, `test_voice_router.py`, and `test_main_validation.py` are not run in CI.
9. **OpenAI realtime model default invalid** — `apps/landing` defaults to `gpt-realtime-2`.
10. **Local storage of API keys in mobile** — User-provided keys stored in plaintext `localStorage`.

---

## 8. Recommendations

1. **Verify Vercel Git integration.** Log in to Vercel (or run `vercel --token <token>` here) and confirm that:
   - `casa-landing` is linked to `apps/landing`
   - `casa-redesign-temp` is linked to `web-revamp`
   - Latest production deployments are on commit `b4a2b54`.
2. **Remove or commit untracked items.** At minimum delete the `apps/web-revamp/` duplicate and clean stale `.vercel` links in the repo root, `apps/`, and `apps/mobile/` if they are unused.
3. **Fix `web-revamp` lint.** 31 errors should be addressed before treating the build as clean.
4. **Unify character sourcing.** Update `apps/mobile` and `web-revamp` to import from `@casa/characters` and delete their vendored copies.
5. **Complete `voice/v3-dual/.env.example`** and fix `scripts/setup-casa.ps1` path.
6. **Expand backend CI** to run the full recommended test set.
7. **Add `typecheck` scripts** to `apps/mobile` and `web-revamp` for consistency with `AGENTS.md`.
8. **Fix missing `web-revamp/public/audio/` assets** or remove the references.
9. **Rotate `ELEVENLABS_API_KEY`** if it was ever committed, and remove the stale key from `.env.example` files.
10. **Avoid storing user API keys in `localStorage`** in `apps/mobile`; consider a server-side proxy or secure storage.

---

## 9. Done / Next Steps

- **This audit report is the deliverable.** No code was changed.
- To act on the recommendations, run the fixes in a fresh branch, then re-run the build/lint/test checks and confirm Vercel deployments reflect the new commit.

---

## 10. Follow-up: character sync with new UI (2026-06-30)

A second pass synced the `web-revamp` new UI with all 46 characters:

- **Replaced the vendored character copy** with a thin adapter at `web-revamp/src/lib/@casa/characters/index.ts` that re-exports from `packages/characters`. `vite.config.ts` and both `tsconfig.json`/`tsconfig.app.json` aliases now point to the adapter, so `web-revamp` consumes the shared package instead of maintaining its own copy.
- **`web-revamp/src/lib/characterVideos.ts`** now derives its video map from the shared character registry (`@casa/characters`), so it stays in sync automatically. Previously it only listed 37 characters, leaving 15 newer characters without motion.
- **Missing voice intros** were found in the untracked `apps/web-revamp/public/audio/` folder and copied to `web-revamp/public/audio/`. All 46 intro MP3s are now present.
- **Static-portrait fallback motion** was added for the 3 characters without videos (`xolo`, `stellino`, `vinile`) by applying the existing `gentle-bounce` animation to their portrait fallback.
- **Verification script** added at `web-revamp/scripts/verifyCharacters.mjs`. It checks every character’s portrait, idle/speaking videos, and voice intro, and writes `web-revamp/character-sync-report.json`.
- **Cleanup:** removed the untracked duplicate `apps/web-revamp/` directory after copying its audio assets.

Validation:

- `node scripts/verifyCharacters.mjs` — ✅ 46 characters checked, 0 errors, 3 video fallbacks.
- `npx tsc -p tsconfig.app.json --noEmit` — ✅ passes.
- `npm run build` — ✅ passes.

Remaining gap: the three fallback characters would still benefit from real idle/speaking videos, but the UI now renders them with an animated portrait and audio intro so no character is broken.
