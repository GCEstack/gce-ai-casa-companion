"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";

const faqs = [
  {
    q: "Is Casa Companion safe for young kids?",
    a: "Yes. Every response is filtered for age-appropriateness, copyright content, and factual accuracy. Parents can review conversation history and set limits.",
  },
  {
    q: "Does it work without Wi-Fi?",
    a: "The plush needs Wi-Fi for AI responses, but downloaded stories and songs can play offline for bedtime and travel.",
  },
  {
    q: "Can relatives record stories from anywhere?",
    a: "Absolutely. Anyone you invite can record stories through the app, and they appear on the companion within seconds.",
  },
  {
    q: "What languages are supported?",
    a: "All Languages mode can teach Italian, Spanish, French, Mandarin, Japanese, Arabic, Hindi, and more — plus custom family recordings in any language.",
  },
  {
    q: "When will Kickstarter backers receive their companions?",
    a: "We are targeting production and fulfillment in late 2026, with founder editions shipping first.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center font-serif text-3xl font-bold text-casa-goldLight sm:text-4xl">
          Frequently Asked Questions
        </h2>
        <div className="mt-10 space-y-4">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-2xl border border-casa-border bg-casa-card">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between p-5 text-left"
              >
                <span className="font-serif font-bold text-casa-cream">{f.q}</span>
                {open === i ? <Minus size={18} className="text-casa-gold" /> : <Plus size={18} className="text-casa-gold" />}
              </button>
              {open === i && <p className="px-5 pb-5 text-sm leading-relaxed text-casa-sand">{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
