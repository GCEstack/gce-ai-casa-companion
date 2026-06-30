import { useState, useRef, useCallback, useEffect } from 'react';
import './PietroHost.css';
import { useVoiceChat } from '@/hooks/useVoiceChat';
import { fetchBackendTTS } from '@/lib/tts';

const PIETRO_WELCOME = `Hey there! Welcome to Casa Companion. I'm Pietro — the founder. You got a whole crew of AI companions here. Each one's got their own personality and skills. Want help with homework? Hit up Maestra. Need to write a song? Rocco's your guy. Want to chill? Battito's got you. Just pick a companion from below, or stick with me. So... what's on your mind?`;

// === SILENT AUDIO UNLOCK ===
// This is the trick. One silent beep in the click handler unlocks everything.
const unlockAudio = () => {
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const ctx = new AudioContextClass();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  gainNode.gain.value = 0.01; // Nearly silent
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.001);

  // Also unlock speech synthesis
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
};

// === FALLBACK: Browser Speech Synthesis (100% free, no API key) ===
const speakWithBrowserFallback = (text: string) => {
  if (!window.speechSynthesis) return;

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.0;
  utter.pitch = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find((voice) => voice.name.includes('Google') || voice.name.includes('Samantha'));
  if (v) utter.voice = v;
  window.speechSynthesis.speak(utter);
};

export default function PietroHost() {
  const voice = useVoiceChat('pietro');

  const [state, setState] = useState<'idle' | 'speaking' | 'ready'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // === THE ONE FUNCTION THAT MATTERS ===
  const handleTap = useCallback(async () => {
    // STEP 1: Unlock audio FIRST, synchronously, in the click handler
    unlockAudio();

    // STEP 2: Set speaking state
    setState('speaking');

    try {
      // STEP 3: Fetch TTS audio from the Casa backend (never OpenAI directly)
      const blob = await fetchBackendTTS(PIETRO_WELCOME, 'pietro', 'default');
      const url = URL.createObjectURL(blob);

      // STEP 4: Create and play audio
      const audio = new Audio(url);
      audioRef.current = audio;

      // The .play() MUST happen in a direct promise chain from the click
      // No setTimeout, no extra awaits between click and play()
      await audio.play();

      // STEP 5: When done, show mic
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setState('ready');
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setState('ready');
      };
    } catch (err) {
      console.error('TTS failed:', err);
      // Fallback: use browser speech synthesis (free, always works)
      speakWithBrowserFallback(PIETRO_WELCOME);
      setState('ready');
    }
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleMicTalk = useCallback(async () => {
    // Interrupt welcome if it's still playing
    if (state === 'speaking' && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setState('ready');
    }

    if (voice.turnState === 'speaking') {
      voice.stopSpeaking();
      return;
    }

    if (!voice.isConnected) {
      await voice.connect();
    }

    voice.toggleRecording();
  }, [state, voice]);

  return (
    <div className="pietro-host">
      {/* Portrait */}
      <div className="pietro-portrait-wrap">
        <img
          src="/characters/pietro.png"
          alt="Pietro"
          className={`pietro-portrait ${state === 'speaking' ? 'speaking' : ''}`}
        />
        {state === 'speaking' && <div className="speak-ring" />}
      </div>

      <span className="pietro-badge">Meet the Founder</span>
      <h2 className="pietro-title">Pietro</h2>

      {/* STATE: IDLE — Show tap button */}
      {state === 'idle' && (
        <button className="pietro-tap-btn" onClick={handleTap} type="button">
          <span className="tap-mic">🎤</span>
          <span>Tap to Meet Pietro</span>
        </button>
      )}

      {/* STATE: SPEAKING — Show indicator */}
      {state === 'speaking' && (
        <div className="pietro-speaking-indicator">
          <span className="pulse-dot" />
          Speaking...
        </div>
      )}

      {/* STATE: READY — Show mic for talking back */}
      {state === 'ready' && (
        <button className="pietro-mic-btn" onClick={handleMicTalk} type="button">
          <span className="mic-icon">🎤</span>
          <span>Tap to Talk</span>
        </button>
      )}

      <p className="pietro-hint">
        {state === 'idle' && "He'll tell you all about Casa Companion"}
        {state === 'speaking' && 'Give him a sec...'}
        {state === 'ready' && 'Or pick a companion below ↓'}
      </p>
    </div>
  );
}
