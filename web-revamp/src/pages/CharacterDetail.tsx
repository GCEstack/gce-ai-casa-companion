import { useParams, useNavigate, useSearchParams } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import VideoBackground from '@/components/VideoBackground';
import ParticleField from '@/components/ParticleField';
import CenterStage from '@/sections/CenterStage';
import { getCharacterBySlug } from '@/lib/characters';
import { findModeBySlug, introductionMode, modeFromFeature } from '@/lib/modes';
import { characterConfigs } from '@/lib/characterConfig';
import type { Character, ModeConfig } from '@/types';
import { useApp } from '@/context/AppContext';
import { useVoiceChat } from '@/hooks/useVoiceChat';
import { hasOnboarded, markOnboarded } from '@/hooks/useOnboarding';
import { fetchBackendTTS } from '@/lib/tts';

const WELCOME_SCRIPT =
  "Hey there! I'm Pietro — the founder of Casa Companion. Welcome! Here's the deal: you've got a whole crew of AI companions here, each with their own personality and skills. Want help with homework? Hit up Maestra or Spugna. Need to write a song? Rocco's your guy. Want to chill? Battito's got you. Just pick a companion from the row up top, or stay here and talk to me. I'm your startup advisor, idea bouncer, and all-around hype man. You can say things like 'story mode', 'math mode', or 'calm mode' to switch up how we talk. And hey — you can interrupt me anytime. Just start talking. So... what's on your mind?";

interface CharacterDetailContentProps {
  character: Character;
  activeMode: ModeConfig;
}

function CharacterDetailContent({ character, activeMode }: CharacterDetailContentProps) {
  const [searchParams] = useSearchParams();
  const { dispatch } = useApp();
  const hasTriggeredRef = useRef(false);

  const voice = useVoiceChat(character.slug, activeMode);

  // Pietro auto-onboarding
  useEffect(() => {
    if (character.slug !== 'pietro') return;
    if (searchParams.get('onboard') !== 'true') return;
    if (hasOnboarded()) return;
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;

    let audio: HTMLAudioElement | null = null;
    let cancelled = false;

    const run = async () => {
      await new Promise((r) => setTimeout(r, 800));
      if (cancelled) return;

      await voice.connect();
      await new Promise((r) => setTimeout(r, 500));
      if (cancelled) return;

      const blob = await fetchBackendTTS(WELCOME_SCRIPT, character.slug, activeMode.slug);
      const url = URL.createObjectURL(blob);
      audio = new Audio(url);

      dispatch({ type: 'SET_SPEAKING', payload: true });
      audio.onended = () => {
        dispatch({ type: 'SET_SPEAKING', payload: false });
        URL.revokeObjectURL(url);
        audio = null;
        markOnboarded();
      };
      audio.onerror = () => {
        dispatch({ type: 'SET_SPEAKING', payload: false });
        URL.revokeObjectURL(url);
        audio = null;
        markOnboarded();
      };
      await audio.play();
    };

    run().catch((err) => {
      console.error('[onboarding] Auto-onboarding failed:', err);
      dispatch({ type: 'SET_SPEAKING', payload: false });
      markOnboarded();
    });

    return () => {
      cancelled = true;
      if (audio) {
        audio.pause();
        audio.onended = null;
        audio.onerror = null;
        URL.revokeObjectURL(audio.src);
        audio = null;
      }
      markOnboarded();
    };
  }, [character.slug, searchParams, voice, dispatch]);

  // Listen for toolbar mode-switch events
  useEffect(() => {
    const handler = (e: Event) => {
      const mode = (e as CustomEvent<string>)?.detail;
      if (mode && typeof mode === 'string') {
        voice.sendText(mode).catch(() => {});
      }
    };
    window.addEventListener('modeswitch', handler);
    return () => window.removeEventListener('modeswitch', handler);
  }, [voice]);

  return (
    <div className="relative min-h-full flex flex-col">
      {/* Video Background */}
      <VideoBackground blur={40} brightness={0.35} overlayOpacity={0.7} accentColor={character.accentColor} videoSrc={character.videoSrc} />

      {/* Character-themed particles */}
      <ParticleField
        count={50}
        hueMin={character.accentHue - 10}
        hueMax={character.accentHue + 10}
      />

      {/* Center Stage - Character Showcase */}
      <CenterStage
        character={character}
        activeMode={activeMode}
        voice={voice}
      />
    </div>
  );
}

export default function CharacterDetail() {
  const { slug, mode: modeParam } = useParams<{ slug: string; mode: string }>();
  const navigate = useNavigate();
  const { dispatch } = useApp();

  const character = getCharacterBySlug(slug ?? '');
  const [activeMode, setActiveMode] = useState<ModeConfig>(introductionMode);

  useEffect(() => {
    if (!character) {
      navigate('/');
      return;
    }

    dispatch({ type: 'SELECT_CHARACTER', payload: character });

    // Set mode from URL param or default to introduction
    if (modeParam) {
      const baseMode = findModeBySlug(modeParam);
      if (baseMode) {
        setActiveMode(baseMode);
        dispatch({ type: 'SET_MODE', payload: baseMode });
      } else {
        // Check for character-specific feature slugs
        const feature = characterConfigs[character.slug.toLowerCase()]?.features.find(
          (f) =>
            f.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '') === modeParam
        );
        if (feature) {
          const featureMode = modeFromFeature(feature, character.accentColor);
          setActiveMode(featureMode);
          dispatch({ type: 'SET_MODE', payload: featureMode });
        } else {
          setActiveMode(introductionMode);
          dispatch({ type: 'SET_MODE', payload: introductionMode });
        }
      }
    } else {
      setActiveMode(introductionMode);
      dispatch({ type: 'SET_MODE', payload: introductionMode });
    }
  }, [character, slug, modeParam, navigate, dispatch]);

  if (!character) {
    return null;
  }

  return (
    <CharacterDetailContent
      character={character}
      activeMode={activeMode}
    />
  );
}
