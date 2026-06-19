import { useCallback, useRef, useState } from 'react';

function logError(message: string, error?: unknown, extra?: Record<string, unknown>) {
  console.error(message, error, extra);
}

function getMimeType(): string {
  const types = ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export interface UseRecorderOptions {
  onDataAvailable?: (chunk: Blob) => void;
  onStop?: (blob: Blob, mimeType: string) => void;
  onError?: (message: string) => void;
}

export interface UseRecorderReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
}

export function useRecorder(options: UseRecorderOptions): UseRecorderReturn {
  const { onDataAvailable, onStop, onError } = options;
  const [isRecording, setIsRecording] = useState(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const autoStopTimerRef = useRef<number | null>(null);

  const stopRecording = useCallback(() => {
    if (autoStopTimerRef.current) {
      window.clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.('Microphone access is not supported in this browser.');
      return;
    }
    if (!window.MediaRecorder) {
      onError?.('MediaRecorder is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordingChunksRef.current = [];

      const mimeType = getMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordingChunksRef.current.push(event.data);
          onDataAvailable?.(event.data);
        }
      };

      recorder.onstop = () => {
        const blob =
          recordingChunksRef.current.length > 0
            ? new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
            : null;
        recordingChunksRef.current = [];
        setIsRecording(false);
        if (blob) {
          onStop?.(blob, recorder.mimeType || 'audio/webm');
        }
      };

      recorder.onerror = () => {
        onError?.('Microphone recording failed.');
      };

      setIsRecording(true);
      recorder.start(100);

      autoStopTimerRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 10000);
    } catch (e) {
      logError('Microphone access/recording failed', e);
      let msg = 'Could not access microphone.';
      if (e instanceof DOMException) {
        msg = `Mic error — ${e.name}: ${e.message}`;
      } else if (e instanceof Error) {
        msg = `Mic error — ${e.message}`;
      }
      setIsRecording(false);
      onError?.(msg);
      throw new Error(msg);
    }
  }, [onDataAvailable, onStop, onError]);

  return {
    isRecording,
    startRecording,
    stopRecording,
  };
}
