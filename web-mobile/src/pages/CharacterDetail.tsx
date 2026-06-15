import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, Settings, Volume2, VolumeX } from 'lucide-react';
import CharacterShowcase from '@/components/CharacterShowcase';
import ChatTranscript from '@/components/ChatTranscript';
import InputBar from '@/components/InputBar';
import { getCharacterBySlug } from '@/lib/characters';
import { useVoiceChat } from '@/hooks/useVoiceChat';
import { useFavorites, useAppSettings } from '@/lib/settings';
import { isCharacterEnabled } from '@/lib/personalization';

export default function CharacterDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const character = getCharacterBySlug(slug ?? '');
  const { settings } = useAppSettings();
  const voice = useVoiceChat(character ?? null, { mode: settings.activeMode });
  const [favorites, toggleFavorite] = useFavorites();
  const isFav = character ? favorites.includes(character.slug) : false;

  useEffect(() => {
    if (!character || !isCharacterEnabled(character.slug)) {
      navigate('/');
    }
  }, [character, navigate]);

  if (!character) return null;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Top header */}
      <header className="flex items-center justify-between px-4 pt-3 pb-2 safe-top shrink-0">
        <button
          onClick={() => navigate('/')}
          className="p-2 -ml-2 rounded-full text-gray-300 hover:bg-white/5 active:bg-white/10 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <div className="flex flex-col items-center">
          <h1 className="text-lg font-bold text-white leading-tight">{character.name}</h1>
          <p className="text-xs text-gray-400">{character.italianMeaning}</p>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => toggleFavorite(character.slug)}
            className={`p-2 rounded-full transition-colors ${
              isFav ? 'text-red-400' : 'text-gray-400 hover:text-red-400'
            }`}
            aria-label={isFav ? 'Remove favorite' : 'Add favorite'}
          >
            <Heart className={`w-6 h-6 ${isFav ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="p-2 rounded-full text-gray-400 hover:text-white transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Mode + voice pill */}
      <div className="shrink-0 px-4 pb-2 flex items-center justify-center gap-2">
        <span
          className="text-[10px] uppercase tracking-wide font-semibold px-2.5 py-1 rounded-full bg-white/5 text-white/70"
        >
          {settings.activeMode.label}
        </span>
        {settings.voiceEnabled ? (
          <Volume2 className="w-3.5 h-3.5 text-white/50" />
        ) : (
          <VolumeX className="w-3.5 h-3.5 text-white/50" />
        )}
      </div>

      {/* Character showcase */}
      <div className="shrink-0 px-6 pt-1 pb-3">
        <div className="max-w-[260px] mx-auto">
          <CharacterShowcase
            character={character}
            isSpeaking={voice.turnState === 'speaking'}
          />
        </div>
      </div>

      {/* Status line */}
      <div className="shrink-0 text-center min-h-[1.5rem] mb-2">
        <p className="text-sm font-medium" style={{ color: character.accentColor }}>
          {voice.turnState === 'idle' &&
            (voice.wakeListening ? 'Listening for wake word...' : 'Tap mic or type below')}
          {voice.turnState === 'listening' && 'Listening...'}
          {voice.turnState === 'processing' && 'Thinking...'}
          {voice.turnState === 'speaking' && 'Speaking...'}
          {voice.turnState === 'error' && 'Something went wrong'}
        </p>
        {voice.errorMessage && (
          <p className="text-xs text-red-400 mt-0.5 px-4">{voice.errorMessage}</p>
        )}
      </div>

      {/* Chat */}
      <ChatTranscript
        messages={voice.messages}
        characterName={character.name}
        accentColor={character.accentColor}
      />

      {/* Time cap banner */}
      {settings.timeCapMinutes > 0 && voice.sessionDurationSeconds >= settings.timeCapMinutes * 60 && (
        <div className="shrink-0 mx-4 mb-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
          <p className="text-xs font-medium text-red-300">
            Daily time cap reached. Ask a parent to unlock more time.
          </p>
        </div>
      )}

      {/* Bottom input */}
      <InputBar
        turnState={voice.turnState}
        accentColor={character.accentColor}
        onMicClick={voice.toggleRecording}
        onSend={voice.sendText}
        disabled={settings.timeCapMinutes > 0 && voice.sessionDurationSeconds >= settings.timeCapMinutes * 60}
        bargeInEnabled={settings.bargeInEnabled}
      />
    </div>
  );
}
