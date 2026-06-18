import { Clock, RotateCcw } from 'lucide-react';

interface UsageStatsProps {
  messageCount: number;
  minutes: number;
  estimatedCost: number;
  capMinutes: number;
  onReset: () => void;
}

export function UsageStats({
  messageCount,
  minutes,
  estimatedCost,
  capMinutes,
  onReset,
}: UsageStatsProps) {
  const capPercent = capMinutes > 0 ? Math.min(100, (minutes / capMinutes) * 100) : 0;

  return (
    <section className="bg-surface rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-accent">
          <Clock className="w-5 h-5" />
          <h2 className="font-semibold text-white">Usage Today</h2>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-1 text-[10px] text-gray-400 active:text-white"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-background rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-white">{messageCount}</p>
          <p className="text-[10px] text-gray-400">messages</p>
        </div>
        <div className="bg-background rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-white">{minutes}</p>
          <p className="text-[10px] text-gray-400">minutes</p>
        </div>
        <div className="bg-background rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-white">~${estimatedCost.toFixed(2)}</p>
          <p className="text-[10px] text-gray-400">est. cost</p>
        </div>
      </div>

      {capMinutes > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>Daily cap</span>
            <span>
              {minutes} / {capMinutes} min
            </span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${capPercent}%`,
                backgroundColor: capPercent >= 90 ? '#ef4444' : '#22c55e',
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
