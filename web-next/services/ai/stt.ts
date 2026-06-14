import { config } from "@/lib/config";

export interface SttResult {
  text: string;
  error?: string;
}

export async function speechToText(audio: Blob): Promise<SttResult> {
  const model = process.env.CLOUDFLARE_STT_MODEL || "@cf/openai/whisper-large-v3-turbo";
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": audio.type || "audio/webm",
      },
      body: await audio.arrayBuffer(),
    });

    if (!res.ok) {
      const text = await res.text();
      return { text: "", error: `STT error ${res.status}: ${text}` };
    }

    const data = (await res.json()) as {
      result?: { text?: string } | null;
      success?: boolean;
      errors?: { message: string }[];
    };

    const text = (data.result?.text || "").trim();
    return { text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: "", error: msg };
  }
}
