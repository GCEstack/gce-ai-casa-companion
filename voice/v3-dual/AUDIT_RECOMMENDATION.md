# Voice Agent Audit & Architecture Recommendation

**Date:** 2026-06-28
**Current Codebase Audited:** `C:/Users/Dekan AI Brother/Projects/ACTIVE/apps-platforms/casa-companion/voice/v3-dual`
**Design Document Audited:** `C:/Users/Dekan AI Brother/Desktop/04-Data/Downloads/Voice_AI_Architecture_for_Kids_FINAL.md`

---

## 1. Executive Summary

The current Casa Voice V3-Dual codebase is a **functionally mature, working voice companion** for children with a custom FastAPI/WebSocket pipeline, dual-mode clients, local wake-word detection, and thoughtful latency optimizations. It is already deployed/testable and ships with 67 passing unit tests.

The audited design document is a **vendor-forward, production-oriented architecture blueprint** built around Pipecat + Daily.co WebRTC, with heavy emphasis on COPPA compliance, child-specific STT, and sub-550ms latency. It is aspirational and proposes a phased build starting from an OpenAI Realtime prototype.

### Verdict

**Do not rewrite the current codebase into the proposed Pipecat stack wholesale.** The current system already implements many capabilities the design document treats as future work, and a ground-up rewrite would discard working, tested code. Instead, treat the design document as a **target-state reference** and adopt its strongest ideas selectively:

1. **Compliance & Safety:** Implement the design doc's 4-layer safety architecture and COPPA consent/data-retention controls. This is the biggest gap in the current codebase.
2. **STT Strategy:** Add a child-voice STT validation track (Deepgram Nova-3 vs. fine-tuned Whisper) and keep the current multi-provider STT abstraction.
3. **Transport Evolution:** Keep WebSocket for now, but pilot Daily.co WebRTC only if latency or packet-loss issues are observed in real usage.
4. **Provider Expansion:** Add Cartesia/ElevenLabs TTS options and OpenRouter/Gemini routing as recommended, using the existing provider factory.
5. **Hard Operational Debt First:** Fix repository hygiene, ESP32 hardcoded credentials, and in-memory session state before scaling.

---

## 2. Current Codebase Snapshot

| Dimension | Status |
|-----------|--------|
| **Stack** | Python 3.10+, FastAPI + WebSocket, vanilla HTML/JS PWA, ESP32-S3 firmware |
| **Size** | ~82 files, ~6,808 Python LOC, ~1,711 JS LOC, ~905 C LOC |
| **Tests** | 67 passing pytest tests |
| **Modes** | Mode A (browser mic/speaker), Mode B (phone/ESP32 as external audio), dashboard-only parent view |
| **Wake Word** | Porcupine v1.x local + STT fallback; always-listening + push-to-talk |
| **STT** | Groq Whisper, OpenRouter Whisper |
| **LLM** | Groq Llama 3.3 70B, Gemini 2.5 Flash, OpenRouter GPT-4o-mini fallback |
| **TTS** | OpenAI TTS-1, OpenRouter Gemini TTS |
| **Native Audio** | OpenRouter `gpt-audio-mini` quick-chat path |
| **VAD** | Energy gate + lazy-loaded Silero VAD |
| **Interrupt** | VAD-based barge-in + explicit commands + UI/phone/ESP32 buttons |
| **Persistence** | Supabase (conversation history + kid profile) |
| **Latency Optimizations** | Story prefill queue, filler phrases, sentence-level streaming TTS, TTS PCM cache, keyword compression |
| **Security** | Optional WS API key, admin-token endpoints, input sanitization, CORS allow-list, pairing codes with TTL |
| **Deployment** | Fly.io container, Windows PowerShell installer |

### Strengths
- Working end-to-end product with real hardware (ESP32) and phone integration.
- Strong product design: interest learning ("Voice Echo"), character voices, story queue, multi-client sessions.
- Modular provider abstraction makes STT/LLM/TTS swappable.
- Comprehensive feature set for a kids' companion: NFC taps, Bluetooth, Media Session API, screen wake lock.

### Weaknesses
- **Compliance & child safety are under-specified.** No COPPA consent flow, no content safety layer beyond basic input sanitization, no audit trail.
- **Operational/scaling debt:** in-memory session state, in-memory pairing, hardcoded ESP32 Wi-Fi credentials, repository hygiene issues.
- **Code quality debt:** module split via monkey-patching, large files, stringly typed env config, version/name inconsistencies.

---

## 3. Design Document Snapshot

| Dimension | Recommendation |
|-----------|----------------|
| **Stack** | Pipecat server + Daily.co WebRTC transport |
| **Prototype** | OpenAI Realtime API for weekend validation |
| **STT** | Deepgram Nova-3 (ages 8–10) / fine-tuned Whisper Small/Medium (ages 4–7) |
| **LLM** | OpenRouter gateway → Gemini 2.5 Flash-Lite/Flash/Pro, Groq Llama 3.1 8B fallback |
| **TTS** | Cartesia (chat), ElevenLabs (story), KidsStoryteller.ai (child voice), Kokoro (self-hosted) |
| **Safety** | 4-layer filter: input validation, prompt filter, Socratic enforcer, post-generation filter |
| **Compliance** | COPPA-first; verifiable parental consent, ZDR APIs, written retention policy, parent dashboard |
| **Latency Target** | ~400–550 ms end-to-end, <400 ms actual target for kids |
| **Interaction** | Tap-to-talk (not always-listening) |
| **Roadmap** | 4 phases: prototype → STT validation → production build → scale/optimize |

### Strengths
- Strong child-specific STT analysis and vendor selection rationale.
- Clear latency budget and cost model.
- COPPA compliance architecture is the central organizing principle.
- Pragmatic phased approach with low-cost validation first.

### Weaknesses
- **Aspirational, not implemented.** Many recommendations (e.g., fine-tuned Whisper, ZDR DPAs, Daily.co production run) require significant validation work.
- **GDPR-K and state-level privacy laws are under-treated.**
- **Relies heavily on prompt-based safety**, which is brittle against adversarial or confused child inputs.
- **Operational detail is sparse:** no CI/CD, secrets management, incident response, observability, or data residency plan.
- **Some claims need legal verification**, especially around "April 2026 COPPA rules."

---

## 4. Detailed Comparison

### 4.1 Architecture Pattern

| Aspect | Current Codebase | Design Document | Assessment |
|--------|------------------|-----------------|------------|
| **Transport** | WebSocket over HTTP/1.1 or HTTP/2 | Daily.co WebRTC | WebRTC has lower latency and better packet-loss handling, but the current WebSocket implementation is already working and simpler to operate. |
| **Pipeline Framework** | Custom FastAPI + asyncio | Pipecat (Apache 2.0) | Pipecat would reduce custom orchestration code, but migration is non-trivial and discards tested logic. |
| **Interaction Model** | Always-listening wake-word + push-to-talk + tap | Tap-to-talk only | Current system is more flexible; design doc's tap-to-talk is simpler and more COPPA-friendly. |
| **Client Types** | Browser PWA, phone-as-audio-device, ESP32 | Browser, mobile native, Bluetooth hardware | Current already supports external audio hardware; design doc assumes mobile apps. |

**Recommendation:** Keep the current WebSocket transport and custom pipeline. Run a **time-boxed Pipecat/Daily.co spike** (1 week) only if real-world testing reveals WebSocket latency/packet-loss issues above the 400 ms target.

### 4.2 Speech-to-Text

| Aspect | Current Codebase | Design Document | Assessment |
|--------|------------------|-----------------|------------|
| **Default STT** | Groq Whisper / OpenRouter Whisper | Deepgram Nova-3 or fine-tuned Whisper | Design doc correctly identifies child STT as the highest-risk technical decision. |
| **Child-specific tuning** | None | Fine-tuned Whisper Small/Medium (LoRA) | Major gap in current system. |
| **Wake word** | Local Porcupine + STT fallback | Tap-to-talk avoids wake word | Current wake word enables hands-free use; design doc prioritizes privacy. |
| **On-device STT** | ESP32 only streams audio; no on-device STT | Recommended where possible | Could reduce cloud audio exposure but adds hardware complexity. |

**Recommendation:** Add **Deepgram Nova-3** and a **fine-tuned Whisper fallback path** behind the existing provider factory. Run the design doc's Phase 1 STT validation with real child voices before committing to one path. Keep Porcupine wake word as an optional mode for hands-free use, but make tap-to-talk the default for COPPA alignment.

### 4.3 Large Language Model

| Aspect | Current Codebase | Design Document | Assessment |
|--------|------------------|-----------------|------------|
| **Routing** | Provider priority based on available API keys | Intent-based router (simple QA, story, math, language) | Design doc's intent router is more sophisticated and cost-optimal. |
| **Models** | Groq Llama 3.3 70B, Gemini 2.5 Flash, GPT-4o-mini | Gemini 2.5 Flash-Lite/Flash/Pro, Groq Llama 3.1 8B | Current models are comparable; design doc adds Flash-Lite for ultra-cheap simple QA. |
| **Socratic math** | Not explicit | Dedicated Socratic prompt + output validation | Current system would benefit from this for educational use cases. |
| **Native audio** | OpenRouter `gpt-audio-mini` quick-chat | Not discussed | Current system has an experimental native-audio path the design doc does not cover. |

**Recommendation:** Implement an **intent router** in the existing `providers/factory.py` or a new `providers/router.py` that sends simple QA to Gemini Flash-Lite, storytelling to Gemini Flash, math to Gemini Pro with Socratic validation, and language learning to Gemini Flash. Keep Groq as fallback. Keep the native-audio quick-chat path as an experimental low-latency option.

### 4.4 Text-to-Speech

| Aspect | Current Codebase | Design Document | Assessment |
|--------|------------------|-----------------|------------|
| **Providers** | OpenAI TTS-1, OpenRouter Gemini TTS | Cartesia, ElevenLabs, KidsStoryteller.ai, Kokoro | Design doc has richer voice options, especially for stories and child voices. |
| **Caching** | On-disk PCM cache by SHA-256 | Mentioned as Phase 3 optimization | Current system already does this; preserve it. |
| **Streaming** | Sentence-level streaming | Sentence-level streaming | Both align. |
| **Character voices** | Character router with Gemini audio tags | Not explicit | Current character system is a product strength. |

**Recommendation:** Add **Cartesia** for chat and **ElevenLabs** for storytelling behind the existing provider factory. Evaluate **KidsStoryteller.ai** if a genuine child narrator is a product requirement. Keep the current TTS cache and character router.

### 4.5 Safety, Privacy, Compliance

| Aspect | Current Codebase | Design Document | Assessment |
|--------|------------------|-----------------|------------|
| **COPPA consent flow** | None | Verifiable parental consent (credit card / ID / video) | Critical gap. |
| **Content safety** | Basic input sanitization, optional WS key | 4-layer filter + Azure Content Safety | Critical gap. |
| **Data retention** | Supabase retains history; no policy enforced | 30-day max, ZDR APIs, written policy | Critical gap. |
| **Parent dashboard** | Dashboard view exists but limited | Full history, controls, consent management | Current dashboard can be extended. |
| **Audit trail** | None | COPPA audit trail | Critical gap. |
| **Socratic enforcement** | Not explicit | Prompt + output validation | Important for educational integrity. |

**Recommendation:** This is the **highest-priority adoption area**. Implement the design doc's 4-layer safety architecture and COPPA compliance controls before any major scaling. Specifically:

1. Add Azure Content Safety (or equivalent) for input/output filtering.
2. Build verifiable parental consent flow and separate consent for analytics/AI training.
3. Enforce written data retention policy: delete audio immediately after transcription, cap transcript retention at 30 days, offer parent-initiated deletion.
4. Add COPPA audit trail logging admin/parent actions.
5. Add Socratic output validation for math mode.
6. Consult legal counsel to verify current COPPA/GDPR-K obligations.

### 4.6 Latency & Performance

| Aspect | Current Codebase | Design Document | Assessment |
|--------|------------------|-----------------|------------|
| **Latency target** | Not explicitly budgeted | 400–550 ms E2E | Design doc provides a useful benchmark. |
| **Optimizations** | Filler generator, story queue, TTS cache, keyword compression, streaming | Preemptive generation on partial STT, caching | Current system has more latency-masking features; design doc has cleaner preemptive generation idea. |
| **Transport latency** | WebSocket overhead | WebRTC 13 ms first-hop | WebRTC wins on transport latency. |
| **Scalability** | In-memory sessions, not horizontally scalable | Pipecat/Daily.co more scalable | Current system needs state externalization to scale. |

**Recommendation:** Instrument end-to-end latency per turn and compare against the 400 ms target. Keep current optimizations. Add **preemptive LLM generation on partial STT transcripts** as an optional mode. Defer WebRTC migration unless latency data proves WebSocket is the bottleneck.

### 4.7 Operational Maturity

| Aspect | Current Codebase | Design Document | Assessment |
|--------|------------------|-----------------|------------|
| **CI/CD** | None visible | Not specified | Both need work. |
| **Tests** | 67 pytest tests | Not specified | Current codebase has a head start. |
| **Secrets mgmt** | `.env` based, hygiene issues noted | Not specified | Both need improvement. |
| **Horizontal scaling** | Blocked by in-memory state | Better with Pipecat/Daily.co | Current needs state externalization. |
| **Observability** | Unified DEBUG log stream | Not specified | Current needs structured telemetry. |
| **Deployment** | Fly.io, Windows PowerShell scripts | Not specified | Current has deployable artifacts. |

**Recommendation:** Before adopting any new architecture, fix current operational debt: externalize session state to Redis/Supabase, purge committed secrets, add lint/format CI, and add structured per-step telemetry.

---

## 5. Strategic Recommendations

### 5.1 Do Not Rewrite (Preserve Current Codebase)

The current codebase is not a prototype; it is a working system with real users/features. A rewrite into Pipecat would:

- Discard 67 tests and working phone/ESP32 integration.
- Introduce new dependencies (Daily.co, Pipecat) with their own operational and cost risks.
- Delay shipping compliance/safety improvements, which are the actual highest risks.

### 5.2 Adopt the Design Doc's Compliance & Safety Architecture First

This is the single most valuable transfer from the design document. It directly addresses the current codebase's biggest liability.

### 5.3 Run a Child STT Validation Track

The design document is correct that child STT is the highest technical risk. Use the existing provider factory to A/B test:

- Groq Whisper (current default)
- Deepgram Nova-3
- Fine-tuned Whisper Small/Medium on child datasets

Make the decision data-driven with real child testers.

### 5.4 Evolve Providers Incrementally

Add Cartesia/ElevenLabs TTS and Gemini Flash-Lite/Pro routing behind the existing provider abstraction. This is low-risk and preserves current functionality.

### 5.5 Keep WebSocket, Pilot WebRTC Selectively

WebRTC is not free: it adds Daily.co cost, complexity, and a hard dependency. Pilot it only if measured latency or reliability justifies it.

### 5.6 Fix Operational Debt Before Scaling

- Externalize session state.
- Fix repository hygiene and hardcoded credentials.
- Add CI, linting, and structured telemetry.

---

## 6. Proposed Adoption Roadmap

### Phase 1: Safety & Compliance Foundation (2–3 weeks)
- [ ] Engage legal counsel to confirm COPPA/GDPR-K obligations.
- [ ] Implement verifiable parental consent flow.
- [ ] Add Azure Content Safety (or equivalent) input/output filtering.
- [ ] Add Socratic output validator for math mode.
- [ ] Implement written data retention policy and parent deletion controls.
- [ ] Add COPPA audit trail logging.

### Phase 2: Provider Expansion & STT Validation (2–4 weeks)
- [ ] Add Deepgram Nova-3 STT provider.
- [ ] Add Cartesia and ElevenLabs TTS providers.
- [ ] Implement intent-based LLM routing.
- [ ] Run child STT A/B test (Groq vs Deepgram vs fine-tuned Whisper).
- [ ] Set default to tap-to-talk; keep wake-word as optional.

### Phase 3: Operational Hardening (2–3 weeks)
- [ ] Externalize session state to Redis or Supabase Realtime.
- [ ] Externalize pairing state.
- [ ] Purge committed secrets and hardcoded ESP32 Wi-Fi credentials.
- [ ] Add CI (ruff/black/pytest).
- [ ] Add structured latency/usage telemetry.

### Phase 4: Optional Architecture Spike (1–2 weeks, gated)
- [ ] Only if WebSocket latency > 400 ms in production: build Pipecat + Daily.co WebRTC spike.
- [ ] Compare latency, cost, reliability, and operational burden.
- [ ] Make rewrite/no-rewrite decision based on spike data.

---

## 7. Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Current code ships without child safety controls | High | Phase 1 compliance work before any user growth. |
| Child STT accuracy is poor | High | Phase 2 A/B testing with real child voices. |
| In-memory state blocks scaling | Medium | Phase 3 externalization. |
| WebRTC migration becomes a distraction | Medium | Gate on measured WebSocket latency. |
| Vendor lock-in / price changes | Medium | Maintain multi-provider abstraction. |
| Legal claims in design doc are inaccurate | Medium | Verify all compliance claims with counsel. |

---

## 8. Conclusion

The current Casa Voice V3-Dual codebase is a **strong, working foundation**. The audited design document is a **valuable target-state reference**, especially for compliance, safety, and child-specific STT. The right path forward is **selective adoption**, not replacement.

**Priority order:**
1. Child safety & COPPA compliance (from design doc).
2. Child STT validation and provider expansion.
3. Operational hardening of the existing codebase.
4. WebRTC/Pipecat migration only if data proves it necessary.

This approach preserves working code and tests, reduces risk, and delivers the most important improvements fastest.
