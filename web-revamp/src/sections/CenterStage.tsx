import { useRef, useCallback, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { Hand, Waves } from 'lucide-react';
import { toast } from 'sonner';
import type { Character, ModeConfig } from '@/types';
import type { UseVoiceChatReturn } from '@/hooks/useVoiceChat';
import VoiceWaveform from '@/components/VoiceWaveform';
import MicButton from '@/components/MicButton';
import ModeDropdown from '@/components/ModeDropdown';
import { useApp } from '@/context/AppContext';
import { useCharacterVoice } from '@/hooks/useCharacterVoice';
import { getCharacterVideos } from '@/lib/characterVideos';

interface CenterStageProps {
  character: Character;
  activeMode: ModeConfig;
  onModeChange: (mode: ModeConfig) => void;
  voice: UseVoiceChatReturn;
}

export default function CenterStage({ character, activeMode, onModeChange, voice }: CenterStageProps) {
  const { state, dispatch } = useApp();
  const portraitRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [isReacting, setIsReacting] = useState(false);

  const { playVoice } = useCharacterVoice(character);

  const handleModeChange = useCallback(
    (mode: ModeConfig) => {
      if (mode.category !== 'introduction' && !state.isSpeaking) {
        setIsReacting(true);
      }
      onModeChange(mode);
    },
    [onModeChange, state.isSpeaking]
  );

  // Entrance animation
  useGSAP(() => {
    const tl = gsap.timeline();

    if (portraitRef.current) {
      tl.fromTo(
        portraitRef.current,
        { scale: 0.85, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.8, ease: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        0
      );
    }

    if (nameRef.current) {
      tl.fromTo(
        nameRef.current,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' },
        0.3
      );
    }

    if (subtitleRef.current) {
      tl.fromTo(
        subtitleRef.current,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out' },
        0.45
      );
    }

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

  const subtitleText = `${character.description} · ${activeMode.label}`;

  const staticImage = character.showcase || character.portrait || `/characters/${character.slug}.png`;
  const { speaking: speakingVideo } = getCharacterVideos(character.slug);
  const hasSpeakingVideo = !!speakingVideo;

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

  const isListening = turnState === 'listening';
  const isThinking = turnState === 'processing';
  const isSpeaking = state.isSpeaking;
  const shouldCssSpeak = isSpeaking && !hasSpeakingVideo;

  const avatarWrapperClass = [
    'relative rounded-2xl overflow-hidden cursor-pointer',
    isListening ? 'avatar-listening' : '',
    isThinking ? 'avatar-thinking' : '',
    shouldCssSpeak ? 'avatar-speaking' : '',
    isReacting ? 'avatar-reaction' : '',
  ].join(' ');

  return (
    <div className="flex-1 flex flex-col items-center justify-center py-8 px-4">
      {/* Character Portrait */}
      <div
        ref={portraitRef}
        className={avatarWrapperClass}
        style={{
          width: 'min(420px, 75vw)',
          height: 'min(540px, 95vw)',
          maxWidth: 420,
          maxHeight: 540,
          background: '#000000',
          boxShadow: isThinking
            ? 'none'
            : `0 8px 32px rgba(0,0,0,0.3), 0 0 60px ${character.accentColor}20${isSpeaking ? `, 0 0 40px ${character.accentColor}80` : ''}`,
        }}
        onClick={playVoice}
        onAnimationEnd={() => setIsReacting(false)}
      >
        {/* Static base image — completely still when idle */}
        <img
          src={staticImage}
          alt={character.name}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />

        {/* Speaking video overlay — only plays while talking */}
        {isSpeaking && hasSpeakingVideo && (
          <video
            className="absolute inset-0 w-full h-full object-cover"
            src={speakingVideo!}
            autoPlay
            muted
            playsInline
            webkit-playsinline="true"
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
        <div className="mt-4 max-w-2xl px-4 text-center space-y-2">
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
            isListening={isListening}
            isProcessing={isThinking}
            isSpeaking={isSpeaking}
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

        {/* Mode selector */}
        <div className="mt-2">
          <ModeDropdown activeMode={activeMode} onModeChange={handleModeChange} />
        </div>

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

        {/* Phone mic toggle */}
        <button
          onClick={() => dispatch({ type: 'SET_CONNECTION_MODE', payload: state.connectionMode === 'relay' ? 'local' : 'relay' })}
          className="text-xs px-3 py-1.5 rounded-full border border-white/10 text-white/70 hover:bg-white/5"
        >
          {state.connectionMode === 'relay' ? 'Use this device' : 'Use phone mic'}
        </button>
      </div>
    </div>
  );
}
