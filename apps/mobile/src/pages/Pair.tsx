import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Mic, MicOff, PhoneOff, Volume2, VolumeX } from 'lucide-react';
import { PairingForm } from '@/components/PairingForm';
import { usePairingVoice } from '@/hooks/usePairingVoice';

export default function Pair() {
  const [searchParams] = useSearchParams();
  const urlCode = searchParams.get('code');

  const {
    connectionState,
    voiceState,
    transcript,
    assistantText,
    errorMessage,
    isMuted,
    start,
    stop,
    toggleMute,
    sendInterrupt,
  } = usePairingVoice();

  const statusLabel = useMemo(() => {
    switch (connectionState) {
      case 'fetching':
        return 'Looking up code...';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return voiceState === 'speaking' ? 'Speaking' : voiceState === 'listening' ? 'Listening' : 'Connected';
      case 'error':
        return errorMessage || 'Connection error';
      case 'disconnected':
        return 'Disconnected';
      default:
        return 'Ready to join';
    }
  }, [connectionState, voiceState, errorMessage]);

  useEffect(() => {
    if (urlCode && connectionState === 'idle') {
      void start(urlCode);
    }
  }, [urlCode, connectionState, start]);

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 py-8 bg-background text-white">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <h1 className="text-2xl font-bold text-center">Parent Phone Mic</h1>
        <p className="text-sm text-gray-400 text-center">
          Enter the code shown on your kid&apos;s screen to join their session.
        </p>

        {connectionState === 'idle' && <PairingForm onSubmit={start} disabled={false} />}

        {connectionState !== 'idle' && (
          <>
            <div className="text-center">
              <div className="text-lg font-semibold">{statusLabel}</div>
              {transcript && <div className="text-sm text-gray-300 mt-2">&ldquo;{transcript}&rdquo;</div>}
              {assistantText && <div className="text-sm text-primary mt-1">{assistantText}</div>}
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={toggleMute}
                className="p-4 rounded-full bg-surface border border-white/10 active:scale-95 transition-transform"
                aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              <button
                onClick={sendInterrupt}
                className="p-4 rounded-full bg-surface border border-white/10 active:scale-95 transition-transform"
                aria-label="Interrupt"
              >
                <VolumeX className="w-6 h-6" />
              </button>
              <button
                onClick={stop}
                className="p-4 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 active:scale-95 transition-transform"
                aria-label="Disconnect"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Volume2 className="w-4 h-4" />
              <span>Use this phone as the microphone for the kid&apos;s character.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
