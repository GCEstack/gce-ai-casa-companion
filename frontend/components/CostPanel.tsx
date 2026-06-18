"use client";

export interface CostData {
  total?: number;
  stt?: number;
  llm?: number;
  tts?: number;
  clone?: number;
  latency_ms?: number;
}

interface CostPanelProps {
  cost: CostData | null;
}

export default function CostPanel({ cost }: CostPanelProps) {
  if (!cost) {
    return (
      <div className="rounded-xl border border-slate-700 bg-panel p-4 text-sm text-slate-400">
        No cost data yet. Start talking and watch the meter tick.
      </div>
    );
  }

  const formatCents = (n?: number) =>
    typeof n === "number" ? `$${(n / 100).toFixed(4)}` : "—";

  const formatMs = (n?: number) =>
    typeof n === "number" ? `${n.toFixed(0)} ms` : "—";

  return (
    <div className="rounded-xl border border-neon-cyan/30 bg-panel p-4 shadow-[0_0_12px_rgba(5,217,232,0.1)]">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-neon-cyan">
        Session Cost
      </h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-400">Total</span>
          <span className="font-semibold text-neon-green">{formatCents(cost.total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">STT</span>
          <span className="text-slate-200">{formatCents(cost.stt)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">LLM</span>
          <span className="text-slate-200">{formatCents(cost.llm)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">TTS</span>
          <span className="text-slate-200">{formatCents(cost.tts)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Clone</span>
          <span className="text-slate-200">{formatCents(cost.clone)}</span>
        </div>
        <div className="mt-2 border-t border-slate-700 pt-2 flex justify-between">
          <span className="text-slate-400">Latency</span>
          <span className="text-neon-yellow">{formatMs(cost.latency_ms)}</span>
        </div>
      </div>
    </div>
  );
}
