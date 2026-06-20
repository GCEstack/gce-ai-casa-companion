/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_VERCEL_ENV?: string;
  readonly VITE_VOICE_SERVER_URL?: string;
  readonly VITE_VOICE_SERVER_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
