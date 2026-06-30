import { useRef, useCallback } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  Hand,
  Waves,
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
  Sparkles,
  Smartphone,
  Mic,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Character, ModeConfig } from '@/types';
import type { UseVoiceChatReturn } from '@/hooks/useVoiceChat';
import VoiceWaveform from '@/components/VoiceWaveform';
import MicButton from '@/components/MicButton';
import { useApp } from '@/context/AppContext';
import { useCharacterVoice } from '@/hooks/useCharacterVoice';
import { allModes, modeFromFeature } from '@/lib/modes';
import { characterConfigs } from '@/lib/characterConfig';
import { getCharacterVideos } from '@/lib/characterVideos';
import PairingPanel from '@/components/PairingPanel';

interface CenterStageProps {
  character: Character;
  activeMode: ModeConfig;
  onModeChange: (mode: ModeConfig) => void;
  voice: UseVoiceChatReturn;
  onRelaySessionReady?: (info: { sessionId: string; token: string }) => void;
}

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
  Sparkles: <Sparkles className="w-4 h-4" />,
};

const categoryLabel: Record<string, string> = {
  introduction: 'Intro',
  play: 'Play',
  learn: 'Learn',
  support: 'Support',
};

const categoryColor: Record<string, string> = {
  introduction: '#d4a843',
  play: '#f97316',
  learn: '#eab308',
  support: '#ec4899',
};

export default function CenterStage({ character, activeMode, onModeChange, voice, onRelaySessionReady }: CenterStageProps) {
  const { state, dispatch } = useApp();
  const portraitRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const { playVoice } = useCharacterVoice(character);

  // Entrance animation
  useGSAP(() => {
    const tl = gsap.timeline();

    // Portrait scale-in
    if (portraitRef.current) {
      tl.fromTo(
        portraitRef.current,
        { scale: 0.85, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.8, ease: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        0
      );
    }

    // Name fade-up
    if (nameRef.current) {
      tl.fromTo(
        nameRef.current,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' },
        0.3
      );
    }

    // Subtitle fade-up
    if (subtitleRef.current) {
      tl.fromTo(
        subtitleRef.current,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' },
        0.45
      );
    }

    // Action buttons
    if (actionsRef.current) {
      const buttons = actionsRef.current.querySelectorAll('button');
      tl.fromTo(
        buttons,
        { scale: 0.8, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, stagger: 0.1, ease: 'power3.out' },
        0.6
      );
    }
  }, { dependencies: [character.slug] });

  const subtitleText = `${character.description} \u00b7 ${activeMode.label}`;

  const { idle: idleVideo, speaking: rawSpeakingVideo } = getCharacterVideos(character.slug);
  const hasIdleVideo = !!idleVideo;
  const speakingVideo = rawSpeakingVideo || idleVideo;
  const glowFallback = state.isSpeaking && (!rawSpeakingVideo || !hasIdleVideo);

  const toggleConversationMode = useCallback(() => {
    const next = voice.conversationMode === 'turn-based' ? 'free-flow' : 'turn-based';
    voice.setConversationMode(next);
    toast.info(`Switched to ${next === 'turn-based' ? 'Turn-based' : 'Free-flow'} mode`);
  }, [voice]);

  const turnStateConfig: Record<
    import('@/types').TurnState,
    { label: string; bg: string; color: string; pulse?: boolean }
  > = {
    idle: {
      label: state.wakeWordEnabled ? 'Say "Hello" to start' : 'Press mic to talk',
      bg: 'rgba(255,255,255,0.08)',
      color: '#9ca3af',
    },
    listening: { label: 'Listening...', bg: '#ef4444', color: '#ffffff', pulse: true },
    processing: { label: 'Thinking...', bg: '#f97316', color: '#ffffff' },
    speaking: { label: 'Speaking...', bg: '#22c55e', color: '#ffffff' },
  };
  const turnState = voice.turnState ?? 'idle';
  const turnIndicator = turnStateConfig[turnState];

  const isFreeFlow = voice.conversationMode === 'free-flow';

  // Group modes by category preserving order
  const grouped = allModes.reduce<Record<string, ModeConfig[]>>((acc, mode) => {
    if (!acc[mode.category]) acc[mode.category] = [];
    acc[mode.category].push(mode);
    return acc;
  }, {});
  const categoryOrder = ['introduction', 'play', 'learn', 'support'];

  // Character-specific AI features from characterConfig.ts
  const config = characterConfigs[character.slug.toLowerCase()];
  const featureModes = config?.features.map((feature) => modeFromFeature(feature, character.accentColor)) ?? [];

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-8 px-4">
      {/* Character Portrait */}
      <div
        ref={portraitRef}
        className={`relative w-[340px] h-[460px] md:w-[420px] md:h-[540px] rounded-2xl overflow-hidden cursor-pointer transition-transform duration-300 hover:scale-[1.02] ${
          state.isRecording ? 'recording-ring' : ''
        }`}
        style={{
          background: '#000000',
          boxShadow: state.isRecording
            ? `0 0 0 4px rgba(239,68,68,0.6), 0 0 30px rgba(239,68,68,0.4), 0 8px 32px rgba(0,0,0,0.3), 0 0 60px ${character.accentColor}20${glowFallback ? `, 0 0 40px ${character.accentColor}80` : ''}`
            : `0 8px 32px rgba(0,0,0,0.3), 0 0 60px ${character.accentColor}20${glowFallback ? `, 0 0 40px ${character.accentColor}80` : ''}`,
        }}
        onClick={playVoice}
      >
        {hasIdleVideo ? (
          <>
            <video
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                state.isSpeaking ? 'opacity-0' : 'opacity-100'
              }`}
              src={idleVideo!}
              autoPlay
              loop
              muted
              playsInline
              webkit-playsinline="true"
            />
            <video
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                state.isSpeaking ? 'opacity-100' : 'opacity-0'
              }`}
              src={speakingVideo!}
              autoPlay
              muted
              playsInline
              webkit-playsinline="true"
            />
          </>
        ) : (
          <img
            src={`/characters/${character.slug}.png`}
            alt={character.name}
            className="w-full h-full object-cover portrait-breathe-loop"
          />
        )}

        {/* Hover overlay with hint */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-300 bg-black/20">
          <span className="text-xs text-white/80 font-medium tracking-wider uppercase">Click to hear me</span>
        </div>
      </div>

      {/* Voice waveform (when online or recording) */}
      {(state.connectionStatus === 'online' || state.isRecording) && (
        <div className="mt-4">
          <VoiceWaveform />
        </div>
      )}

      {/* Character Name */}
      <h1
        ref={nameRef}
        className="mt-6 text-5xl md:text-6xl font-bold text-white text-center"
        style={{ textShadow: `0 0 40px ${character.accentColor}40` }}
      >
        {character.name}
      </h1>

      {/* Subtitle */}
      <p ref={subtitleRef} className="mt-2 text-base text-gray-400 text-center italic">
        {subtitleText}
      </p>

      {/* Transcript / Response */}
      {(voice.lastTranscript || voice.lastResponse) && (
        <div className="mt-4 max-w-md px-4 text-center space-y-2">
          {voice.lastTranscript && (
            <p className="text-sm text-gray-400">
              <span className="font-medium text-gray-300">You:</span> {voice.lastTranscript}
            </p>
          )}
          {voice.lastResponse && (
            <p className="text-sm" style={{ color: character.accentColor }}>
              <span className="font-medium">{character.name}:</span> {voice.lastResponse}
            </p>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div ref={actionsRef} className="flex flex-col items-center gap-3 mt-5">
        <div className="flex items-center gap-3">
          <MicButton
            isListening={voice.turnState === 'listening'}
            isProcessing={voice.turnState === 'processing'}
            isSpeaking={voice.turnState === 'speaking'}
            accentColor={character.accentColor}
            onPress={() => {
              console.log('[MicButton] pressed, turnState:', voice.turnState);
              voice.toggleRecording();
            }}
            disabled={!voice.isConnected}
          />
        </div>

        {/* Turn-taking state indicator */}
        <div className="flex items-center gap-2 mt-1">
          <span
            className={`w-2 h-2 rounded-full ${turnIndicator.pulse ? 'animate-pulse' : ''}`}
            style={{ background: turnIndicator.bg }}
          />
          <span
            className="text-xs font-medium h-4"
            style={{ color: turnIndicator.color }}
          >
            {turnIndicator.label}
          </span>
        </div>

        {/* Connection mode toggle */}
        <button
          onClick={() => {
            const next = state.connectionMode === 'local' ? 'relay' : 'local';
            dispatch({ type: 'SET_CONNECTION_MODE', payload: next });
            toast.info(next === 'relay' ? 'Phone mic mode' : 'This device mic mode');
          }}
          className="flex items-center gap-2 mt-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
          style={{
            background: state.connectionMode === 'relay' ? `${character.accentColor}20` : 'rgba(255,255,255,0.06)',
            color: state.connectionMode === 'relay' ? character.accentColor : 'rgba(255,255,255,0.6)',
            border: `1px solid ${state.connectionMode === 'relay' ? `${character.accentColor}40` : 'rgba(255,255,255,0.08)'}`,
          }}
        >
          {state.connectionMode === 'relay' ? (
            <>
              <Smartphone className="w-3.5 h-3.5" />
              <span>Phone mic</span>
            </>
          ) : (
            <>
              <Mic className="w-3.5 h-3.5" />
              <span>This device</span>
            </>
          )}
        </button>

        {/* Relay pairing panel */}
        {state.connectionMode === 'relay' && !voice.isConnected && onRelaySessionReady && (
          <div className="mt-4">
            <PairingPanel
              characterSlug={character.slug}
              modeSlug={activeMode.slug}
              onSessionReady={onRelaySessionReady}
            />
          </div>
        )}

        {/* Conversation mode toggle */}
        <button
          onClick={toggleConversationMode}
          className="flex items-center gap-2 mt-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
          style={{
            background: isFreeFlow ? `${character.accentColor}20` : 'rgba(255,255,255,0.06)',
            color: isFreeFlow ? character.accentColor : 'rgba(255,255,255,0.6)',
            border: `1px solid ${isFreeFlow ? `${character.accentColor}40` : 'rgba(255,255,255,0.08)'}`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isFreeFlow
              ? `${character.accentColor}30`
              : 'rgba(255,255,255,0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isFreeFlow
              ? `${character.accentColor}20`
              : 'rgba(255,255,255,0.06)';
          }}
        >
          {isFreeFlow ? (
            <>
              <Waves className="w-3.5 h-3.5" />
              <span>Free-flow</span>
            </>
          ) : (
            <>
              <Hand className="w-3.5 h-3.5" />
              <span>Turn-based</span>
            </>
          )}
        </button>

        {/* Mode icon row */}
        <div className="mt-4 w-full max-w-md">
          {categoryOrder.map((category) => (
            <div key={category} className="mb-4">
              <div className="flex items-center gap-2 px-2 mb-2">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: categoryColor[category] }}
                />
                <span
                  className="text-[10px] uppercase tracking-widest font-semibold"
                  style={{ color: categoryColor[category] }}
                >
                  {categoryLabel[category]}
                </span>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {grouped[category]?.map((mode) => {
                  const isActive = activeMode.slug === mode.slug;
                  const color = categoryColor[mode.category];
                  return (
                    <button
                      key={mode.slug}
                      onClick={() => onModeChange(mode)}
                      className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-colors min-w-[64px]"
                      style={{
                        background: isActive ? `${color}20` : 'transparent',
                        border: `1px solid ${isActive ? `${color}50` : 'rgba(255,255,255,0.06)'}`,
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span style={{ color: isActive ? color : '#9ca3af' }}>
                        {iconMap[mode.icon] || <Hand className="w-4 h-4" />}
                      </span>
                      <span
                        className="text-[9px] text-center leading-tight max-w-[60px]"
                        style={{ color: isActive ? color : '#9ca3af' }}
                      >
                        {mode.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Character-specific AI Features */}
          {featureModes.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 px-2 mb-2">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: character.accentColor }}
                />
                <span
                  className="text-[10px] uppercase tracking-widest font-semibold"
                  style={{ color: character.accentColor }}
                >
                  Features
                </span>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {featureModes.map((mode) => {
                  const isActive = activeMode.slug === mode.slug;
                  const color = character.accentColor;
                  return (
                    <button
                      key={mode.slug}
                      onClick={() => onModeChange(mode)}
                      title={mode.description}
                      className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-colors min-w-[64px]"
                      style={{
                        background: isActive ? `${color}20` : 'transparent',
                        border: `1px solid ${isActive ? `${color}50` : 'rgba(255,255,255,0.06)'}`,
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <span style={{ color: isActive ? color : '#9ca3af' }}>
                        {iconMap[mode.icon] || <Sparkles className="w-4 h-4" />}
                      </span>
                      <span
                        className="text-[9px] text-center leading-tight max-w-[60px]"
                        style={{ color: isActive ? color : '#9ca3af' }}
                      >
                        {mode.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
