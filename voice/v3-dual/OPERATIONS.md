# Operations Guide — Casa Voice V3-Dual

## Health & Metrics

- `GET /health` — returns 200 with provider status and active session count.
- `GET /metrics` — returns JSON counters: sessions created, messages received, errors, provider failures.
- Use these for load balancer health checks and basic monitoring.

## Key Environment Variables

```bash
# Required for speech/AI
GROQ_API_KEY=...                # STT + LLM
OPENAI_API_KEY=...              # TTS
# or
OPENROUTER_API_KEY=...          # STT + TTS + native audio
# or
GEMINI_API_KEY=...              # LLM (combine with GROQ or OpenRouter for STT)

# Optional persistence/scaling
REDIS_URL=redis://localhost:6379/0   # Enables Redis session + pairing stores
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...

# Security
VOICE_SERVER_API_KEY=...        # Protects WebSocket and admin endpoints
CORS_ALLOWED_ORIGINS=https://your-domain.com

# Azure
WEBSITES_PORT=8080              # Required for Azure App Service
```

## Redis for Scaling

Set `REDIS_URL` to:
- Share session history across server redeploys.
- Share pairing codes across multiple replicas.
- Reduce dependency on Supabase for hot session state.

Audio buffers and WebSocket handles remain in-process, so a reconnecting client will resume conversation history but not an in-flight utterance.

## Provider Resilience

All STT/LLM/TTS providers retry 3 times with exponential backoff (0.5s, 1s, 2s). If a provider is completely unavailable, the session returns a friendly error and returns to IDLE.

## Logs & Debugging

- All logs include the session/request ID prefix `[session_id/request_id]`.
- Set `LOG_LEVEL=DEBUG` for verbose provider and state-machine logs.
- Check `/metrics` for provider failure counts.

## Soak Testing

Run the included soak test against a local server:

```bash
python scripts/soak_test.py --url ws://localhost:8080/ws/voice --duration 300
```

For a real 2-month validation, run this for 7+ days and watch for:
- Memory growth
- File descriptor leaks
- Provider failure spikes
- Redis memory growth (if enabled)
