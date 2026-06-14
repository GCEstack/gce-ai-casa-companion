interface LiveWaveformProps {
  level: number;
  isRecording: boolean;
}

export default function LiveWaveform({ level, isRecording }: LiveWaveformProps) {
  if (!isRecording) return null;

  const bars = 5;

  return (
    <div className="flex items-end justify-center gap-1 h-8">
      {Array.from({ length: bars }).map((_, i) => {
        // Offset each bar so they don't move in perfect unison.
        const offset = Math.sin(Date.now() / 200 + i * 1.2) * 0.15;
        const barLevel = Math.max(0.15, Math.min(1, level + offset));
        const height = Math.max(4, Math.round(barLevel * 28));

        return (
          <div
            key={i}
            className="w-1.5 bg-white rounded-full transition-all duration-75 ease-out"
            style={{
              height: `${height}px`,
              opacity: 0.5 + barLevel * 0.5,
            }}
          />
        );
      })}
    </div>
  );
}
