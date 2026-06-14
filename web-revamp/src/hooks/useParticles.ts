import { useRef, useEffect } from 'react';
import gsap from 'gsap';

interface ParticleOptions {
  count?: number;
  hueMin?: number;
  hueMax?: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

class Particle {
  el: HTMLDivElement;
  size: number;
  x: number;
  y: number;
  speedY: number;
  oscillationAmplitude: number;
  oscillationSpeed: number;
  phase: number;
  opacity: number;
  hue: number;

  constructor(container: HTMLDivElement, hueMin: number, hueMax: number) {
    this.el = document.createElement('div');
    this.size = Math.random() * 3 + 2;
    this.x = Math.random() * window.innerWidth;
    this.y = Math.random() * window.innerHeight;
    this.speedY = Math.random() * 17 + 8;
    this.oscillationAmplitude = Math.random() * 40 + 20;
    this.oscillationSpeed = Math.random() * 5 + 3;
    this.phase = Math.random() * Math.PI * 2;
    this.opacity = Math.random() * 0.5 + 0.3;
    this.hue = Math.random() * (hueMax - hueMin) + hueMin;

    this.el.style.cssText = `
      width: ${this.size}px;
      height: ${this.size}px;
      background: hsl(${this.hue}, 70%, 70%);
      border-radius: 50%;
      position: absolute;
      left: ${this.x}px;
      top: ${this.y}px;
      opacity: ${this.opacity};
      pointer-events: none;
      will-change: transform;
    `;
    container.appendChild(this.el);
  }

  update(dt: number) {
    this.y -= this.speedY * dt;
    const oscX = Math.sin(this.y * 0.01 + this.phase) * this.oscillationAmplitude;
    this.el.style.transform = `translateX(${oscX}px)`;
    this.el.style.top = `${this.y}px`;

    if (this.y < -10) {
      this.y = window.innerHeight + 10;
      this.x = Math.random() * window.innerWidth;
      this.el.style.left = `${this.x}px`;
    }
  }

  destroy() {
    this.el.remove();
  }
}

export function useParticles({ count = 60, hueMin = 40, hueMax = 55, containerRef }: ParticleOptions) {
  const particlesRef = useRef<Particle[]>([]);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const particleCount = isMobile ? 20 : window.innerWidth < 1200 ? 30 : count;

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Clear any existing particles
    particlesRef.current.forEach((p) => p.destroy());
    particlesRef.current = [];

    // Create particles
    for (let i = 0; i < particleCount; i++) {
      particlesRef.current.push(new Particle(container, hueMin, hueMax));
    }

    // Animation loop via GSAP ticker
    const tick = () => {
      particlesRef.current.forEach((p) => p.update(1 / 60));
    };
    gsap.ticker.add(tick);

    return () => {
      gsap.ticker.remove(tick);
      particlesRef.current.forEach((p) => p.destroy());
      particlesRef.current = [];
    };
  }, [containerRef, particleCount, hueMin, hueMax]);
}
