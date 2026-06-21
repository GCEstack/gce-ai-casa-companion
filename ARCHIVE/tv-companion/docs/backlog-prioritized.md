# Casa Companion — Prioritized Backlog

**Repo:** `https://github.com/simplebalance89-ai/casa-companion`  
**Commit:** `491239a`  
**Date:** June 14, 2026  
**Total Items:** 47  

---

## P0 — Critical (Fix This Week)

| Priority | Task | Category | Effort | Blockers | Owner |
|---|---|---|---|---|---|
| P0 | Restrict CORS from `allow_origins=["*"]` to known domains | SECURITY | 2h | None | Backend Dev |
| P0 | Rotate exposed Azure API key in `ask_azure_gpt4o.py:13` | SECURITY | 1h | None | Backend Dev |
| P0 | Remove hardcoded API key fallback from `ask_azure_gpt4o.py` | SECURITY | 1h | CR-003 rotation | Backend Dev |
| P0 | Add API key authentication to all non-public endpoints | SECURITY | 1d | CR-001 CORS fix | Backend Dev |
| P0 | Add rate limiting to `/api/voice/token` endpoint | SECURITY | 2h | None | Backend Dev |
| P0 | Add `.dockerignore` to exclude `.git`, tests, dev files | INFRA | 30m | None | DevOps |
| P0 | Pin dependency versions in `requirements.txt` | RELIABILITY | 2h | None | Backend Dev |

---

## P1 — High (Fix This Sprint)

| Priority | Task | Category | Effort | Blockers | Owner |
|---|---|---|---|---|---|
| P1 | Implement API key authentication on all protected endpoints | SECURITY | 1d | P0 CORS fix | Backend Dev |
| P1 | Add `gunicorn` + multi-worker config to Dockerfile | PERFORMANCE | 4h | None | DevOps |
| P1 | Create module-level `httpx.AsyncClient` with connection pooling | PERFORMANCE | 4h | None | Backend Dev |
| P1 | Run Dockerfile as non-root user | SECURITY | 2h | None | DevOps |
| P1 | Add structured JSON logging with `structlog` | RELIABILITY | 1d | None | Backend Dev |
| P1 | Integrate Sentry for error tracking | RELIABILITY | 4h | P1 structured logging | Backend Dev |
| P1 | Add PostgreSQL/SQLAlchemy for conversations and surveys | SCALABILITY | 3d | None | Backend Dev |
| P1 | Add Alembic migrations for database schema | SCALABILITY | 1d | P1 PostgreSQL | Backend Dev |
| P1 | Replace in-memory error log with persistent storage | RELIABILITY | 1d | P1 PostgreSQL | Backend Dev |
| P1 | Add request ID middleware for distributed tracing | RELIABILITY | 4h | None | Backend Dev |
| P1 | Add proper health check (test Azure connectivity) | RELIABILITY | 2h | None | Backend Dev |
| P1 | Implement input validation for character/mode keys | SECURITY | 4h | None | Backend Dev |
| P1 | Add session timeout and cleanup for WebRTC connections | RELIABILITY | 1d | None | Backend Dev |

---

## P2 — Medium (Next 2-4 Weeks)

| Priority | Task | Category | Effort | Blockers | Owner |
|---|---|---|---|---|---|
| P2 | Split `server.py` into modular routers (characters, chat, voice, survey) | DX | 2d | None | Backend Dev |
| P2 | Add `pydantic-settings` for environment configuration | DX | 1d | None | Backend Dev |
| P2 | Implement chat response streaming (SSE) | PERFORMANCE | 2d | P1 connection pooling | Backend Dev |
| P2 | Add lazy loading for character images (`loading="lazy"`) | PERFORMANCE | 2h | None | Frontend Dev |
| P2 | Add `srcset` for responsive character images | PERFORMANCE | 4h | None | Frontend Dev |
| P2 | Migrate frontend to Vite + modular JS structure | DX | 1w | None | Frontend Dev |
| P2 | Add unit tests with mocked Azure APIs (pytest + respx) | RELIABILITY | 3d | P2 modular structure | Backend Dev |
| P2 | Add frontend tests (Vitest or Jest) | RELIABILITY | 3d | P2 Vite migration | Frontend Dev |
| P2 | Add e2e tests with Playwright | RELIABILITY | 3d | P2 unit tests | QA/Dev |
| P2 | Add GitHub Actions CI/CD pipeline | DX | 2d | P2 tests | DevOps |
| P2 | Add Content Security Policy headers | SECURITY | 4h | P0 auth implemented | Backend Dev |
| P2 | Add HSTS and HTTPS redirect | SECURITY | 2h | None | DevOps |
| P2 | Add user-based rate limiting (per API key instead of IP) | SECURITY | 1d | P1 API auth | Backend Dev |
| P2 | Add Redis caching for frequent responses | PERFORMANCE | 2d | P1 PostgreSQL | Backend Dev |
| P2 | Add ARIA labels and roles to all interactive elements | UX | 2d | None | Frontend Dev |
| P2 | Add keyboard navigation support | UX | 2d | P2 ARIA | Frontend Dev |
| P2 | Add `prefers-reduced-motion` support for particles | UX | 4h | None | Frontend Dev |
| P2 | Remove `user-scalable=no` from viewport meta | UX | 30m | None | Frontend Dev |
| P2 | Add offline.html fallback page | UX | 2h | None | Frontend Dev |
| P2 | Implement virtual scrolling for character grid | PERFORMANCE | 1d | None | Frontend Dev |
| P2 | Add parent dashboard API endpoints | UX | 2d | P1 PostgreSQL | Backend Dev |

---

## P3 — Low (Backlog / Nice-to-Have)

| Priority | Task | Category | Effort | Blockers | Owner |
|---|---|---|---|---|---|
| P3 | Add Web Push notification support | UX | 2d | P2 PWA improvements | Frontend Dev |
| P3 | Implement Background Sync for offline survey submission | UX | 1d | P2 PWA | Frontend Dev |
| P3 | Add OpenAPI/Swagger documentation annotations | DX | 1d | P2 modular structure | Backend Dev |
| P3 | Create deployment runbook (`docs/deployment.md`) | DX | 4h | None | DevOps |
| P4 | Create character onboarding guide (`docs/characters.md`) | CONTENT | 4h | None | Product |
| P3 | Add Prometheus metrics endpoint | INFRA | 1d | None | DevOps |
| P3 | Add Grafana dashboards for monitoring | INFRA | 2d | P3 Prometheus | DevOps |
| P3 | Set up uptime monitoring (Pingdom/UptimeRobot) | INFRA | 2h | None | DevOps |
| P3 | Add CDN (CloudFlare) for static assets | PERFORMANCE | 1d | None | DevOps |
| P3 | Implement response caching for common chat queries | PERFORMANCE | 2d | P2 Redis | Backend Dev |
| P3 | Add semantic memory with vector DB (Pinecone/pgvector) | SCALABILITY | 1w | P1 PostgreSQL | ML Eng |
| P3 | Voice cloning integration (ElevenLabs) | CONTENT | 3d | None | ML Eng |
| P3 | Multi-language UI support (i18n) | UX | 3d | P2 Vite migration | Frontend Dev |
| P3 | Dark/light theme toggle | UX | 1d | None | Frontend Dev |
| P3 | Add `SECURITY.md` and vulnerability reporting process | SECURITY | 2h | None | Product |
| P3 | Implement data retention policy for survey responses | SECURITY | 1d | P1 PostgreSQL | Backend Dev |
| P3 | Add Core Web Vitals monitoring (web-vitals library) | PERFORMANCE | 4h | None | Frontend Dev |
| P3 | Bundle analysis and optimization | PERFORMANCE | 1d | P2 Vite migration | Frontend Dev |

---

## Summary by Category

| Category | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| SECURITY | 4 | 3 | 3 | 1 | **11** |
| PERFORMANCE | 0 | 2 | 5 | 3 | **10** |
| RELIABILITY | 0 | 6 | 3 | 0 | **9** |
| SCALABILITY | 0 | 3 | 2 | 1 | **6** |
| DX | 1 | 0 | 4 | 2 | **7** |
| UX | 0 | 0 | 6 | 4 | **10** |
| INFRA | 2 | 1 | 0 | 4 | **7** |
| CONTENT | 0 | 0 | 1 | 2 | **3** |
| **TOTAL** | **7** | **15** | **24** | **17** | **63** |

---

## Recommended Sprint Schedule

### Sprint 1 (Week 1): Security Lockdown
- P0: CORS restriction, API key rotation, key removal
- P0: `.dockerignore`, version pinning
- P1: API authentication implementation
- P1: Voice token rate limiting
- P1: Dockerfile non-root user + gunicorn

**Deliverable:** All endpoints require authentication; CORS restricted; no exposed secrets.

### Sprint 2 (Week 2-3): Backend Hardening
- P1: Connection pooling with shared httpx client
- P1: Structured logging + Sentry
- P1: PostgreSQL + Alembic setup
- P1: Persistent error logging
- P1: Request ID middleware
- P1: Session timeout for WebRTC

**Deliverable:** Production-grade backend with observability and persistent storage.

### Sprint 3 (Week 4-5): Frontend Modernization
- P2: Vite migration + modular JS
- P2: Lazy loading for images
- P2: ARIA labels + keyboard navigation
- P2: Accessibility improvements

**Deliverable:** Maintainable frontend with WCAG AA compliance.

### Sprint 4 (Week 6-7): Testing & CI/CD
- P2: Unit tests with mocked APIs
- P2: Frontend tests
- P2: Playwright e2e tests
- P2: GitHub Actions pipeline

**Deliverable:** Automated test suite running on every PR.

### Sprint 5 (Week 8+): Performance & Scale
- P2: Chat streaming (SSE)
- P2: Redis caching
- P3: CDN setup
- P3: Prometheus + Grafana

**Deliverable:** Sub-second response times, horizontal scaling readiness.
