# Azure Deployment Notes — Casa Voice V3-Dual

## Quick Checklist

1. **Container port:** Set `WEBSITES_PORT=8080` (Azure App Service) or expose 8080 (Container Apps).
2. **HTTPS / WebSocket:** The PWA uses `wss://` automatically when served over HTTPS. No code changes needed after the Phase 1 client fix.
3. **Enable WebSockets:** In Azure App Service → Configuration → General Settings → Web sockets: **On**.
4. **Keepalive:** Client and server already exchange ping/pong every 20 seconds to keep Azure proxies alive.
5. **Outbound network:** Allow outbound HTTPS to your provider endpoints (Groq, OpenAI, OpenRouter, Gemini, Supabase).
6. **Silero VAD:** Pre-baked into the Docker image; no runtime GitHub download needed.
7. **Persistent cache:** TTS cache lives on local disk by default. For multi-replica setups mount an Azure Files share at `/app/tts_cache` or switch to Redis/Blob in Phase 4.

## Environment Variables

```bash
# Required
WEBSITES_PORT=8080
GROQ_API_KEY=...
OPENAI_API_KEY=...
# or OPENROUTER_API_KEY=...

# Optional but recommended
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
VOICE_SERVER_API_KEY=...        # protects admin endpoints and WebSocket
CORS_ALLOWED_ORIGINS=https://your-domain.azurecontainerapps.io
```

## Known Azure Gotchas

- **WebSocket idle timeout:** Azure App Service drops idle WebSockets after ~230 s. The built-in 20 s ping/pong prevents this.
- **Sticky sessions:** Until session state is externalized to Redis (Phase 4), use a single replica or enable ARR affinity as a temporary band-aid.
- **Mixed content:** If you still see `ws://` errors in browser console, you are serving the page over HTTPS but loading an old client. Hard-refresh or redeploy.
