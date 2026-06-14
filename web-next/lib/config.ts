import { z } from "zod";

const envSchema = z.object({
  CLOUDFLARE_API_TOKEN: z.string().min(1, "CLOUDFLARE_API_TOKEN is required"),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1, "CLOUDFLARE_ACCOUNT_ID is required"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required for realtime voice"),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime-2"),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

function isBuildPhase() {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-export" ||
    process.env.NEXT_BUILD === "true"
  );
}

function loadEnv(): Env {
  if (typeof window !== "undefined") {
    throw new Error("config.ts should only be imported server-side");
  }
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    if (isBuildPhase()) {
      console.warn(`[config] Build-time env validation skipped: ${issues}`);
      return {
        CLOUDFLARE_API_TOKEN: "",
        CLOUDFLARE_ACCOUNT_ID: "",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_ANON_KEY: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
        OPENAI_API_KEY: "",
        OPENAI_REALTIME_MODEL: "gpt-realtime-2",
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      };
    }
    throw new Error(`Environment validation failed: ${issues}`);
  }
  return parsed.data;
}

export const config = loadEnv();

export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}
