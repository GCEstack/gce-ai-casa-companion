"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { CharacterMode, Medallion } from "@/lib/types";

interface MedallionManagerProps {
  medallions: Medallion[];
  characterModes: CharacterMode[];
  onRegister: (medallion: Medallion) => void;
  onError: (message: string) => void;
}

export default function MedallionManager({
  medallions,
  characterModes,
  onRegister,
  onError,
}: MedallionManagerProps) {
  const [nfcTagId, setNfcTagId] = useState("");
  const [medallionCharacterId, setMedallionCharacterId] = useState("");
  const [medallionModeId, setMedallionModeId] = useState("");
  const [medallionFormLoading, setMedallionFormLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nfcTagId.trim()) return;

    setMedallionFormLoading(true);
    try {
      const res = await fetch("/api/medallions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nfc_tag_id: nfcTagId.trim(),
          character_id: medallionCharacterId || null,
          mode_id: medallionModeId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error || "Failed to register medallion");
      } else {
        onRegister(data.medallion);
        setNfcTagId("");
        setMedallionCharacterId("");
        setMedallionModeId("");
      }
    } catch {
      onError("Network error while registering medallion");
    } finally {
      setMedallionFormLoading(false);
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-semibold text-slate-900">Medallions</h2>

      {medallions.length === 0 ? (
        <p className="text-sm text-slate-500">No medallions registered.</p>
      ) : (
        <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {medallions.map((medallion) => (
            <li
              key={medallion.id}
              className="rounded-lg border border-slate-200 p-3"
            >
              <div className="font-medium text-slate-900">
                {medallion.nfc_tag_id}
              </div>
              <div className="text-xs text-slate-500">
                {medallion.character_modes?.name ?? "No mode assigned"}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-slate-200 bg-slate-50 p-4"
      >
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Register medallion
        </h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <input
            type="text"
            placeholder="NFC tag ID"
            value={nfcTagId}
            onChange={(e) => setNfcTagId(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none sm:col-span-1"
            required
          />
          <select
            value={medallionCharacterId}
            onChange={(e) => {
              setMedallionCharacterId(e.target.value);
              setMedallionModeId("");
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none sm:col-span-1"
          >
            <option value="">Character</option>
            {Array.from(
              new Set(characterModes.map((m) => m.character_key))
            ).map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          <select
            value={medallionModeId}
            onChange={(e) => setMedallionModeId(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none sm:col-span-1"
          >
            <option value="">Mode</option>
            {characterModes
              .filter(
                (m) =>
                  !medallionCharacterId ||
                  m.character_key === medallionCharacterId
              )
              .map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.name}
                </option>
              ))}
          </select>
          <button
            type="submit"
            disabled={medallionFormLoading}
            className="flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 sm:col-span-1"
          >
            <Plus size={16} />
            {medallionFormLoading ? "Registering..." : "Register"}
          </button>
        </div>
      </form>
    </section>
  );
}
