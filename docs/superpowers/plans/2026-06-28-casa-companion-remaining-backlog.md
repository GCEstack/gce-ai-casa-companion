# Casa Companion — Remaining Backlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining in-repo backlog items from `BACKLOG_20260623.md`: phone-as-parent-microphone pairing, landing survey verification, NODE_ENV guard, and documentation/remote cleanup.

**Architecture:** Add `/api/pairing` and `/ws/voice/realtime/{device_id}` to the active `voice/v3-dual` backend, add a parent-phone join surface in `apps/mobile`, merge the kid-side relay UI from the `phone-mic-pairing` branch into `web-revamp`, clean up the landing survey env/config, add a GitHub Action to block forbidden `NODE_ENV=production` settings, and update docs/remotes.

**Tech Stack:** FastAPI, Python 3.14, React 18/19, Vite, Next.js, TypeScript, WebSocket, Supabase, GitHub Actions.

## Global Constraints

- Do not modify `ARCHIVE/` except to delete already-purged backup env files.
- Do not commit real `.env`, `.env.local`, `.env.production`, or backup files.
- Preserve existing public APIs and component interfaces where possible.
- All new backend code must have unit tests.
- All frontend changes must pass `typecheck` and `build`.
- Frequent commits; push to `origin` (current pushable remote) after each task.

---

## Part A — Tasks requiring provider dashboard access (cannot be done in-repo)

These must be executed by someone with access to the relevant dashboards. They are listed separately because they block production deployment/verification but require no code changes.

| # | Task | Dashboard / action | Prerequisite |
|---|------|-------------------|--------------|
| A1 | **Rotate the leaked GitHub PAT** `[REDACTED — see GitHub Settings → Developer settings → Personal access tokens]` used to push to `GCEstack/gce-ai-casa-companion`. | GitHub Settings → Developer settings → Personal access tokens → delete + regenerate. | Owner access to the account that owns the PAT. |
| A2 | **Update canonical git remote URL** in local `.git/config` after PAT rotation. | Local git config or CLI: `git remote set-url origin https://github.com/GCEstack/gce-ai-casa-companion.git` (after A1). | A1 completed. |
| A3 | **Rotate `VOICE_SERVER_API_KEY`** and redeploy/update: `casa-voice-agent` Fly.io backend, `mobile` Vercel project (`VITE_VOICE_SERVER_API_KEY`), and `landing` Vercel project if it ever uses the voice backend. | Fly.io secrets + Vercel project env vars. | None. |
| A4 | **Clean up landing Vercel env vars:** remove all `VITE_*` variables from the landing project. Verify `NEXT_PUBLIC_API_URL` (or equivalent) points to the correct backend if used. | Vercel dashboard → landing project → Environment Variables. | None. |
| A5 | **Audit and delete stale Vercel projects:** `casa-companion-mobile`, `casa-redesign-temp`, `casa-redesign`, `casa-companion`, `ec4`, etc. | Vercel dashboard → Projects. | Confirm with team which projects are truly unused. |
| A6 | **E2E verify landing survey from production URL:** submit the form on the live landing domain and confirm the row appears in Supabase `survey_responses`. | Production landing URL + Supabase Table Editor. | In-repo survey route must be deployed first. |
| A7 | **Verify Fly.io deployment source-of-truth:** confirm `casa-voice-agent.fly.dev` is deployed from `voice/v3-dual` (not `voice/v3/backend`). | Fly.io dashboard + `fly.toml`/`Dockerfile` inspection. | Needed before porting pairing to `v3-dual`. |

---

## Part B — In-repo implementation tasks

### Task B1: Port phone-as-parent-microphone pairing to `voice/v3-dual`

**Files:**
- Create: `voice/v3-dual/src/casa_voice/pairing.py`
- Create: `voice/v3-dual/tests/test_pairing.py`
- Modify: `voice/v3-dual/main.py`
- Modify: `voice/v3-dual/fly.toml`

**Interfaces:**
- Consumes: existing `SessionManager`, `_sanitize_id`, `_sanitize_ws_id`, `_handle_voice_websocket` patterns from `main.py`.
- Produces: `PairingManager` with `create(...) -> Pairing`, `get(code)`, `get_by_token(token)`, cleanup; FastAPI endpoints `POST /api/pairing`, `GET /api/pairing/{code}`; WebSocket endpoint `/ws/voice/realtime/{device_id}`.

- [ ] **Step 1: Inspect legacy pairing implementation**
  Read `voice/v3/backend/app/pairing.py` (or equivalent) to understand the existing `PairingManager` shape and code alphabet.

- [ ] **Step 2: Write unit tests for pairing manager**
  Create `voice/v3-dual/tests/test_pairing.py` with tests for:
  - code generation length and character set
  - TTL expiration
  - token lookup
  - session-id lookup
  - collision resistance / uniqueness

- [ ] **Step 3: Implement `PairingManager`**
  Create `voice/v3-dual/src/casa_voice/pairing.py`:
  - `Pairing` dataclass with `code`, `session_id`, `join_token`, `character`, `mode`, `created_at`, `expires_at`.
  - Alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (6 chars).
  - TTL: 10 minutes.
  - Methods: `create`, `get`, `get_by_token`, `get_by_session_id`, `cleanup`.

- [ ] **Step 4: Wire pairing into FastAPI lifespan and add endpoints**
  Modify `voice/v3-dual/main.py`:
  - Import `PairingManager`.
  - Instantiate in lifespan and attach to `app.state.pairing_manager`.
  - Add `POST /api/pairing` returning `{ code, session_id, join_token, character, mode, expires_at }`.
  - Add `GET /api/pairing/{code}` returning pairing metadata or 404.
  - Add `"phone-mic-pairing"` to the `/health` `features` list.

- [ ] **Step 5: Add realtime WebSocket endpoint for paired phone mic**
  Modify `voice/v3-dual/main.py`:
  - Add `@app.websocket("/ws/voice/realtime/{device_id}")`.
  - Validate `token` and `session_id` against `pairing_manager.get_by_token`.
  - Use pairing's `character`/`mode` when creating/looking up the `VoiceSession`.
  - Reuse existing `_handle_voice_websocket` logic.

- [ ] **Step 6: Update CORS/origins comment in `fly.toml`**
  Add a comment marker for the parent-phone join origin if known.

- [ ] **Step 7: Run backend tests**
  Run:
  ```bash
  cd voice/v3-dual
  PYTHONPATH=src python -m pytest tests/test_pairing.py tests/test_commands.py tests/test_filler.py tests/test_main_validation.py -v
  ```
  Expected: all pass.

- [ ] **Step 8: Manual smoke test**
  Start backend locally, then:
  ```bash
  curl -X POST http://localhost:8080/api/pairing -H "Content-Type: application/json" -d '{"character":"drago","mode":"story"}'
  curl http://localhost:8080/api/pairing/{CODE}
  ```
  Verify WebSocket accepts valid token and rejects invalid token.

- [ ] **Step 9: Commit**
  ```bash
  git add voice/v3-dual/src/casa_voice/pairing.py voice/v3-dual/tests/test_pairing.py voice/v3-dual/main.py voice/v3-dual/fly.toml
  git commit -m "feat(voice): add phone-as-parent-mic pairing backend

- Add PairingManager with 6-char codes, 10-min TTL, join tokens
- Add POST /api/pairing and GET /api/pairing/{code}
- Add /ws/voice/realtime/{device_id} for paired phone audio clients
- Update /health features list"
  ```

---

### Task B2: Add parent-phone join surface in `apps/mobile`

**Files:**
- Create: `apps/mobile/src/pages/Pair.tsx`
- Create: `apps/mobile/src/hooks/usePairingVoice.ts`
- Create: `apps/mobile/src/components/PairingForm.tsx`
- Modify: `apps/mobile/src/App.tsx`
- Inspect: `apps/mobile/vite.config.ts`

**Interfaces:**
- Consumes: backend endpoints from B1 (`GET /api/pairing/{code}`, `POST /api/pairing` optional), WebSocket endpoint `/ws/voice/realtime/{device_id}`.
- Produces: `/pair?code=...` route that captures mic and streams PCM to the paired kid session.

- [ ] **Step 1: Inspect existing mobile audio hooks**
  Read `apps/mobile/src/hooks/useAudioWorklet.ts` and any existing voice hook to understand mic capture and PCM playback patterns.

- [ ] **Step 2: Create `usePairingVoice` hook**
  Create `apps/mobile/src/hooks/usePairingVoice.ts`:
  - Fetch pairing metadata by code.
  - Open WebSocket to `wss://<host>/ws/voice/realtime/{deviceId}?token={join_token}&session_id={session_id}&client_type=audio`.
  - Capture mic PCM16 @ 16kHz and send binary frames.
  - Play incoming PCM audio frames.
  - Expose `status`, `error`, `start(code)`, `stop()`.

- [ ] **Step 3: Create `PairingForm` component**
  Create `apps/mobile/src/components/PairingForm.tsx`:
  - 6-character code input.
  - Submit button that calls `start(code)`.

- [ ] **Step 4: Create `/pair` page**
  Create `apps/mobile/src/pages/Pair.tsx`:
  - Read `?code=...` from URL.
  - If code present, auto-start pairing.
  - Otherwise show `PairingForm`.
  - Show connection status, audio level indicator, mute/interrupt buttons.

- [ ] **Step 5: Add route in `App.tsx`**
  Add `<Route path="/pair" element={<Pair />} />`.

- [ ] **Step 6: Verify deep-linking works**
  Inspect `apps/mobile/vite.config.ts` and PWA config to ensure `/pair?code=...` is not swallowed by the SPA rewrite.

- [ ] **Step 7: Run typecheck and build**
  ```bash
  cd apps/mobile
  npm run typecheck
  npm run build
  ```
  Expected: pass.

- [ ] **Step 8: Commit**
  ```bash
  git add apps/mobile/src/pages/Pair.tsx apps/mobile/src/hooks/usePairingVoice.ts apps/mobile/src/components/PairingForm.tsx apps/mobile/src/App.tsx
  git commit -m "feat(mobile): add parent-phone join surface for pairing

- /pair route reads ?code= and connects as audio client to paired session
- usePairingVoice hook handles lookup, WebSocket, mic capture, playback
- PairingForm for manual code entry"
  ```

---

### Task B3: Merge kid-side relay UI from `phone-mic-pairing` branch

**Files:**
- Create/Modify: `web-revamp/src/components/PairingPanel.tsx`
- Create/Modify: `web-revamp/src/hooks/useRelayVoiceChat.ts`
- Create/Modify: `web-revamp/src/hooks/usePCMPlayback.ts`
- Modify: `web-revamp/src/types/index.ts`
- Modify: `web-revamp/src/context/AppContext.tsx`
- Modify: `web-revamp/src/sections/CenterStage.tsx`
- Modify: `web-revamp/src/pages/CharacterDetail.tsx`
- Modify: `web-revamp/package.json` (if `react-qr-code` needed)

**Interfaces:**
- Consumes: B1 backend endpoints and WebSocket; B2 parent join URL.
- Produces: kid-side UI that displays a pairing code/QR and switches to relay-mode voice chat.

- [ ] **Step 1: Inspect the `phone-mic-pairing` branch**
  Run `git diff main..phone-mic-pairing --stat` and read the key changed files.

- [ ] **Step 2: Port `PairingPanel.tsx` to `main`**
  - Update QR URL to the real parent join URL from B2.
  - Use `import.meta.env.VITE_BACKEND_HTTP_URL || 'https://casa-voice-agent.fly.dev'` for pairing API.

- [ ] **Step 3: Port `useRelayVoiceChat.ts` to `main`**
  - Ensure WebSocket uses `/ws/voice/realtime/{deviceId}` with `token`, `session_id`, `client_type=audio`, `character`.
  - Make it compatible with the current `web-revamp` state/actions.

- [ ] **Step 4: Port `usePCMPlayback.ts`**
  - Verify React 19 compatibility; adjust if needed.

- [ ] **Step 5: Add `connectionMode` state**
  - Add to `web-revamp/src/types/index.ts`.
  - Add reducer case in `web-revamp/src/context/AppContext.tsx`.
  - Add toggle in `web-revamp/src/sections/CenterStage.tsx`.

- [ ] **Step 6: Wire relay mode in `CharacterDetail.tsx`**
  - Show `PairingPanel` when `connectionMode === 'relay'` and no relay session.
  - Switch between local voice and relay voice.

- [ ] **Step 7: Add `react-qr-code` dependency if missing**
  Check `web-revamp/package.json` and add/install if needed.

- [ ] **Step 8: Run typecheck and build**
  ```bash
  cd web-revamp
  npm install
  npx tsc --noEmit
  npm run build
  ```
  Expected: pass.

- [ ] **Step 9: Commit**
  ```bash
  git add web-revamp/src/components/PairingPanel.tsx web-revamp/src/hooks/useRelayVoiceChat.ts web-revamp/src/hooks/usePCMPlayback.ts web-revamp/src/types/index.ts web-revamp/src/context/AppContext.tsx web-revamp/src/sections/CenterStage.tsx web-revamp/src/pages/CharacterDetail.tsx web-revamp/package.json web-revamp/package-lock.json
  git commit -m "feat(web-revamp): merge phone-mic-pairing relay UI

- Add PairingPanel with QR code pointing to mobile /pair route
- Add useRelayVoiceChat for parent-phone audio relay
- Add connectionMode toggle between local and relay audio"
  ```

---

### Task B4: Landing survey cleanup and verification prep

**Files:**
- Modify: `apps/landing/.env.example`
- Modify: `apps/landing/README.md`
- Inspect: `apps/landing/app/api/survey/route.ts`, `apps/landing/services/storage/supabase.ts`, `apps/landing/components/demo/SurveyForm.tsx`

**Interfaces:**
- No new interfaces. Cleanup only.

- [ ] **Step 1: Inspect landing survey code**
  Read the files listed above. Confirm `POST /api/survey` inserts into `survey_responses`.

- [ ] **Step 2: Remove stale VITE_* env vars from `.env.example`**
  Edit `apps/landing/.env.example` to remove any `VITE_SUPABASE_*` or `VITE_API_URL` lines that are not used by Next.js server code.

- [ ] **Step 3: Update README Supabase schema snippet**
  Ensure `apps/landing/README.md` schema matches the TypeScript `SurveyResponse` type (`email`, `child_age`, `interests`, `priorities`, `feedback` as `text`).

- [ ] **Step 4: Run typecheck and build**
  ```bash
  cd apps/landing
  npm install
  npx tsc --noEmit
  npm run build
  ```
  Expected: pass.

- [ ] **Step 5: Local E2E test (optional but recommended)**
  - Copy `.env.example` → `.env.local`, fill real Supabase credentials.
  - Run `npm run dev`, submit the survey, verify row appears in Supabase.

- [ ] **Step 6: Commit**
  ```bash
  git add apps/landing/.env.example apps/landing/README.md
  git commit -m "chore(landing): clean up survey env vars and docs

- Remove stale VITE_* placeholders from .env.example
- Align README Supabase schema with SurveyResponse type"
  ```

---

### Task B5: Update docs with canonical URLs and remotes

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`

**Interfaces:**
- None (documentation only).

- [ ] **Step 1: Fill in missing production URLs**
  Replace `<landing-project>` and `<web-revamp-project>` placeholders in `AGENTS.md` and `README.md` once known.

- [ ] **Step 2: Update Git remotes documentation**
  In `AGENTS.md`:
  - Keep `gcestack` as canonical upstream.
  - Keep `origin` as current pushable remote to `simplebalance89-ai/casa-companion` until A1/A2 are done.
  - Add note that PAT rotation is required to push to `GCEstack`.

- [ ] **Step 3: Add Supabase/Fly references**
  Add Fly.io backend URL and Supabase project reference if known.

- [ ] **Step 4: Verify no placeholders remain**
  Run:
  ```bash
  grep -n "TODO\|<landing-project>\|<web-revamp-project>" AGENTS.md README.md
  ```
  Expected: no matches.

- [ ] **Step 5: Commit**
  ```bash
  git add AGENTS.md README.md
  git commit -m "docs: fill canonical URLs and remote notes

- Add landing/web-revamp production URLs
- Document current vs canonical git remotes and PAT rotation requirement"
  ```

---

### Task B6: Add GitHub Action to guard against `NODE_ENV=production`

**Files:**
- Create: `.github/workflows/vercel-env-guard.yml`

**Interfaces:**
- None (CI only).

- [ ] **Step 1: Create the workflow**
  Create `.github/workflows/vercel-env-guard.yml`:
  - Trigger on `pull_request` and `push` to `main`.
  - Job scans all `vercel.json` files and committed `.env*` files (excluding `.env.example`) for `NODE_ENV=production`.
  - Fails with a clear error message if found.

- [ ] **Step 2: Validate the regex locally**
  Run a local scan:
  ```bash
  find . -name 'vercel.json' -not -path '*/node_modules/*' -exec grep -Hn '"NODE_ENV"[[:space:]]*:[[:space:]]*"production"' {} +
  find . -name '.env*' -not -path '*/node_modules/*' -not -name '.env.example' -exec grep -Hn '^NODE_ENV=production' {} +
  ```
  Expected: no matches.

- [ ] **Step 3: Commit**
  ```bash
  git add .github/workflows/vercel-env-guard.yml
  git commit -m "ci: add workflow to block NODE_ENV=production in Vercel configs

- Scans vercel.json and committed .env* files on PR/push
- Fails CI if NODE_ENV=production is found"
  ```

---

## Suggested execution order

1. **B6** (NODE_ENV guard) — small, independent, protects all later work.
2. **B5** (docs URLs/remotes) — independent, low risk.
3. **B4** (landing survey cleanup) — independent.
4. **B1** (backend pairing in `v3-dual`) — required before B2/B3.
5. **B2** (parent-phone join surface) — required before B3 QR URL.
6. **B3** (merge web-revamp kid-side UI) — depends on B1 + B2.
7. **A1–A7** (dashboard tasks) — rotate secrets, clean Vercel, verify production E2E.

B6, B5, B4, and B1 can be swarmed in parallel. B2 depends on B1. B3 depends on B1 and B2.

---

## Open questions / blockers to resolve before coding

1. **Which parent-phone URL should the kid-side QR code point to?** Decide between `apps/mobile` (`https://casa-mobile-main.vercel.app/pair?code=...`) and `web-revamp` (`https://<web-revamp>.vercel.app/pair?code=...`). This affects B2 and B3.
2. **Is `casa-voice-agent.fly.dev` currently deployed from `voice/v3-dual`?** Confirm via Fly dashboard (A7) before porting pairing.
3. **Should pairing state be multi-instance-safe from day one?** Current Fly config uses `min_machines_running = 1`, so in-memory is acceptable for a first cut, but the limitation must be documented.
4. **What are the canonical production URLs for landing and web-revamp?** Needed for B5 and the QR URL in B3.
5. **Does the landing Vercel project currently have `NODE_ENV=production` set?** If yes, remove it (A4) before any landing build verification.
