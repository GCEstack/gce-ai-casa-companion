import { useEffect, useRef } from 'react';
import { registerWaveform, unregisterWaveform } from '@/hooks/useVoiceChat';

interface VoiceWaveformProps {
  barCount?: number;
}

export default function VoiceWaveform({ barCount = 16 }: VoiceWaveformProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const setData = (data: number[]) => {
      if (!containerRef.current) return;
      const bars = containerRef.current.children;
      const hasData = data.length > 0;

      for (let i = 0; i < barCount; i++) {
        const bar = bars[i] as HTMLDivElement | undefined;
        if (!bar) continue;

        if (hasData) {
          const value = data[i] ?? 0;
          const height = Math.max(4, Math.min(32, (value / 255) * 32));
          const opacity = 0.6 + (value / 255) * 0.4;
          bar.style.height = `${height}px`;
          bar.style.opacity = `${opacity}`;
          bar.style.animation = 'none';
        } else {
          const idleHeight = Math.max(4, Math.min(24, 12 + Math.sin(i * 0.8) * 8));
          bar.style.height = `${idleHeight}px`;
          bar.style.opacity = '0.5';
          bar.style.animation = `waveform 1.2s ease-in-out infinite`;
          bar.style.animationDelay = `${i * 0.05}s`;
        }
      }
    };

    registerWaveform({ setData });
    return () => unregisterWaveform();
  }, [barCount]);

  return (
    <div ref={containerRef} className="flex items-center gap-[3px] h-8">
      {Array.from({ length: barCount }, (_, i) => (
        <div
          key={i}
          className="w-1 bg-white/70 rounded-full transition-all duration-75"
          style={{
            height: `${Math.max(4, Math.min(24, 12 + Math.sin(i * 0.8) * 8))}px`,
            opacity: 0.5,
            animation: `waveform 1.2s ease-in-out infinite`,
            animationDelay: `${i * 0.05}s`,
          }}
        />
      ))}
    </div>
  );
}
