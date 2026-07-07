import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { Character } from '@/types';
import type { UseVoiceChatReturn } from '@/hooks/useVoiceChat';
import MicButton from '@/components/MicButton';

interface CenterStageProps {
  character: Character;
  voice: UseVoiceChatReturn;
}

const MODE_BUTTONS = [
  { label: 'TEACH', mode: 'teaching' },
  { label: 'CALM', mode: 'calm' },
  { label: 'LAUGH', mode: 'laugh' },
  { label: 'STORY', mode: 'story' },
];

export default function CenterStage({ character, voice }: CenterStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const micRef = useRef<HTMLDivElement>(null);
  const modesRef = useRef<HTMLDivElement>(null);

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

    if (nameRef.current) {
      tl.fromTo(
        nameRef.current,
        { y: -20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' },
        0.2
      );
    }

    if (micRef.current) {
      tl.fromTo(
        micRef.current,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' },
        0.4
      );
    }

    if (modesRef.current) {
      tl.fromTo(
        modesRef.current,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' },
        0.5
      );
    }
  }, { dependencies: [character.slug] });

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

  const handleModeClick = (mode: string) => {
    window.dispatchEvent(new CustomEvent('modeswitch', { detail: mode }));
  };

  return (
    <div
      ref={stageRef}
      className="relative flex-1 flex flex-col items-center justify-between min-h-full w-full overflow-hidden"
    >
      {/* Top: character name */}
      <div className="relative z-20 pt-8 md:pt-12 px-4 text-center">
        <h1
          ref={nameRef}
          className="text-4xl md:text-6xl font-black text-white tracking-tight"
          style={{
            textShadow: `0 0 60px ${character.accentColor}80, 0 2px 20px rgba(0,0,0,0.7)`,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {character.name}
        </h1>
      </div>

      {/* Bottom: mic + mode buttons */}
      <div className="relative z-20 flex flex-col items-center pb-10 md:pb-14 gap-6">
        <div ref={micRef} className="flex flex-col items-center">
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
              color: isListening || isSpeaking ? character.accentColor : 'rgba(255,255,255,0.8)',
              fontFamily: 'IBM Plex Mono, monospace',
              textShadow: '0 2px 10px rgba(0,0,0,0.7)',
            }}
          >
            {micLabel}
          </span>
        </div>

        {/* Mode buttons */}
        <div ref={modesRef} className="flex items-center gap-2 md:gap-3 px-4 flex-wrap justify-center">
          {MODE_BUTTONS.map(({ label, mode }) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleModeClick(mode)}
              className="px-4 py-2 rounded-full text-xs md:text-sm font-bold uppercase tracking-wider border transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                background: 'rgba(0,0,0,0.4)',
                borderColor: character.accentColor,
                color: character.accentColor,
                textShadow: '0 1px 4px rgba(0,0,0,0.7)',
                boxShadow: `0 0 20px ${character.accentColor}30`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = character.accentColor;
                e.currentTarget.style.color = '#000';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.4)';
                e.currentTarget.style.color = character.accentColor;
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
