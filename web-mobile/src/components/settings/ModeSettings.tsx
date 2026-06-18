import { Sparkles, Hand, Gamepad2, BookOpen, HeartHandshake } from 'lucide-react';
import { allModes, playModes, learnModes, supportModes } from '@/lib/modes';
import { ModeIcon } from '@/components/ModeIcon';
import type { ModeConfig } from '@/types';

const categoryMeta: Record<
  string,
  { label: string; icon: React.ElementType; modes: ModeConfig[] }
> = {
  introduction: { label: 'Introduction', icon: Hand, modes: [allModes[0]] },
  play: { label: 'Play', icon: Gamepad2, modes: playModes },
  learn: { label: 'Learn', icon: BookOpen, modes: learnModes },
  support: { label: 'Support', icon: HeartHandshake, modes: supportModes },
};

interface ModeSettingsProps {
  activeMode: ModeConfig;
  onSetActiveMode: (mode: ModeConfig) => void;
}

export function ModeSettings({ activeMode, onSetActiveMode }: ModeSettingsProps) {
  return (
    <section className="bg-surface rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2 text-accent">
        <Sparkles className="w-5 h-5" />
        <h2 className="font-semibold text-white">Active Mode</h2>
      </div>
      <p className="text-xs text-gray-400">
        Choose what your companion should focus on right now.
      </p>

      {Object.entries(categoryMeta).map(([key, meta]) => (
        <div key={key} className="space-y-2">
          <div className="flex items-center gap-1.5 text-gray-300">
            <meta.icon className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold uppercase tracking-wider">{meta.label}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {meta.modes.map((mode) => {
              const active = activeMode.slug === mode.slug;
              return (
                <button
                  key={mode.slug}
                  onClick={() => onSetActiveMode(mode)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    active
                      ? 'bg-white/10 border-accent'
                      : 'bg-background border-white/5 active:bg-white/5'
                  }`}
                  style={active ? { borderColor: mode.accentColor } : {}}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: mode.accentMuted }}
                    >
                      <ModeIcon name={mode.icon} className="w-3.5 h-3.5" style={{ color: mode.accentColor }} />
                    </div>
                    <span className="text-xs font-semibold text-white leading-tight">
                      {mode.label}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 line-clamp-2">{mode.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
