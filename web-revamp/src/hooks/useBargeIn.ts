import { useEffect, useRef } from 'react';

const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY as string | undefined;

interface UseBargeInOptions {
  enabled: boolean;
  isCharacterSpeaking: boolean;
  isPaused: boolean;
  getMediaStream: () => MediaStream | null;
  onBargeIn: (transcript: string) => void;
}

function getMimeType(): string {
  const types = ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function useBargeIn({
  enabled,
  isCharacterSpeaking,
  isPaused,
  getMediaStream,
  onBargeIn,
}: UseBargeInOptions): void {
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const onBargeInRef = useRef(onBargeIn);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggeredRef = useRef(false);

  useEffect(() => {
    onBargeInRef.current = onBargeIn;
  }, [onBargeIn]);

  useEffect(() => {
    if (!enabled || !isCharacterSpeaking || isPaused || !DEEPGRAM_KEY) {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch {}
        recorderRef.current = null;
      }
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      triggeredRef.current = false;
      return;
    }

    const stream = getMediaStream();
    if (!stream) return;

    let active = true;
    triggeredRef.current = false;
    const mimeType = getMimeType();

    const ws = new WebSocket(
      `wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&interim_results=true&vad_turnoff=500`,
      ['token', DEEPGRAM_KEY]
    );
    wsRef.current = ws;

    const resetSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          try { recorderRef.current.stop(); } catch {}
        }
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }, 1500);
    };

    ws.onopen = () => {
      if (!active) return;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data);
        }
      };

      recorder.onerror = () => {
        if (ws.readyState === WebSocket.OPEN) ws.close();
      };

      recorder.start(250);
      resetSilenceTimer();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const transcript: string =
          data.channel?.alternatives?.[0]?.transcript || '';
        if (transcript.trim()) {
          resetSilenceTimer();
          if (!triggeredRef.current) {
            triggeredRef.current = true;
            onBargeInRef.current(transcript);
            if (recorderRef.current && recorderRef.current.state !== 'inactive') {
              try { recorderRef.current.stop(); } catch {}
            }
            if (ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
          }
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };

    return () => {
      active = false;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch {}
      }
      recorderRef.current = null;
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
      }
      wsRef.current = null;
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      triggeredRef.current = false;
    };
  }, [enabled, isCharacterSpeaking, isPaused, getMediaStream]);
}
