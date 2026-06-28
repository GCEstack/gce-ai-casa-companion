import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  Volume2,
  Upload,
  Lightbulb,
  DollarSign,
  Zap,
  Activity,
  Mic,
  Ear,
  RotateCcw,
  Power,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Character } from '@/types';
import SidebarPanel from '@/components/SidebarPanel';
import StatusBadge from '@/components/StatusBadge';
import { useApp } from '@/context/AppContext';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useVoiceChat } from '@/hooks/useVoiceChat';

interface RightSidebarProps {
  character?: Character | null;
  compact?: boolean;
}

export default function RightSidebar({ character, compact }: RightSidebarProps) {
  const { state, dispatch } = useApp();
  const { resetOnboarding, goToPietroWithOnboarding } = useOnboarding();
  const containerRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceChat(character?.slug ?? 'pietro');

  // Entrance animation
  useGSAP(() => {
    if (!containerRef.current) return;

    const panels = containerRef.current.querySelectorAll('.sidebar-panel-item');
    gsap.fromTo(
      panels,
      { x: 30, opacity: 0 },
      {
        x: 0,
        opacity: 1,
        duration: 0.6,
        ease: 'power3.out',
        stagger: 0.08,
        delay: 0.2,
      }
    );
  }, { dependencies: [character?.slug, compact] });

  const handleToggleConnect = async () => {
    if (voice.isConnected) {
      voice.disconnect();
      toast.info('Disconnected');
      return;
    }
    try {
      await voice.connect();
      toast.success('Connected');
    } catch {
      toast.error('Microphone access denied');
    }
  };

  const connectButton = (
    <button
      type="button"
      className={`sidebar-connect-btn ${voice.isConnected ? 'connected' : ''}`}
      onClick={handleToggleConnect}
    >
      <Power className="w-4 h-4" />
      <span>{voice.isConnected ? '🟢 Connected' : '🔴 Connect'}</span>
    </button>
  );

  return (
    <aside
      ref={containerRef}
      className="right-sidebar hidden lg:flex flex-col w-[300px] h-full py-6 px-4 gap-4 overflow-y-auto"
    >
      {/* Connect button — always at the top */}
      <div className="sidebar-connect">{connectButton}</div>
      {!voice.isConnected && compact && (
        <p className="connect-hint">Connect to start talking</p>
      )}

      {compact ? (
        // Compact landing view: just status
        <div className="sidebar-panel-item">
          <SidebarPanel
            title="Status"
            titleColor="#14b8a6"
            icon={<Activity className="w-3.5 h-3.5" />}
          >
            <StatusBadge status={state.connectionStatus} showDot={true} />
          </SidebarPanel>
        </div>
      ) : (
        // Full character-page view
        <>
          {/* Voice Pipeline Panel */}
          <div className="sidebar-panel-item">
            <SidebarPanel
              title="Voice Pipeline"
              titleColor="#14b8a6"
              icon={<Activity className="w-3.5 h-3.5" />}
            >
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  background: 'rgba(20,184,166,0.15)',
                  color: '#14b8a6',
                }}
              >
                <Zap className="w-3 h-3" />
                Voice Active
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                Deepgram STT &rarr; GPT-4o-mini &rarr; OpenAI TTS
              </p>
            </SidebarPanel>
          </div>

          {/* Voice Output Panel */}
          <div className="sidebar-panel-item">
            <SidebarPanel
              title="Voice Output"
              titleColor="#d4a843"
              icon={<Volume2 className="w-3.5 h-3.5" />}
            >
              <button
                className="w-full px-3 py-2 rounded-full text-xs font-medium border transition-all"
                style={{
                  borderColor: state.voiceEnabled ? '#d4a843' : 'rgba(255,255,255,0.12)',
                  color: state.voiceEnabled ? '#d4a843' : '#6b7280',
                }}
              >
                {state.voiceEnabled ? `On \u2014 Character speaks` : `Off \u2014 Character muted`}
              </button>
              <p className="mt-2 text-[11px] text-gray-500">Plays AI generated audio</p>
            </SidebarPanel>
          </div>

          {/* Voice Commands Panel */}
          <div className="sidebar-panel-item">
            <SidebarPanel
              title="Voice Commands"
              titleColor="#22c55e"
              icon={<Mic className="w-3.5 h-3.5" />}
            >
              <div className="space-y-2">
                <button
                  onClick={() => dispatch({ type: 'TOGGLE_WAKE_WORD' })}
                  disabled={state.connectionStatus !== 'online'}
                  className="w-full px-3 py-2 rounded-full text-xs font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{
                    borderColor: state.wakeWordEnabled ? '#22c55e' : 'rgba(255,255,255,0.12)',
                    color: state.wakeWordEnabled ? '#22c55e' : '#6b7280',
                    background: state.wakeWordEnabled ? 'rgba(34,197,94,0.1)' : 'transparent',
                  }}
                >
                  <Ear className="w-3 h-3" />
                  {state.wakeWordEnabled ? "Say 'Hello' to Talk ON" : "Say 'Hello' to Talk OFF"}
                </button>
                <button
                  onClick={() => dispatch({ type: 'TOGGLE_BARGE_IN' })}
                  disabled={state.connectionStatus !== 'online'}
                  className="w-full px-3 py-2 rounded-full text-xs font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{
                    borderColor: state.bargeInEnabled ? '#f97316' : 'rgba(255,255,255,0.12)',
                    color: state.bargeInEnabled ? '#f97316' : '#6b7280',
                    background: state.bargeInEnabled ? 'rgba(249,115,22,0.1)' : 'transparent',
                  }}
                >
                  <Mic className="w-3 h-3" />
                  {state.bargeInEnabled ? 'Jump In to Talk ON' : 'Jump In to Talk OFF'}
                </button>
                {state.isWakeWordListening && (
                  <div className="flex items-center gap-1.5 text-[10px] text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Wake word listening
                  </div>
                )}
                {state.isBargeInActive && (
                  <div className="flex items-center gap-1.5 text-[10px] text-orange-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                    Barge-in active
                  </div>
                )}
              </div>
            </SidebarPanel>
          </div>

          {/* Voice Clone Panel */}
          <div className="sidebar-panel-item">
            <SidebarPanel
              title="Voice Clone"
              titleColor="#ec4899"
              icon={<Upload className="w-3.5 h-3.5" />}
            >
              <button
                className="w-full px-3 py-2 rounded-full text-xs font-medium border border-dashed transition-all hover:border-opacity-50"
                style={{
                  borderColor: 'rgba(255,255,255,0.15)',
                  color: '#9ca3af',
                }}
              >
                Coming soon
              </button>
              <p className="mt-2 text-[11px] text-gray-500">Clone a voice for your companion to use</p>
            </SidebarPanel>
          </div>

          {/* Pro Tips Panel */}
          <div className="sidebar-panel-item">
            <SidebarPanel
              title="Pro Tips"
              titleColor="#9ca3af"
              icon={<Lightbulb className="w-3.5 h-3.5" />}
            >
              <ul className="space-y-2">
                <li className="text-[11px] text-gray-400 leading-relaxed">
                  <span className="text-gray-500 mr-1">&bull;</span>
                  Your companion&apos;s personality is based on their animal.
                </li>
                <li className="text-[11px] text-gray-400 leading-relaxed">
                  <span className="text-gray-500 mr-1">&bull;</span>
                  Ask them to tell a story &mdash; they love it.
                </li>
                <li className="text-[11px] text-gray-400 leading-relaxed">
                  <span className="text-gray-500 mr-1">&bull;</span>
                  Press Spacebar to talk hands-free.
                </li>
              </ul>
            </SidebarPanel>
          </div>

          {/* Session Cost Panel */}
          <div className="sidebar-panel-item">
            <SidebarPanel
              title="Session Cost"
              titleColor="#14b8a6"
              icon={<DollarSign className="w-3.5 h-3.5" />}
            >
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono text-white">Active session</span>
              </div>
              <p className="mt-2 text-[11px] text-gray-500">Real-time voice chat</p>
            </SidebarPanel>
          </div>

          {/* Status Panel */}
          <div className="sidebar-panel-item">
            <SidebarPanel
              title="Status"
              titleColor="#14b8a6"
              icon={<Activity className="w-3.5 h-3.5" />}
            >
              <StatusBadge status={state.connectionStatus} showDot={true} />
              <p className="mt-2 text-[11px] text-gray-500">
                {state.messageCount} message{state.messageCount !== 1 ? 's' : ''} this session
              </p>
              <div className="mt-2 pt-2 border-t border-white/5">
                <p className="text-[10px] text-gray-600">STT:</p>
                <p className="text-[11px] text-gray-500 font-mono">Deepgram STT ready</p>
              </div>
              <button
                onClick={() => {
                  resetOnboarding();
                  goToPietroWithOnboarding();
                }}
                className="w-full mt-3 px-3 py-2 rounded-full text-xs font-medium border transition-all flex items-center justify-center gap-2"
                style={{
                  borderColor: 'rgba(251,140,0,0.3)',
                  color: '#fb8c00',
                  background: 'rgba(251,140,0,0.1)',
                }}
              >
                <RotateCcw className="w-3 h-3" />
                Replay Intro
              </button>
            </SidebarPanel>
          </div>
        </>
      )}
    </aside>
  );
}
