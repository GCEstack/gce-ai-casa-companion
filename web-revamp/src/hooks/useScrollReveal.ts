import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface ScrollRevealOptions {
  y?: number;
  opacity?: number;
  duration?: number;
  ease?: string;
  triggerStart?: string;
  stagger?: number;
}

export function useScrollReveal(options: ScrollRevealOptions = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    y = 60,
    opacity = 0,
    duration = 1.0,
    ease = 'power3.out',
    triggerStart = 'top 85%',
    stagger = 0.12,
  } = options;

  useGSAP(() => {
    if (!containerRef.current) return;

    const children = containerRef.current.children;
    if (children.length === 0) return;

    gsap.fromTo(
      children,
      { y, opacity },
      {
        y: 0,
        opacity: 1,
        duration,
        ease,
        stagger,
        scrollTrigger: {
          trigger: containerRef.current,
          start: triggerStart,
          toggleActions: 'play none none none',
        },
      }
    );
  }, { scope: containerRef });

  return containerRef;
}
