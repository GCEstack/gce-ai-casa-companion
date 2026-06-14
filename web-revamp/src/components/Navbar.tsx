import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { toast } from 'sonner';
import { Power } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useVoiceChat } from '@/hooks/useVoiceChat';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const { state } = useApp();
  const voice = useVoiceChat(state.selectedCharacter?.slug ?? '');

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleToggleConnect = async () => {
    if (voice.isConnected) {
      voice.disconnect();
      toast.info('Disconnected', {
        description: 'Microphone access released.',
      });
      return;
    }
    try {
      await voice.connect();
      toast.success('Microphone connected', {
        description: 'You can now talk with your companion.',
      });
    } catch {
      toast.error('Microphone access denied', {
        description: 'Please allow microphone access in your browser settings.',
      });
    }
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6 transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(10,10,15,0.9)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.05)' : '1px solid transparent',
      }}
    >
      {/* Left: Logo */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
      >
        <span className="text-lg font-extrabold text-white tracking-tight">Casa Companion</span>
        <span className="w-1.5 h-1.5 rounded-full bg-[#d4a843]" />
      </button>

      {/* Center: Context label (only on character page) */}
      {!isHome && (
        <span className="absolute left-1/2 -translate-x-1/2 text-xs text-gray-500 hidden md:block">
          Talking with your companion
        </span>
      )}

      {/* Right: Connect / Disconnect toggle */}
      <button
        className={`connect-btn flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border ${
          voice.isConnected ? 'connected' : 'disconnected'
        }`}
        onClick={handleToggleConnect}
      >
        <Power className="w-3 h-3" />
        <span className={`status-dot ${voice.isConnected ? 'green' : 'red'}`} />
        {voice.isConnected ? 'Connected' : 'Connect'}
      </button>
    </nav>
  );
}
