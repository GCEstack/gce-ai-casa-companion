import { useState } from 'react';
import VideoBackground from '@/components/VideoBackground';
import ParticleField from '@/components/ParticleField';
import ModeTabs, { type TabMode } from '@/components/ModeTabs';
import ScrollIndicator from '@/components/ScrollIndicator';

export default function HeroSection() {
  const [activeTab, setActiveTab] = useState<TabMode>('play');

  const handleTabChange = (tab: TabMode) => {
    setActiveTab(tab);
    // On landing page, tab switch could scroll to the modes section
    // For now, just update the active state
  };

  return (
    <section className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden">
      {/* Background layers */}
      <VideoBackground blur={60} brightness={0.4} overlayOpacity={0.85} />
      <ParticleField count={60} hueMin={40} hueMax={55} />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-4">
        {/* Logo */}
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-2xl font-extrabold text-white tracking-tight">CASA</span>
          <span className="w-2 h-2 rounded-full bg-[#d4a843]" />
        </div>

        {/* Tagline */}
        <p className="text-sm text-gray-400 mb-8">
          Voice companion. Real personality. Real-time stories.
        </p>

        {/* Mode Tabs */}
        <ModeTabs activeTab={activeTab} onTabChange={handleTabChange} />

        {/* Spacer */}
        <div className="h-12" />

        {/* CTA to scroll */}
        <button
          onClick={() => {
            document.getElementById('characters')?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors tracking-widest uppercase"
        >
          Pick your companion
        </button>
      </div>

      {/* Scroll indicator */}
      <ScrollIndicator />
    </section>
  );
}
