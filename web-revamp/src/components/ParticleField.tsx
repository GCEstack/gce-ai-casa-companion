import { useRef } from 'react';
import { useParticles } from '@/hooks/useParticles';

interface ParticleFieldProps {
  count?: number;
  hueMin?: number;
  hueMax?: number;
  className?: string;
}

export default function ParticleField({ count = 60, hueMin = 40, hueMax = 55, className = '' }: ParticleFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useParticles({
    count,
    hueMin,
    hueMax,
    containerRef,
  });

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-[1] pointer-events-none overflow-hidden ${className}`}
      aria-hidden="true"
    />
  );
}
