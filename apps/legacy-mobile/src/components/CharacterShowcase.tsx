import { useEffect, useRef } from 'react';
import type { Character } from '@/types';
import { getCharacterVideos } from '@/lib/characterVideos';

interface CharacterShowcaseProps {
  character: Character;
  isSpeaking?: boolean;
}

export default function CharacterShowcase({ character, isSpeaking = false }: CharacterShowcaseProps) {
  const idleRef = useRef<HTMLVideoElement>(null);
  const speakingRef = useRef<HTMLVideoElement>(null);
  const { idle: idleVideo, speaking: speakingVideo } = getCharacterVideos(character.slug);
  const hasVideo = !!idleVideo;

  useEffect(() => {
    if (isSpeaking) {
      idleRef.current?.pause();
      speakingRef.current?.play().catch(() => {});
    } else {
      speakingRef.current?.pause();
      idleRef.current?.play().catch(() => {});
    }
  }, [isSpeaking]);

  return (
    <div className="relative w-64 h-80 mx-auto rounded-2xl overflow-hidden bg-black shadow-lg">
      {hasVideo ? (
        <>
          <video
            ref={idleRef}
            src={idleVideo!}
            className={`absolute inset-0 w-full h-full object-cover ${isSpeaking ? 'opacity-0' : 'opacity-100'}`}
            autoPlay
            muted
            loop
            playsInline
          />
          {speakingVideo && (
            <video
              ref={speakingRef}
              src={speakingVideo}
              className={`absolute inset-0 w-full h-full object-cover ${isSpeaking ? 'opacity-100' : 'opacity-0'}`}
              muted
              loop
              playsInline
            />
          )}
        </>
      ) : (
        <img
          src={character.portrait}
          alt={character.name}
          className="w-full h-full object-cover"
        />
      )}
    </div>
  );
}
