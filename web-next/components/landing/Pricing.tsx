import { Check } from "lucide-react";

const tiers = [
  {
    name: "Companion",
    price: "$89",
    desc: "One plush + full app access",
    features: ["1 AI companion", "13 learning modes", "Voice clone storage", "Parent dashboard"],
  },
  {
    name: "Family Pack",
    price: "$149",
    desc: "Two companions + priority updates",
    features: ["2 AI companions", "13 learning modes", "Unlimited voice clones", "Early access to new characters"],
    highlight: true,
  },
  {
    name: "Founder's Edition",
    price: "$249",
    desc: "Limited run + lifetime perks",
    features: ["Everything in Family Pack", "Founder enamel pin", "Lifetime mode updates", "Name a future companion"],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="bg-white/[0.02] px-4 py-20">
      <div className="mx-auto max-w-5xl text-center">
        <h2 className="font-serif text-3xl font-bold text-casa-goldLight sm:text-4xl">Kickstarter Pricing</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`rounded-3xl border p-6 text-left ${
                t.highlight
                  ? "border-casa-gold/40 bg-casa-gold/10"
                  : "border-casa-border bg-casa-card"
              }`}
            >
              <h3 className="font-serif text-xl font-bold text-casa-cream">{t.name}</h3>
              <div className="mt-2 font-sans text-4xl font-extrabold text-casa-goldLight">{t.price}</div>
              <p className="text-sm text-casa-taupe">{t.desc}</p>
              <ul className="mt-6 space-y-3">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-casa-sand">
                    <Check size={16} className="mt-0.5 shrink-0 text-casa-gold" />
                    {f}
                  </li>
                ))}
              </ul>
              <button className="mt-8 w-full rounded-full bg-casa-gold py-3 font-bold text-casa-dark transition hover:bg-casa-goldLight">
                Pledge {t.price}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
