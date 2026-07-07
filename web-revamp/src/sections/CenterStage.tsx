import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { Character, ModeConfig } from '@/types';
import type { UseVoiceChatReturn } from '@/hooks/useVoiceChat';
import MicButton from '@/components/MicButton';
import { useApp } from '@/context/AppContext';
import { useCharacterVoice } from '@/hooks/useCharacterVoice';
import { getCharacterVideos } from '@/lib/characterVideos';

interface CenterStageProps {
  character: Character;
  activeMode: ModeConfig;
  voice: UseVoiceChatReturn;
}

export default function CenterStage({ character, activeMode, voice }: CenterStageProps) {
  const { state } = useApp();
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

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-full py-8 px-4">
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

      {/* Tap to Talk */}
      <div ref={actionsRef} className="flex flex-col items-center gap-3 mt-8">
        <MicButton
          isListening={voice.turnState === 'listening'}
          isProcessing={voice.turnState === 'processing'}
          isSpeaking={voice.turnState === 'speaking'}
          accentColor={character.accentColor}
          onPress={() => {
            voice.toggleRecording();
          }}
          disabled={!voice.isConnected}
        />
        <span className="text-sm font-medium text-white/80 tracking-wider uppercase">Tap to Talk</span>
      </div>
    </div>
  );
}
