# Casa Companion — Mobile PWA

A progressive web app for kids (and grown-ups) to chat with Casa Companion characters using real voice. Built with **Vite + React + TypeScript + Tailwind CSS** and packaged as an installable PWA.

## Live Deployments

| App | URL | Personalization |
|-----|-----|-----------------|
| Main | https://web-mobile-omega-sable.vercel.app | Full 46-character roster |
| Peter | https://web-mobile-peter.vercel.app | `pietro` featured; `pietro,leone,drago,trex,volpe,ninja_cat` enabled |
| Liam | https://web-mobile-liam.vercel.app | `tartaruga` featured; `tartaruga,corvo,veloce,jack` enabled |
| Jimmy | https://web-mobile-jimmy.vercel.app | `papa` featured; `papa,rocco,sacco` enabled |
| Jenny | https://web-mobile-jenny.vercel.app | `agenda` featured; `agenda,scheletro,dottore,maestra,bella` enabled |

## Features

- **Character roster** — 46 plush companions, each with a portrait, idle/speaking videos, accent color, personality prompt, and generated intro voice line.
- **Voice chat** — tap the mic, speak, and the character responds out loud.
- **Personalized builds** — per-user/child builds that filter the roster and feature a specific character via environment variables.
- **Favorites** — heart your go-to companions and find them quickly on `/favorites`.
- **Hands-free wake commands** — say “Hello Casa” or “Hey Casa” to start the mic, and “End Casa” to stop. Uses the browser’s built-in SpeechRecognition.
- **Browser-speech input toggle** — if Deepgram is blocked on your network, switch to browser SpeechRecognition for speech-to-text.
- **Settings** — active mode selector, mic & voice toggles, STT provider, wake-word listening, wake phrases, usage today, parental controls (time cap + PIN + lock now), local API keys, and reset app data.
- **PWA install** — add to home screen, offline-capable after first visit.
- **Error monitoring** — Sentry React SDK with tracing, session replay (text masked / media blocked), and voice-pipeline error logging.

## Voice Pipeline

| Step | Provider | Notes |
|------|----------|-------|
| Speech-to-text | **Deepgram** (`nova-2`) or **browser SpeechRecognition** | Deepgram by default; browser speech can be enabled in Settings or auto-switched after a failed Deepgram call |
| Language model | **OpenAI** (`gpt-4o-mini`) | Per-character system prompt + current mode instruction |
| Text-to-speech | **OpenAI** (`tts-1`) | Per-character OpenAI voice; falls back to browser speech synthesis on failure |

## Tech Stack

- [Vite](https://vitejs.dev/) — build tool
- [React 18](https://react.dev/) — UI
- [TypeScript](https://www.typescriptlang.org/) — type safety
- [Tailwind CSS](https://tailwindcss.com/) — styling
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) — service worker + manifest
- [Lucide React](https://lucide.dev/) — icons
- [React Router v7](https://reactrouter.com/) — routing
- [Sentry React SDK](https://docs.sentry.io/platforms/javascript/guides/react/) — error monitoring, tracing, replay

## Project Structure

```
web-mobile/
├── public/
│   ├── characters/        # Character portraits/showcases (resized PNGs)
│   ├── videos/            # idle/speaking loops for each character
│   ├── audio/characters/  # Generated intro voice files
│   ├── icons/             # PWA icons
│   └── manifest.json      # PWA manifest
├── scripts/
│   ├── sentry-monitor.mjs        # Polls Sentry for new issues
│   ├── audit_characters.mjs      # Roster/intro asset audit
│   ├── generate-character-voices.mjs
│   ├── generate-voice-directions.mjs
│   └── add-new-characters.mjs
├── src/
│   ├── components/        # UI components (CharacterCard, MicButton, etc.)
│   ├── hooks/
│   │   └── useVoiceChat.ts     # Deepgram + OpenAI voice pipeline
│   ├── lib/
│   │   ├── characters.ts       # Character data
│   │   ├── characterConfig.ts  # Per-character prompts + OpenAI voices
│   │   ├── characterVideos.ts  # Video file resolver
│   │   ├── characterVoices.ts  # Browser TTS voice settings
│   │   ├── personalization.ts  # Build-time roster filtering
│   │   └── settings.ts         # localStorage settings + favorites
│   ├── pages/
│   │   ├── Landing.tsx
│   │   ├── CharacterDetail.tsx
│   │   ├── Favorites.tsx
│   │   └── Settings.tsx
│   ├── instrument.ts      # Sentry init (must run before React)
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── index.html
├── package.json
├── tailwind.config.js
├── vite.config.ts         # Hidden source maps + conditional Sentry upload plugin
├── vercel.json            # SPA rewrites + asset caching
└── README.md
```

## Environment Variables

Create a `.env` file in `web-mobile/` or set them in your hosting dashboard. Never commit `.env` or `.env.local`.

### Runtime / build variables

| Variable | Purpose | Required? |
|----------|---------|-----------|
| `VITE_OPENAI_API_KEY` | OpenAI chat + TTS API key | Optional if users paste key in Settings |
| `VITE_DEEPGRAM_API_KEY` | Deepgram STT API key | Optional if users paste key in Settings |
| `VITE_GROQ_API_KEY` | Groq API key (legacy hook support) | Optional |
| `VITE_SENTRY_DSN` | Sentry DSN for error monitoring | Optional; SDK disabled if missing |
| `VITE_APP_VERSION` | App version used for Sentry `release` | Optional; falls back to `0.0.0` |
| `VITE_VERCEL_ENV` | Environment label for Sentry | Optional; falls back to `import.meta.env.MODE` |

### Personalization variables (per-child builds)

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_USER_NAME` | Child’s first name, used in prompts | `Liam` |
| `VITE_ENABLED_CHARACTERS` | Comma-separated slugs visible to this child | `tartaruga,corvo,veloce,jack` |
| `VITE_FEATURED_CHARACTER` | Slug shown as the main companion | `tartaruga` |

Users can also enter API keys directly in the app's **Settings** page. Keys are stored in `localStorage` only.

### Source-map upload variables (optional)

| Variable | Purpose |
|----------|---------|
| `SENTRY_AUTH_TOKEN` | Sentry auth token for `sentryVitePlugin` |
| `SENTRY_ORG` | Sentry organization slug |
| `SENTRY_PROJECT` | Sentry project slug |

The Vite plugin only activates when all three are present, so builds still work without them.

## Local Development

```bash
# From the web-mobile directory
cd casa-companion-master/web-mobile

# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Run the Sentry issue monitor (requires SENTRY_AUTH_TOKEN)
npm run monitor:sentry
```

## Deployment

This project deploys to **Vercel**. Each personalized app is the same codebase deployed to a different Vercel project with different env vars.

```bash
# Deploy the main app
npx vercel --project web-mobile --prod

# Deploy a personalized build (example: Liam)
npx vercel --project web-mobile-liam --prod \
  -b VITE_USER_NAME=Liam \
  -b VITE_ENABLED_CHARACTERS=tartaruga,corvo,veloce,jack \
  -b VITE_FEATURED_CHARACTER=tartaruga
```

The included `vercel.json` routes all paths to `index.html` so React Router deep links work.

## Sentry Monitoring

- Errors are captured automatically via the React SDK + `ErrorBoundary`.
- Voice-pipeline errors (mic, Deepgram, OpenAI, TTS, playback) are logged with context.
- `scripts/sentry-monitor.mjs` can poll Sentry for new issues.
- Source-map upload is configured in `vite.config.ts` and will activate once `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are available.

## Asset Optimization

To keep the PWA cache reasonable:

- Videos are limited to `*_idle.mp4` and `*_speaking.mp4` loops (no clip/final variants).
- Character PNGs are resized to 512×512 and optimized.
- Unused character assets are removed from `public/characters/`.

## PWA Cache Size

Current precache is approximately **150+ MB** (idle/speaking videos + character images + audio intros). The service worker skips precaching files over 50 MB individually.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "OpenAI API key missing" | Add `VITE_OPENAI_API_KEY` env var or paste key in Settings |
| "Deepgram API key missing" | Add `VITE_DEEPGRAM_API_KEY` env var or paste key in Settings |
| "Deepgram connection error" | Make sure the Deepgram key has no BOM/whitespace; the app strips BOMs automatically |
| `Failed to fetch (api.deepgram.com)` / `net::ERR_FAILED` | Deepgram may be blocked on your network. The app auto-switches to browser speech after one failure, or you can toggle **Use browser speech for input** in Settings |
| Character speaks but no audio | Check OpenAI TTS key and browser autoplay permissions |
| Old version still showing | Clear site data / app storage and reload; or tap **Clear All Data** in Settings |
| Mic not working | Grant microphone permission in browser/OS settings |
| Character page 404s | Ensure `vercel.json` rewrites are deployed |

## License

This project is part of the Casa Companion monorepo. See the root repository for licensing details.
