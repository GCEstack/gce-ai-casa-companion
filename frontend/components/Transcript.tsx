"use client";

import { useEffect, useRef } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

interface TranscriptProps {
  messages: Message[];
}

export default function Transcript({ messages }: TranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-full min-h-[12rem] flex-col rounded-xl border border-slate-700 bg-panel p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
        Transcript
      </h3>
      <div className="flex-1 overflow-y-auto pr-2 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm italic text-slate-500">
            Nothing yet. Say something. Or don&apos;t. I&apos;ll judge either way.
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <span
              className={`text-[10px] uppercase tracking-wider ${
                msg.role === "user" ? "text-neon-cyan" : "text-neon-pink"
              }`}
            >
              {msg.role === "user" ? "You" : "CASA"}
            </span>
            <div
              className={`mt-1 max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-neon-cyan/10 text-cyan-100 border border-neon-cyan/20"
                  : "bg-neon-pink/10 text-pink-100 border border-neon-pink/20"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
