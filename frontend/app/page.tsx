"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AudioWave from "@/components/AudioWave";
import CharacterSelector from "@/components/CharacterSelector";
import CostPanel, { CostData } from "@/components/CostPanel";
import Transcript, { Message } from "@/components/Transcript";
import { ConnectionStatus, ConversationMode, useVoiceAgent } from "@/components/VoiceAgent";
import { Character } from "@/lib/characters";

const STATUS_COPY: Record<ConnectionStatus, string> = {
  idle: "Offline. Pick a companion and connect.",
  connecting: "Warming up...",
  ready: "Connected and ready. Tap the mic to talk.",
  listening: "Listening. Tell a story, ask a question, or just say hi.",
  speaking: "Talking. Shhh, they're speaking.",
  interrupted: "Interrupted. But they're ready to keep going.",
  error: "Something broke. Probably the wifi gremlins.",
};

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  idle: "text-slate-400",
  connecting: "text-neon-yellow",
  ready: "text-neon-cyan",
  listening: "text-neon-cyan",
  speaking: "text-neon-pink",
  interrupted: "text-neon-pink",
  error: "text-red-500",
};

export default function Home() {
  const [character, setCharacter] = useState<Character | null>(null);
  const [cost, setCost] = useState<CostData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [cloneFile, setCloneFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onCostUpdate = useCallback((c: CostData) => setCost(c), []);
  const onTranscript = useCallback((msg: Message) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === msg.role && last.text === msg.text) {
        return prev;
      }
      return [...prev, msg];
    });
  }, []);

  const onTextFallback = useCallback((text: string) => {
    console.warn("Voice fallback text:", text);
  }, []);

  const {
    status,
    voiceId,
    isUploading,
    uploadError,
    mode,
    setMode,
    connect,
    disconnect,
    toggleMic,
    isMicActive,
    uploadSample,
    configure,
  } = useVoiceAgent({
    initialConfig: character
      ? {
          systemPrompt: character.prompt,
          characterName: character.name,
          voiceId: character.elevenlabs_voice_id ?? null,
        }
      : undefined,
    onCostUpdate,
    onTranscript,
    onTextFallback,
  });

  const handleSelectCharacter = useCallback(
    (c: Character) => {
      setCharacter(c);
      setMessages([]);
      configure({
        systemPrompt: c.prompt,
        characterName: c.name,
        voiceId: c.elevenlabs_voice_id ?? null,
      });
    },
    [configure]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setCloneFile(file);
  };

  const handleUpload = async () => {
    if (!cloneFile) return;
    await uploadSample(cloneFile);
  };

  useEffect(() => {
    if (voiceId) {
      configure({ voiceId });
    }
  }, [voiceId, configure]);

  const isConnected = status !== "idle" && status !== "error";
  const avatar = character?.image ? (
    <img
      src={character.image}
      alt={character.name}
      className="h-full w-full object-cover"
    />
  ) : status === "speaking" ? (
    "🗣️"
  ) : status === "listening" ? (
    "🎙️"
  ) : (
    "😒"
  );

  if (!character) {
    return (
      <main className="min-h-screen w-full bg-background p-4 md:p-6">
        <div className="mx-auto max-w-6xl">
          <header className="mb-8 text-center">
            <h1 className="text-3xl font-black tracking-tighter text-white">
              CASA<span className="neon-text-pink">.</span>
            </h1>
            <p className="text-sm text-slate-400">
              Voice companion. Real personality. Real-time stories.
            </p>
          </header>
          <CharacterSelector onSelect={handleSelectCharacter} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-background p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tighter text-white">
              CASA<span className="neon-text-pink">.</span>
            </h1>
            <p className="text-sm text-slate-400">
              Talking with <span className="text-neon-cyan">{character.name}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCharacter(null)}
              className="rounded-lg border border-slate-600 bg-surface px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-neon-cyan/50 hover:text-neon-cyan"
            >
              Change Companion
            </button>
            <div
              className={`flex items-center gap-2 rounded-full border border-slate-700 bg-surface px-4 py-2 text-xs font-bold uppercase tracking-widest ${STATUS_COLOR[status]}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  status === "idle" ? "bg-slate-500" : "bg-current"
                } ${status !== "idle" ? "animate-pulseFast" : ""}`}
              />
              {status}
            </div>
            {status === "idle" || status === "error" ? (
              <button
                onClick={connect}
                className="rounded-lg bg-neon-cyan/10 px-4 py-2 text-sm font-semibold text-neon-cyan transition hover:bg-neon-cyan/20"
              >
                Connect
              </button>
            ) : status === "connecting" ? (
              <button
                disabled
                className="rounded-lg bg-neon-yellow/10 px-4 py-2 text-sm font-semibold text-neon-yellow opacity-70"
              >
                Connecting...
              </button>
            ) : (
              <button
                onClick={disconnect}
                className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
              >
                Disconnect
              </button>
            )}
            {(status === "ready" ||
              status === "listening" ||
              status === "speaking" ||
              status === "interrupted") && (
              <div className="flex items-center gap-1 rounded-lg border border-slate-600 bg-surface p-1">
                <button
                  onClick={() => setMode("turn")}
                  className={`rounded px-2 py-1 text-xs font-semibold transition ${
                    mode === "turn"
                      ? "bg-neon-cyan/20 text-neon-cyan"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Turn
                </button>
                <button
                  onClick={() => setMode("continuous")}
                  className={`rounded px-2 py-1 text-xs font-semibold transition ${
                    mode === "continuous"
                      ? "bg-neon-pink/20 text-neon-pink"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Flow
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="space-y-6">
            <div className="relative flex flex-col items-center justify-center rounded-2xl border border-slate-700 bg-surface p-8 text-center shadow-lg">
              <div
                className={`mb-4 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 bg-panel text-5xl transition ${
                  isConnected
                    ? "border-neon-pink shadow-[0_0_30px_rgba(255,42,109,0.3)]"
                    : "border-slate-600"
                }`}
              >
                {avatar}
              </div>
              <h2 className="max-w-md text-lg font-medium text-slate-200">
                {STATUS_COPY[status]}
              </h2>
              <p className="mt-2 text-xs text-slate-500">
                Press{" "}
                <kbd className="rounded bg-slate-800 px-1 py-0.5 text-neon-cyan">
                  Space
                </kbd>{" "}
                to interrupt. Click the mic to barge in.
              </p>
            </div>

            <AudioWave active={status === "listening" || status === "speaking"} />

            <button
              onClick={toggleMic}
              disabled={!isConnected || mode === "continuous"}
              className={`w-full rounded-xl border-2 py-4 text-lg font-bold uppercase tracking-widest transition ${
                isMicActive
                  ? "border-neon-cyan bg-neon-cyan/10 text-neon-cyan"
                  : isConnected
                  ? "border-slate-700 bg-panel text-slate-300 hover:border-neon-cyan/50 hover:text-neon-cyan"
                  : "cursor-not-allowed border-slate-800 bg-surface text-slate-600"
              }`}
            >
              {!isConnected
                ? "Connect First"
                : mode === "continuous"
                ? isMicActive
                  ? "Listening..."
                  : "Starting mic..."
                : isMicActive
                ? "Stop Mic"
                : "Push to Talk"}
            </button>
            {mode === "continuous" && isConnected && (
              <p className="text-center text-xs text-slate-500">
                Flow mode: just talk. The mic stays on and replies automatically.
              </p>
            )}

            <Transcript messages={messages} />
          </section>

          <aside className="space-y-6">
            <div className="rounded-xl border border-slate-700 bg-panel p-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-neon-pink">
                Voice Clone
              </h3>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="block w-full rounded-lg border border-slate-600 bg-surface px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-neon-pink file:px-3 file:py-1 file:text-xs file:font-bold file:text-white"
              />
              <button
                onClick={handleUpload}
                disabled={!cloneFile || isUploading}
                className="mt-3 w-full rounded-lg bg-neon-pink/10 px-4 py-2 text-sm font-semibold text-neon-pink transition hover:bg-neon-pink/20 disabled:opacity-50"
              >
                {isUploading ? "Uploading..." : "Upload 1-min Sample"}
              </button>
              {uploadError && (
                <p className="mt-2 text-xs text-red-400">{uploadError}</p>
              )}
              {voiceId && (
                <div className="mt-3 rounded-lg border border-neon-green/30 bg-neon-green/5 p-2">
                  <p className="text-[10px] uppercase text-slate-400">voice_id</p>
                  <p className="break-all text-xs font-mono text-neon-green">
                    {voiceId}
                  </p>
                </div>
              )}
            </div>

            <CostPanel cost={cost} />

            <div className="rounded-xl border border-slate-700 bg-panel p-4 text-xs text-slate-400">
              <p className="mb-2 font-bold text-slate-300">Pro tips:</p>
              <ul className="list-inside list-disc space-y-1">
                <li>Your companion&apos;s personality is based on their animal.</li>
                <li>Ask them to tell a story — they love it.</li>
                <li>Spacebar interrupts them mid-sentence.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
