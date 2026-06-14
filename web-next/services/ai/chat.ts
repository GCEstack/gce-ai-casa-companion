import { config } from "@/lib/config";

export type Message = { role: "system" | "user" | "assistant"; content: string };

export interface ChatOptions {
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResult {
  text: string;
  error?: string;
}

export async function chat({ messages, maxTokens = 250, temperature = 0.85 }: ChatOptions): Promise<ChatResult> {
  const model = process.env.CLOUDFLARE_CHAT_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { text: "", error: `Cloudflare Workers AI error ${res.status}: ${text}` };
    }

    const data = (await res.json()) as {
      result?: { response?: string; message?: { content?: string } } | null;
      success?: boolean;
      errors?: { message: string }[];
    };

    const resultObj = data.result;
    const text =
      (typeof resultObj === "object" && resultObj
        ? resultObj.response || resultObj.message?.content
        : undefined) || "";

    if (!text) {
      return { text: "", error: "Empty response from chat model" };
    }

    return { text: text.trim() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: "", error: msg };
  }
}
