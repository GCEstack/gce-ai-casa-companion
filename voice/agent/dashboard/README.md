# Casa Companion Parent Dashboard

Next.js 14 parent dashboard for Casa Companion. Handles parent signup/login via Supabase Auth, verifiable parental consent via Stripe, device registration, medallion management, and live SSE status from the voice server.

---

## Stack

- **Framework:** Next.js 14 App Router, React 18, TypeScript 5
- **Styling:** Tailwind CSS 3.4
- **Auth/Database:** Supabase (Auth + PostgreSQL)
- **Payments:** Stripe (parental consent `$1` hold)
- **Deploy target:** Vercel

---

## Project Layout

```
dashboard/
├── app/
│   ├── api/                 # API routes (consent, devices, medallions, kill)
│   ├── dashboard/           # Logged-in parent dashboard
│   ├── login/               # Login page
│   ├── page.tsx             # Landing/redirect
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ConsentForm.tsx
│   ├── DashboardClient.tsx
│   └── LoginClient.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts        # Browser Supabase client
│   │   └── server.ts        # Server-side Supabase client
│   ├── casaProtocol.ts      # Voice server protocol helpers
│   └── useCasaWebSocket.ts  # SSE hook for live device status
├── middleware.ts            # Auth route protection
├── package.json
├── next.config.js
└── .env.example
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...

VOICE_SERVER_URL=https://casa-voice-agent.fly.dev
NEXT_PUBLIC_VOICE_SERVER_URL=https://casa-voice-agent.fly.dev
```

---

## Local Development

```bash
cd voice-agent/dashboard
npm install
npm run dev
```

Open `http://localhost:3000`.

---

## Deploy to Vercel

```bash
cd voice-agent/dashboard
vercel --prod
```

Then set the same environment variables in the Vercel dashboard.

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/consent/intent` | Create Stripe `$1` hold PaymentIntent |
| POST | `/api/consent/verify` | Mark parental consent verified |
| GET/POST | `/api/devices` | List / register devices |
| GET/POST | `/api/medallions` | List / register NFC medallions |
| POST | `/api/kill/[deviceId]` | Proxy kill switch to voice server |

---

## Security Notes

- Never commit `.env.local` or Stripe keys.
- `SUPABASE_SERVICE_ROLE_KEY` is server-side only.
- `NEXT_PUBLIC_VOICE_SERVER_URL` is used client-side for SSE; `VOICE_SERVER_URL` is used server-side for the kill proxy.
- Update the voice server `allow_origins` in `backend/app/main.py` to match your production Vercel domain.
