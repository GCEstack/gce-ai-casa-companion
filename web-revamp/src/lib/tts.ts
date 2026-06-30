const DEFAULT_BACKEND = "https://casa-voice-agent.fly.dev";

function getBackendUrl(): string {
  if (import.meta.env.VITE_BACKEND_HTTP_URL) {
    return import.meta.env.VITE_BACKEND_HTTP_URL.replace(/\/$/, "");
  }
  const wsUrl = import.meta.env.VITE_VOICE_SERVER_URL;
  if (wsUrl) {
    return wsUrl
      .replace(/^wss:\/\//, "https://")
      .replace(/^ws:\/\//, "http://")
      .replace(/\/$/, "");
  }
  return DEFAULT_BACKEND;
}

export async function fetchBackendTTS(
  text: string,
  character: string,
  mode = "default",
  format: "wav" | "pcm" = "wav"
): Promise<Blob> {
  const res = await fetch(`${getBackendUrl()}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, character, mode, format }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Backend TTS error ${res.status}: ${err}`);
  }
  return await res.blob();
}
