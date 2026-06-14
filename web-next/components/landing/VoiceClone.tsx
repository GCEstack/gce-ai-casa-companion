import { Mic, Sparkles, Wifi, Heart } from "lucide-react";

const steps = [
  { icon: Mic, title: "Record", desc: "A parent or grandparent reads a few sentences in any language." },
  { icon: Sparkles, title: "Clone", desc: "Our AI creates a gentle, safe voice model in under a minute." },
  { icon: Wifi, title: "Assign", desc: "Pick which companion uses that voice for stories and chats." },
  { icon: Heart, title: "Connect", desc: "Your child hears the people they love, any time of day." },
];

export function VoiceClone() {
  return (
    <section className="bg-white/[0.02] px-4 py-20">
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="font-serif text-3xl font-bold text-casa-goldLight sm:text-4xl">
          Voice Cloning in 4 Steps
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-2xl border border-casa-border bg-casa-card p-6 text-center">
              <div className="mx-flex mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-casa-gold/10 text-casa-gold">
                <s.icon size={24} />
              </div>
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-casa-taupe">
                Step {i + 1}
              </div>
              <h3 className="font-serif text-lg font-bold text-casa-cream">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-casa-taupe">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
