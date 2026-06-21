"use client";

import { useState } from "react";

interface ConsentFormProps {
  onVerified: () => void;
}

export default function ConsentForm({ onVerified }: ConsentFormProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/consent/confirm", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to confirm consent");
        return;
      }
      onVerified();
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-amber-200 bg-amber-50 p-4"
    >
      <h2 className="font-semibold text-amber-900">Parental consent required</h2>
      <p className="mt-1 text-sm text-amber-800">
        Before using Casa Companion, please confirm that you are the parent or
        legal guardian and authorize the device for your child.
      </p>

      <label className="mt-4 flex items-start gap-2 text-sm text-amber-900">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I am the parent/legal guardian and I consent to my child using Casa
          Companion.
        </span>
      </label>

      <button
        type="submit"
        disabled={!confirmed || loading}
        className="mt-4 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {loading ? "Confirming..." : "Confirm consent"}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
