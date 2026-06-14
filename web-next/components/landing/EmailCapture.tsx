"use client";

import { useState } from "react";

export function EmailCapture() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setStatus("error");
      return;
    }
    setStatus("success");
    setEmail("");
  };

  return (
    <section className="bg-casa-red/10 px-4 py-20">
      <div className="mx-auto max-w-xl text-center">
        <h2 className="font-serif text-3xl font-bold text-casa-goldLight">Get Launch Updates</h2>
        <p className="mt-3 text-casa-taupe">Be the first to know when Kickstarter goes live and early-bird tiers open.</p>
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 rounded-full border border-casa-border bg-casa-dark px-6 py-3 text-casa-cream outline-none focus:border-casa-gold"
          />
          <button
            type="submit"
            className="rounded-full bg-casa-gold px-8 py-3 font-bold text-casa-dark transition hover:bg-casa-goldLight"
          >
            Notify Me
          </button>
        </form>
        {status === "success" && <p className="mt-3 text-sm text-green-500">You&apos;re on the list!</p>}
        {status === "error" && <p className="mt-3 text-sm text-casa-red">Please enter a valid email.</p>}
      </div>
    </section>
  );
}
