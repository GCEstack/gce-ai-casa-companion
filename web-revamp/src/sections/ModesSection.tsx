import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Play, BookOpen, Heart } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const modes = [
  {
    title: 'Play',
    icon: Play,
    accentColor: '#f97316',
    accentMuted: 'rgba(249,115,22,0.15)',
    items: ['Story Time', 'Music & Rhythm', 'Geography', 'STEM Sparks'],
    description: 'Explore, create, and have fun with your companion',
  },
  {
    title: 'Learn',
    icon: BookOpen,
    accentColor: '#eab308',
    accentMuted: 'rgba(234,179,8,0.15)',
    items: ['All Languages', 'Homework Helper', 'Coding'],
    description: 'Study, practice, and grow your knowledge',
  },
  {
    title: 'Support',
    icon: Heart,
    accentColor: '#ec4899',
    accentMuted: 'rgba(236,72,153,0.15)',
    items: ['Calm & Breathe', 'Milestones', 'Teaching Mode'],
    description: 'Relax, track progress, and get guidance',
  },
];

export default function ModesSection() {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!containerRef.current) return;

    const cards = containerRef.current.querySelectorAll('.mode-card');
    gsap.fromTo(
      cards,
      { y: 60, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 1,
        ease: 'power3.out',
        stagger: 0.12,
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top 85%',
        },
      }
    );
  }, { scope: containerRef });

  return (
    <section className="relative z-10 py-16 px-4">
      <div ref={containerRef} className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-[900px] mx-auto">
        {modes.map((mode) => {
          const Icon = mode.icon;
          return (
            <div
              key={mode.title}
              className="mode-card rounded-xl p-6 border transition-all duration-300"
              style={{
                background: '#14141f',
                borderColor: 'rgba(255,255,255,0.06)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${mode.accentColor}40`;
                e.currentTarget.style.boxShadow = `0 4px 20px ${mode.accentMuted}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center mb-4"
                style={{ background: mode.accentMuted }}
              >
                <Icon className="w-5 h-5" style={{ color: mode.accentColor }} />
              </div>

              {/* Title */}
              <h3 className="text-xl font-semibold text-white mb-2">{mode.title}</h3>

              {/* Description */}
              <p className="text-sm text-gray-400 mb-4">{mode.description}</p>

              {/* Items */}
              <div className="flex flex-wrap gap-2">
                {mode.items.map((item) => (
                  <span
                    key={item}
                    className="text-xs px-3 py-1 rounded-full"
                    style={{
                      background: mode.accentMuted,
                      color: mode.accentColor,
                    }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
