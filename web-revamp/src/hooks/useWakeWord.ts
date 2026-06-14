import { useEffect, useRef, useState } from 'react';

const DEEPGRAM_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY as string | undefined;

interface UseWakeWordOptions {
  enabled: boolean;
  characterName: string;
  isPaused: boolean;
  getMediaStream: () => MediaStream | null;
  onWakeWord: () => void;
}

interface UseWakeWordReturn {
  isListening: boolean;
}

function getMimeType(): string {
  const types = ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function isWakePhrase(transcript: string, characterName: string): boolean {
  const t = transcript.toLowerCase().trim();
  if (!t) return false;
  const basics = ['hello', 'hey', 'hi'];
  if (basics.some((w) => t.includes(w))) return true;
  const name = characterName.toLowerCase();
  if (name && t.includes(`hey ${name}`)) return true;
  return false;
}

export function useWakeWord({
  enabled,
  characterName,
  isPaused,
  getMediaStream,
  onWakeWord,
}: UseWakeWordOptions): UseWakeWordReturn {
  const [isListening, setIsListening] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const onWakeWordRef = useRef(onWakeWord);

  useEffect(() => {
    onWakeWordRef.current = onWakeWord;
  }, [onWakeWord]);

  useEffect(() => {
    if (!enabled || isPaused || !DEEPGRAM_KEY) {
      setIsListening(false);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try { recorderRef.current.stop(); } catch {}
        recorderRef.current = null;
      }
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      return;
    }

    const stream = getMediaStream();
    if (!stream) {
      setIsListening(false);
      return;
    }

    let active = true;
    const mimeType = getMimeType();

    const ws = new WebSocket(
      `wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&interim_results=true`,
      ['token', DEEPGRAM_KEY]
    );
    wsRef.current = ws;

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
        setIsListening(false);
      };

      recorder.start(250);
      setIsListening(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const transcript: string =
          data.channel?.alternatives?.[0]?.transcript || '';
        if (isWakePhrase(transcript, characterName)) {
          onWakeWordRef.current();
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      setIsListening(false);
    };

    ws.onclose = () => {
      setIsListening(false);
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
      setIsListening(false);
    };
  }, [enabled, isPaused, characterName, getMediaStream]);

  return { isListening };
}
