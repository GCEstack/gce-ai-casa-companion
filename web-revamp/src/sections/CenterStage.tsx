import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { Character } from '@/types';
import type { UseVoiceChatReturn } from '@/hooks/useVoiceChat';
import MicButton from '@/components/MicButton';
import { useCharacterVoice } from '@/hooks/useCharacterVoice';
import { getCharacterVideos } from '@/lib/characterVideos';

interface CenterStageProps {
  character: Character;
  voice: UseVoiceChatReturn;
}

export default function CenterStage({ character, voice }: CenterStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const characterRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const micRef = useRef<HTMLDivElement>(null);

  const { playVoice } = useCharacterVoice(character);

  // Entrance animation
  useGSAP(() => {
    const tl = gsap.timeline();

    if (stageRef.current) {
      tl.fromTo(
        stageRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.6, ease: 'power2.out' },
        0
      );
    }

    if (characterRef.current) {
      tl.fromTo(
        characterRef.current,
        { scale: 0.9, opacity: 0, y: 30 },
        { scale: 1, opacity: 1, y: 0, duration: 0.9, ease: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        0.1
      );
    }

    if (nameRef.current) {
      tl.fromTo(
        nameRef.current,
        { y: -20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' },
        0.4
      );
    }

    if (micRef.current) {
      tl.fromTo(
        micRef.current,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' },
        0.6
      );
    }
  }, { dependencies: [character.slug] });

  const { idle: idleVideo, speaking: rawSpeakingVideo } = getCharacterVideos(character.slug);
  const hasIdleVideo = !!idleVideo;
  const speakingVideo = rawSpeakingVideo || idleVideo;

  const turnState = voice.turnState ?? 'idle';
  const isListening = turnState === 'listening';
  const isProcessing = turnState === 'processing';
  const isSpeaking = turnState === 'speaking';

  const micLabel = isListening
    ? 'Listening...'
    : isProcessing
    ? 'Thinking...'
    : isSpeaking
    ? 'Speaking...'
    : 'Tap to Talk';

  return (
    <div
      ref={stageRef}
      className="relative flex-1 flex flex-col items-center justify-between min-h-full w-full overflow-hidden"
    >
      {/* Top: character name */}
      <div className="relative z-20 pt-8 md:pt-12 px-4 text-center">
        <h1
          ref={nameRef}
          className="text-3xl md:text-5xl font-black text-white tracking-tight"
          style={{
            textShadow: `0 0 60px ${character.accentColor}60, 0 2px 20px rgba(0,0,0,0.5)`,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {character.name}
        </h1>
      </div>

      {/* Center: full-screen character */}
      <div
        ref={characterRef}
        className="relative z-10 flex-1 flex items-center justify-center w-full px-4 py-4 cursor-pointer"
        onClick={playVoice}
        style={{ maxHeight: '70vh' }}
      >
        <div
          className="relative w-full h-full max-w-[600px] max-h-[70vh] flex items-center justify-center"
          style={{
            filter: isListening
              ? `drop-shadow(0 0 30px rgba(239,68,68,0.5))`
              : `drop-shadow(0 0 40px ${character.accentColor}40)`,
            transition: 'filter 0.3s ease',
          }}
        >
          {hasIdleVideo ? (
            <>
              <video
                className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${
                  isSpeaking ? 'opacity-0' : 'opacity-100'
                }`}
                src={idleVideo!}
                autoPlay
                loop
                muted
                playsInline
                webkit-playsinline="true"
              />
              <video
                className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${
                  isSpeaking ? 'opacity-100' : 'opacity-0'
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
              className="w-full h-full object-contain portrait-breathe-loop"
            />
          )}
        </div>
      </div>

      {/* Bottom: Tap to Talk */}
      <div
        ref={micRef}
        className="relative z-20 flex flex-col items-center pb-10 md:pb-14"
      >
        <MicButton
          isListening={isListening}
          isProcessing={isProcessing}
          isSpeaking={isSpeaking}
          accentColor={character.accentColor}
          onPress={() => {
            voice.toggleRecording();
          }}
          disabled={!voice.isConnected}
        />
        <span
          className="mt-4 text-[11px] md:text-xs font-bold tracking-[0.2em] uppercase transition-colors duration-300"
          style={{
            color: isListening || isSpeaking ? character.accentColor : 'rgba(255,255,255,0.6)',
            fontFamily: 'IBM Plex Mono, monospace',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}
        >
          {micLabel}
        </span>
      </div>
    </div>
  );
}
