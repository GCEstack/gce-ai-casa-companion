"use client";

import { useState } from "react";

interface Props {
  onClose?: () => void;
}

export function SurveyForm({ onClose }: Props) {
  const [form, setForm] = useState({ email: "", age: "", interests: "", priorities: "", feedback: "" });
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          age: form.age,
          interests: form.interests.split(",").map((s) => s.trim()),
          priorities: form.priorities.split(",").map((s) => s.trim()),
          feedback: form.feedback,
        }),
      });
      if (res.ok) setStatus("success");
      else setStatus("error");
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="rounded-3xl border border-casa-border bg-casa-card p-8 text-center">
        <h3 className="font-serif text-2xl font-bold text-casa-goldLight">Thank you!</h3>
        <p className="mt-2 text-casa-sand">Your feedback helps make Casa Companion better.</p>
        {onClose && (
          <button onClick={onClose} className="mt-4 rounded-full bg-casa-gold px-6 py-2 font-bold text-casa-dark">
            Close
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-casa-border bg-casa-card p-6">
      <h3 className="font-serif text-xl font-bold text-casa-goldLight">Quick Survey</h3>
      <p className="text-sm text-casa-taupe">Help us shape Casa Companion.</p>
      <div className="mt-4 space-y-3">
        <input
          required
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="w-full rounded-xl border border-casa-border bg-casa-dark px-4 py-2 text-sm text-casa-cream outline-none focus:border-casa-gold"
        />
        <input
          placeholder="Child's age"
          value={form.age}
          onChange={(e) => setForm({ ...form, age: e.target.value })}
          className="w-full rounded-xl border border-casa-border bg-casa-dark px-4 py-2 text-sm text-casa-cream outline-none focus:border-casa-gold"
        />
        <input
          placeholder="Interests (comma separated)"
          value={form.interests}
          onChange={(e) => setForm({ ...form, interests: e.target.value })}
          className="w-full rounded-xl border border-casa-border bg-casa-dark px-4 py-2 text-sm text-casa-cream outline-none focus:border-casa-gold"
        />
        <input
          placeholder="Top priorities (comma separated)"
          value={form.priorities}
          onChange={(e) => setForm({ ...form, priorities: e.target.value })}
          className="w-full rounded-xl border border-casa-border bg-casa-dark px-4 py-2 text-sm text-casa-cream outline-none focus:border-casa-gold"
        />
        <textarea
          placeholder="Any feedback?"
          value={form.feedback}
          onChange={(e) => setForm({ ...form, feedback: e.target.value })}
          className="w-full rounded-xl border border-casa-border bg-casa-dark px-4 py-2 text-sm text-casa-cream outline-none focus:border-casa-gold"
          rows={3}
        />
      </div>
      <button
        type="submit"
        disabled={status === "submitting"}
        className="mt-4 w-full rounded-full bg-casa-gold py-3 font-bold text-casa-dark transition hover:bg-casa-goldLight disabled:opacity-50"
      >
        {status === "submitting" ? "Sending..." : "Send Feedback"}
      </button>
      {status === "error" && <p className="mt-2 text-center text-sm text-casa-red">Something went wrong.</p>}
    </form>
  );
}
