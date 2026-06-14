import { useEffect, useRef } from 'react';
import type { Character } from '@/types';

export function useCharacterVoice(character: Character | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!character) return;

    // Attempt to play voice intro on mount
    const audio = new Audio(character.voiceIntro);
    audioRef.current = audio;

    // Try autoplay - may be blocked by browser policy
    audio.play().catch(() => {
      // Autoplay blocked - user interaction required
      // This is expected behavior
    });

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [character]);

  function playVoice() {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }

  return { playVoice };
}
