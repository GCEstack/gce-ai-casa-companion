import { config } from "@/lib/config";

export interface RealtimeTokenResult {
  token: string;
  expires_at?: number;
  error?: string;
}

export async function createRealtimeSession(voice: string): Promise<RealtimeTokenResult> {
  const url = "https://api.openai.com/v1/realtime/client_secrets";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": "casa-companion-session",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: config.OPENAI_REALTIME_MODEL,
          audio: {
            output: { voice },
          },
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { token: "", error: `OpenAI realtime session error ${res.status}: ${text}` };
    }

    const data = (await res.json()) as {
      id?: string;
      client_secret?: { value: string; expires_at: number };
      value?: string;
      expires_at?: number;
    };

    const token = data.client_secret?.value || data.value || "";
    const expires_at = data.client_secret?.expires_at || data.expires_at;

    if (!token) {
      return { token: "", error: "No ephemeral token returned" };
    }

    return { token, expires_at };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { token: "", error: msg };
  }
}

export async function exchangeRealtimeSdp(offerSdp: string, voice: string): Promise<Response> {
  const url = `https://api.openai.com/v1/realtime/calls`;

  const sessionConfig = JSON.stringify({
    type: "realtime",
    model: config.OPENAI_REALTIME_MODEL,
    audio: { output: { voice } },
  });

  const form = new FormData();
  form.set("sdp", offerSdp);
  form.set("session", sessionConfig);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      "OpenAI-Safety-Identifier": "casa-companion-session",
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    return new Response(text, { status: res.status, statusText: res.statusText });
  }

  const answerSdp = await res.text();
  return new Response(answerSdp, {
    headers: { "Content-Type": "application/sdp" },
  });
}
