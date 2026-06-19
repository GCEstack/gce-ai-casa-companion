import { config } from "@/lib/config";

export interface TtsOptions {
  text: string;
  lang?: string;
}

export async function textToSpeech({ text, lang = "en" }: TtsOptions): Promise<Response> {
  const model = process.env.CLOUDFLARE_TTS_MODEL || "@cf/myshell-ai/melotts";
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;

  const isMelo = model.includes("melotts");

  const body = isMelo ? { prompt: text, lang } : { text };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`TTS error ${res.status}: ${errText}`);
  }

  if (isMelo) {
    const data = (await res.json()) as { result?: { audio?: string } };
    const base64 = data.result?.audio;
    if (!base64) {
      throw new Error("TTS returned no audio");
    }
    const binary = Buffer.from(base64, "base64");
    return new Response(binary, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  const contentType = res.headers.get("content-type") || "audio/mpeg";
  return new Response(res.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
