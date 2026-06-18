"use client";

import { useEffect, useRef } from "react";

interface AudioWaveProps {
  active: boolean;
  className?: string;
}

export default function AudioWave({ active, className = "" }: AudioWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    const bars = 48;
    const barWidth = 6;
    const gap = 4;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      const totalWidth = bars * (barWidth + gap) - gap;
      const startX = (width - totalWidth) / 2;

      timeRef.current += 0.08;

      for (let i = 0; i < bars; i++) {
        const x = startX + i * (barWidth + gap);

        let amplitude: number;
        if (active) {
          const wave1 = Math.sin(i * 0.3 + timeRef.current) * 0.5 + 0.5;
          const wave2 = Math.sin(i * 0.7 - timeRef.current * 1.5) * 0.5 + 0.5;
          amplitude = 0.2 + wave1 * wave2 * 0.8;
        } else {
          amplitude = 0.05 + Math.sin(i * 0.2 + timeRef.current * 0.3) * 0.03;
        }

        const maxBarHeight = height * 0.9;
        const barHeight = Math.max(4, amplitude * maxBarHeight);

        const gradient = ctx.createLinearGradient(0, centerY - barHeight / 2, 0, centerY + barHeight / 2);
        if (active) {
          gradient.addColorStop(0, "#ff2a6d");
          gradient.addColorStop(0.5, "#05d9e8");
          gradient.addColorStop(1, "#00ff9f");
        } else {
          gradient.addColorStop(0, "#334155");
          gradient.addColorStop(1, "#475569");
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, centerY - barHeight / 2, barWidth, barHeight, 3);
        ctx.fill();

        ctx.shadowColor = active ? "#05d9e8" : "transparent";
        ctx.shadowBlur = active ? 12 : 0;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener("resize", resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-32 rounded-lg bg-surface ${className}`}
      aria-label={active ? "Audio waveform visualizer active" : "Audio waveform visualizer"}
    />
  );
}
