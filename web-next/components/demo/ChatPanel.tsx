"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Mic, Send, Phone, PhoneOff } from "lucide-react";
import { getCharacter } from "@/lib/characters";
import { getMode } from "@/lib/modes";
import { useRealtimeVoice } from "./useRealtimeVoice";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  characterKey: string;
  modeKey?: string;
  onMessageCount?: (count: number) => void;
}

export function ChatPanel({ characterKey, modeKey, onMessageCount }: Props) {
  const character = getCharacter(characterKey)!;
  const mode = getMode(modeKey);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { status: voiceStatus, error: voiceError, start: startVoice, stop: stopVoice } = useRealtimeVoice();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    onMessageCount?.(messages.length);
  }, [messages, onMessageCount]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-10),
          character: characterKey,
          mode: modeKey,
        }),
      });
      const data = await res.json();
      if (data.response) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const speakLast = async () => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: last.content }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const audio = new Audio(URL.createObjectURL(blob));
        audio.play();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleMic = async () => {
    if (recording) {
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "voice.webm");
        const res = await fetch("/api/stt", { method: "POST", body: form });
        const data = await res.json();
        if (data.text) await sendMessage(data.text);
      };
      mediaRecorder.start();
      setRecording(true);
      setTimeout(() => {
        mediaRecorder.stop();
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
      }, 5000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col rounded-3xl border border-casa-border bg-casa-card p-4 sm:p-6">
      <div className="flex flex-col items-center">
        <div className="relative h-32 w-32 overflow-hidden rounded-full border-2 border-casa-gold/30">
          <Image src={character.image} alt={character.name} fill className="object-contain p-2" />
        </div>
        <h3 className="mt-3 font-serif text-xl font-bold text-casa-goldLight">{character.name}</h3>
        <p className="text-xs italic text-casa-taupe">{character.meaning}</p>
        {mode && (
          <div className="mt-2 rounded-full border border-casa-gold/30 bg-casa-gold/10 px-3 py-1 text-xs font-bold text-casa-gold">
            {mode.icon} {mode.name}
          </div>
        )}
      </div>

      <div className="mt-4 flex h-64 flex-col gap-3 overflow-y-auto rounded-2xl border border-casa-border bg-casa-dark/50 p-4">
        {messages.length === 0 && (
          <p className="m-auto text-center text-sm text-casa-taupe">Say hello to {character.name}!</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "self-end bg-casa-gold/20 text-casa-cream" : "self-start border border-casa-border bg-casa-card text-casa-sand"}`}>
            {m.content}
          </div>
        ))}
        {loading && <div className="self-start text-xs text-casa-taupe">{character.name} is thinking...</div>}
        <div ref={bottomRef} />
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
          placeholder={`Talk to ${character.name}...`}
          className="flex-1 rounded-full border border-casa-border bg-casa-dark px-5 py-3 text-sm text-casa-cream outline-none focus:border-casa-gold"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="rounded-full bg-casa-gold p-3 text-casa-dark transition hover:bg-casa-goldLight disabled:opacity-50"
        >
          <Send size={18} />
        </button>
        <button
          onClick={toggleMic}
          className={`rounded-full p-3 transition ${recording ? "bg-casa-red text-white" : "border border-casa-border bg-casa-card text-casa-cream hover:border-casa-gold"}`}
        >
          <Mic size={18} />
        </button>
        <button
          onClick={() => {
            if (voiceStatus === "connected") stopVoice();
            else startVoice(characterKey, modeKey);
          }}
          className={`rounded-full p-3 transition ${voiceStatus === "connected" ? "bg-green-600 text-white" : "border border-casa-border bg-casa-card text-casa-cream hover:border-casa-gold"}`}
        >
          {voiceStatus === "connected" ? <PhoneOff size={18} /> : <Phone size={18} />}
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <button onClick={speakLast} className="text-xs text-casa-taupe hover:text-casa-gold">
          🔊 Speak last reply
        </button>
        <span className="text-xs text-casa-taupe">
          {voiceStatus === "connecting" && "Connecting voice..."}
          {voiceStatus === "connected" && "Realtime voice on"}
          {voiceError && <span className="text-casa-red">{voiceError}</span>}
        </span>
      </div>
    </div>
  );
}
