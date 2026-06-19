"use client";

import { useState } from "react";
import Link from "next/link";
import { CharacterGrid } from "@/components/demo/CharacterGrid";
import { ModeSelector } from "@/components/demo/ModeSelector";
import { ChatPanel } from "@/components/demo/ChatPanel";
import { SurveyForm } from "@/components/demo/SurveyForm";

export default function DemoPage() {
  const [character, setCharacter] = useState("corvo");
  const [mode, setMode] = useState<string | undefined>(undefined);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [messageCount, setMessageCount] = useState(0);

  return (
    <main className="min-h-screen bg-casa-dark px-4 py-6">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href="/" className="font-serif text-xl font-black text-casa-goldLight">
          Casa Companion
        </Link>
        <Link href="/" className="text-sm font-semibold text-casa-taupe hover:text-casa-gold">
          Back home
        </Link>
      </div>

      <div className="mx-auto mt-8 flex max-w-2xl items-center justify-between text-xs font-bold uppercase tracking-widest text-casa-taupe">
        <div className={`${step >= 1 ? "text-casa-gold" : ""}`}>1. Pick Companion</div>
        <div className="text-casa-border">—</div>
        <div className={`${step >= 2 ? "text-casa-gold" : ""}`}>2. Pick Mode</div>
        <div className="text-casa-border">—</div>
        <div className={`${step >= 3 ? "text-casa-gold" : ""}`}>3. Chat</div>
      </div>

      <div className="mx-auto mt-10 max-w-5xl">
        {step === 1 && (
          <div className="flex flex-col items-center gap-6">
            <CharacterGrid selected={character} onSelect={setCharacter} />
            <button
              onClick={() => setStep(2)}
              className="rounded-full bg-casa-gold px-10 py-3 font-bold text-casa-dark transition hover:bg-casa-goldLight"
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col items-center gap-6">
            <ModeSelector selected={mode} onSelect={setMode} />
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="rounded-full border border-casa-border bg-casa-card px-8 py-3 font-bold text-casa-cream transition hover:bg-white/5"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="rounded-full bg-casa-gold px-10 py-3 font-bold text-casa-dark transition hover:bg-casa-goldLight"
              >
                Start Chat
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col items-center gap-6">
            <ChatPanel characterKey={character} modeKey={mode} onMessageCount={setMessageCount} />
            {messageCount >= 3 && (
              <div className="w-full max-w-2xl">
                <SurveyForm />
              </div>
            )}
            <button
              onClick={() => setStep(1)}
              className="rounded-full border border-casa-border bg-casa-card px-8 py-3 font-bold text-casa-cream transition hover:bg-white/5"
            >
              Restart Demo
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
