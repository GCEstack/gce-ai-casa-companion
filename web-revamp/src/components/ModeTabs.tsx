import { Play, BookOpen, Heart } from 'lucide-react';

export type TabMode = 'play' | 'learn' | 'support';

interface ModeTabsProps {
  activeTab: TabMode;
  onTabChange: (tab: TabMode) => void;
}

const tabs: { id: TabMode; label: string; icon: React.ReactNode; accentColor: string }[] = [
  { id: 'play', label: 'Play', icon: <Play className="w-4 h-4" />, accentColor: '#f97316' },
  { id: 'learn', label: 'Learn', icon: <BookOpen className="w-4 h-4" />, accentColor: '#eab308' },
  { id: 'support', label: 'Support', icon: <Heart className="w-4 h-4" />, accentColor: '#ec4899' },
];

export default function ModeTabs({ activeTab, onTabChange }: ModeTabsProps) {
  return (
    <div className="flex items-center gap-2">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all duration-200 ease-out border"
            style={{
              background: isActive ? `${tab.accentColor}20` : 'transparent',
              borderColor: isActive ? tab.accentColor : 'rgba(255,255,255,0.12)',
              color: isActive ? tab.accentColor : '#9ca3af',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                e.currentTarget.style.color = '#ffffff';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.color = '#9ca3af';
              }
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
