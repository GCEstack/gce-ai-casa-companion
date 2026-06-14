import { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Hand,
  BookOpen,
  Music,
  Globe,
  FlaskConical,
  Languages,
  Pencil,
  Code,
  Wind,
  Trophy,
  GraduationCap,
} from 'lucide-react';
import type { ModeConfig } from '@/types';
import { allModes, playModes, learnModes, supportModes } from '@/lib/modes';

const iconMap: Record<string, React.ReactNode> = {
  Hand: <Hand className="w-4 h-4" />,
  BookOpen: <BookOpen className="w-4 h-4" />,
  Music: <Music className="w-4 h-4" />,
  Globe: <Globe className="w-4 h-4" />,
  FlaskConical: <FlaskConical className="w-4 h-4" />,
  Languages: <Languages className="w-4 h-4" />,
  Pencil: <Pencil className="w-4 h-4" />,
  Code: <Code className="w-4 h-4" />,
  Wind: <Wind className="w-4 h-4" />,
  Trophy: <Trophy className="w-4 h-4" />,
  GraduationCap: <GraduationCap className="w-4 h-4" />,
};

interface ModeDropdownProps {
  activeMode: ModeConfig;
  onModeChange: (mode: ModeConfig) => void;
}

export default function ModeDropdown({ activeMode, onModeChange }: ModeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const introduction = allModes[0];

  return (
    <div ref={dropdownRef} className="relative z-20">
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm backdrop-blur-xl border transition-all duration-200"
        style={{
          background: 'rgba(20,20,30,0.8)',
          borderColor: 'rgba(255,255,255,0.1)',
        }}
      >
        {iconMap[activeMode.icon] || <Hand className="w-4 h-4" />}
        <span className="text-xs uppercase tracking-wider text-gray-500">Mode</span>
        <span className="text-white font-medium">{activeMode.label}</span>
        <ChevronDown
          className="w-4 h-4 text-gray-400 transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[-1]" onClick={() => setIsOpen(false)} />

          <div
            className="absolute top-full left-0 mt-2 w-80 rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
            style={{
              background: '#14141f',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            {/* Introduction */}
            <div className="p-2">
              <button
                onClick={() => {
                  onModeChange(introduction);
                  setIsOpen(false);
                }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors"
                style={{
                  background: activeMode.slug === introduction.slug ? 'rgba(212,168,67,0.15)' : 'transparent',
                }}
              >
                <span style={{ color: introduction.accentColor }}>{iconMap[introduction.icon]}</span>
                <div>
                  <div className="text-sm text-white font-medium">{introduction.label}</div>
                  <div className="text-xs text-gray-500">{introduction.description}</div>
                </div>
                {activeMode.slug === introduction.slug && (
                  <span className="ml-auto text-xs" style={{ color: introduction.accentColor }}>Active</span>
                )}
              </button>
            </div>

            {/* Play Section */}
            <div className="border-t border-white/5">
              <div className="px-4 py-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                <span className="text-[10px] uppercase tracking-widest text-orange-500 font-semibold">Play</span>
              </div>
              <div className="p-2 pt-0 grid grid-cols-2 gap-1">
                {playModes.map((mode) => (
                  <button
                    key={mode.slug}
                    onClick={() => {
                      onModeChange(mode);
                      setIsOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5"
                    style={{
                      background: activeMode.slug === mode.slug ? 'rgba(249,115,22,0.15)' : 'transparent',
                    }}
                  >
                    <span className="text-orange-400">{iconMap[mode.icon]}</span>
                    <span className="text-xs text-gray-300">{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Learn Section */}
            <div className="border-t border-white/5">
              <div className="px-4 py-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                <span className="text-[10px] uppercase tracking-widest text-yellow-500 font-semibold">Learn</span>
              </div>
              <div className="p-2 pt-0 grid grid-cols-2 gap-1">
                {learnModes.map((mode) => (
                  <button
                    key={mode.slug}
                    onClick={() => {
                      onModeChange(mode);
                      setIsOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5"
                    style={{
                      background: activeMode.slug === mode.slug ? 'rgba(234,179,8,0.15)' : 'transparent',
                    }}
                  >
                    <span className="text-yellow-400">{iconMap[mode.icon]}</span>
                    <span className="text-xs text-gray-300">{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Support Section */}
            <div className="border-t border-white/5">
              <div className="px-4 py-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
                <span className="text-[10px] uppercase tracking-widest text-pink-500 font-semibold">Support</span>
              </div>
              <div className="p-2 pt-0 grid grid-cols-2 gap-1">
                {supportModes.map((mode) => (
                  <button
                    key={mode.slug}
                    onClick={() => {
                      onModeChange(mode);
                      setIsOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors hover:bg-white/5"
                    style={{
                      background: activeMode.slug === mode.slug ? 'rgba(236,72,153,0.15)' : 'transparent',
                    }}
                  >
                    <span className="text-pink-400">{iconMap[mode.icon]}</span>
                    <span className="text-xs text-gray-300">{mode.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
