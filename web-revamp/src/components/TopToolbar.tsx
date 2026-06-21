import { useState } from 'react';
import { Power } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { useVoiceChat } from '@/hooks/useVoiceChat';

interface MenuItem {
  label: string;
  mode: string;
  char?: string;
}

const MENU_ITEMS: Record<string, MenuItem[]> = {
  play: [
    { label: 'Story Time', mode: 'story' },
    { label: 'Music & Rhythm', mode: 'music' },
    { label: 'Geography', mode: 'geography' },
    { label: 'STEM Sparks', mode: 'stem' },
    { label: 'Coding', mode: 'coding' },
    { label: 'Art & Create', mode: 'creative' },
  ],
  learn: [
    { label: 'All Languages', mode: 'language' },
    { label: 'Homework Helper', mode: 'homework' },
    { label: 'Math Tutor', mode: 'math' },
    { label: 'Science Lab', mode: 'science' },
    { label: 'History', mode: 'history' },
    { label: 'Teaching Mode', mode: 'teaching' },
  ],
  support: [
    { label: 'Calm & Breathe', mode: 'calm' },
    { label: 'Check In', mode: 'checkin' },
    { label: 'Milestones', mode: 'milestones' },
    { label: 'Journal', mode: 'journal' },
  ],
  features: [
    { label: "Founder's Desk", mode: 'founder', char: 'pietro' },
    { label: 'Pun Factory', mode: 'pun', char: 'scheletro' },
    { label: 'Beat Lab', mode: 'beatlab', char: 'sacco' },
    { label: "Songwriter's Den", mode: 'songwriter', char: 'rocco' },
    { label: 'Crate Digger', mode: 'music', char: 'vinile' },
    { label: 'Study Mode', mode: 'study', char: 'spugna' },
    { label: 'Casa Kitchen', mode: 'recipe', char: 'mamma' },
    { label: 'Debate Arena', mode: 'debate', char: 'verita' },
    { label: 'Project Lab', mode: 'project', char: 'costruttore' },
    { label: 'Kitchen Lab', mode: 'cooking', char: 'cuoco' },
  ],
};

export default function TopToolbar() {
  const { state, dispatch } = useApp();

  if (state.connectionMode === 'relay') {
    return (
      <header className="top-toolbar">
        <div className="toolbar-brand">Casa Companion</div>
        <div className="flex items-center gap-2 text-xs text-white/70">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          Phone mic mode
        </div>
        <button
          type="button"
          className="connect-btn disconnected flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold border"
          onClick={() => dispatch({ type: 'SET_CONNECTION_MODE', payload: 'local' })}
        >
          <Power className="w-3 h-3" />
          Exit phone mic
        </button>
      </header>
    );
  }

  return <LocalToolbar />;
}

function LocalToolbar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useApp();
  const voice = useVoiceChat(state.selectedCharacter?.slug ?? '');
  const isLanding = location.pathname === '/';

  const handleItemClick = (item: MenuItem) => {
    if (item.char) {
      navigate(`/character/${item.char}`);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('modeswitch', { detail: item.mode }));
      }, 100);
    } else {
      window.dispatchEvent(new CustomEvent('modeswitch', { detail: item.mode }));
    }
    setOpenMenu(null);
  };

  const handleToggleConnect = async () => {
    if (voice.isConnected) {
      voice.disconnect();
      toast.info('Disconnected');
      return;
    }
    try {
      await voice.connect();
      toast.success('Microphone connected');
    } catch {
      toast.error('Microphone access denied');
    }
  };

  return (
    <header className="top-toolbar">
      <div className="toolbar-brand">Casa Companion</div>

      {!isLanding && (
        <nav className="toolbar-menus">
          {Object.entries(MENU_ITEMS).map(([key, items]) => (
            <div
              key={key}
              className="toolbar-menu"
              onMouseEnter={() => setOpenMenu(key)}
              onMouseLeave={() => setOpenMenu(null)}
            >
              <button className="toolbar-menu-btn" type="button">
                {key.charAt(0).toUpperCase() + key.slice(1)} ▼
              </button>
              {openMenu === key && (
                <div className="toolbar-dropdown">
                  {items.map((item) => (
                    <button
                      key={item.label}
                      className="toolbar-dropdown-item"
                      type="button"
                      onClick={() => handleItemClick(item)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      )}

      <button
        type="button"
        className={`connect-btn flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border ${
          voice.isConnected ? 'connected' : 'disconnected'
        }`}
        onClick={handleToggleConnect}
      >
        <Power className="w-3 h-3" />
        <span className={`status-dot ${voice.isConnected ? 'green' : 'red'}`} />
        {voice.isConnected ? 'Connected' : 'Connect'}
      </button>
    </header>
  );
}
