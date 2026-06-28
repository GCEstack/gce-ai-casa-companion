import { useCallback, useEffect, useRef, useState } from 'react';
import { useAudioWorklet } from './useAudioWorklet';

const SAMPLE_RATE = 16000;
const PING_INTERVAL_MS = 20000;
const SEND_FRAME_MS = 80;
const SEND_FRAME_SAMPLES = Math.round((SAMPLE_RATE * SEND_FRAME_MS) / 1000); // 1280

type ConnectionState = 'idle' | 'fetching' | 'connecting' | 'connected' | 'disconnected' | 'error';
type VoiceState = 'idle' | 'wake_detected' | 'listening' | 'processing' | 'speaking' | 'interrupted';

interface PairingResponse {
  code: string;
  session_id: string;
  join_token: string;
  character: string;
  mode: string;
  expires_at: string;
}

interface ServerMessage {
  type: string;
  state?: VoiceState;
  text?: string;
  final?: boolean;
  code?: string;
  message?: string;
  character?: string;
  mode?: string;
  volume?: number;
  device_id?: string;
  device_type?: string;
  sequence?: number;
  format?: string;
}

export interface PairingVoiceHook {
  connectionState: ConnectionState;
  voiceState: VoiceState;
  transcript: string;
  assistantText: string;
  errorMessage: string;
  isMuted: boolean;
  start: (code: string) => Promise<void>;
  stop: () => void;
  toggleMute: () => void;
  sendInterrupt: () => void;
}

function getHttpBaseUrl(): string {
  const configured = import.meta.env.VITE_VOICE_SERVER_URL;
  if (configured) {
    return configured.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  }
  const protocol = window.location.protocol;
  return `${protocol}//${window.location.host}`;
}

function getWsBaseUrl(): string {
  const configured = import.meta.env.VITE_VOICE_SERVER_URL;
  if (configured) return configured;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

export function usePairingVoice(): PairingVoiceHook {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [assistantText, setAssistantText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const sendBufferRef = useRef<Int16Array>(new Int16Array(0));
  const flushTimerRef = useRef<number | null>(null);

  const playContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);

  const audio = useAudioWorklet();

  const stopPlayback = useCallback(() => {
    if (playContextRef.current) {
      try {
        void playContextRef.current.close();
      } catch {
        // ignore
      }
      playContextRef.current = null;
    }
    nextPlayTimeRef.current = 0;
  }, []);

  const flushSendBuffer = useCallback(() => {
    flushTimerRef.current = null;
    const ws = wsRef.current;
    const buffer = sendBufferRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || buffer.length === 0) return;
    ws.send(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    sendBufferRef.current = new Int16Array(0);
  }, []);

  const sendAudio = useCallback(
    (pcmChunk: ArrayBuffer) => {
      if (isMuted) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const pcmData = new Int16Array(pcmChunk);
      if (pcmData.length === 0) return;

      const combined = new Int16Array(sendBufferRef.current.length + pcmData.length);
      combined.set(sendBufferRef.current);
      combined.set(pcmData, sendBufferRef.current.length);
      sendBufferRef.current = combined;

      while (sendBufferRef.current.length >= SEND_FRAME_SAMPLES) {
        const frame = sendBufferRef.current.subarray(0, SEND_FRAME_SAMPLES);
        ws.send(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength));
        sendBufferRef.current = sendBufferRef.current.subarray(SEND_FRAME_SAMPLES);
      }

      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
      }
      flushTimerRef.current = window.setTimeout(flushSendBuffer, 150);
    },
    [flushSendBuffer, isMuted]
  );

  const sendJson = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const playPcm = useCallback((pcmData: Int16Array) => {
    if (!playContextRef.current) {
      playContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
      nextPlayTimeRef.current = playContextRef.current.currentTime;
    }
    const ctx = playContextRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const actualRate = ctx.sampleRate;

    const srcFloat = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      srcFloat[i] = pcmData[i] / 0x7fff;
    }

    let floatData: Float32Array;
    if (actualRate === SAMPLE_RATE) {
      floatData = srcFloat;
    } else {
      const ratio = SAMPLE_RATE / actualRate;
      const outLen = Math.floor(srcFloat.length / ratio);
      floatData = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const srcIdx = i * ratio;
        const idx0 = Math.floor(srcIdx);
        const idx1 = Math.min(idx0 + 1, srcFloat.length - 1);
        const frac = srcIdx - idx0;
        floatData[i] = srcFloat[idx0] * (1 - frac) + srcFloat[idx1] * frac;
      }
    }

    const buffer = ctx.createBuffer(1, floatData.length, actualRate);
    buffer.getChannelData(0).set(floatData);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startTime = Math.max(nextPlayTimeRef.current, ctx.currentTime);
    source.start(startTime);
    nextPlayTimeRef.current = startTime + buffer.duration;
  }, []);

  const handleServerMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case 'state_change':
          if (msg.state) {
            setVoiceState(msg.state);
            if (msg.state === 'idle' || msg.state === 'interrupted') {
              stopPlayback();
            }
          }
          break;
        case 'transcript':
          if (msg.text) {
            setTranscript(msg.text);
          }
          break;
        case 'assistant_text':
          if (msg.text) {
            setAssistantText((prev) => (prev ? `${prev} ${msg.text}` : msg.text ?? ''));
          }
          break;
        case 'error':
          setErrorMessage(msg.message ?? 'Voice server error');
          break;
        case 'interrupt_ack':
          stopPlayback();
          break;
        case 'pong':
          // heartbeat ack
          break;
        default:
          break;
      }
    },
    [stopPlayback]
  );

  const stop = useCallback(() => {
    if (pingIntervalRef.current) {
      window.clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
    sendBufferRef.current = new Int16Array(0);
    audio.stopCapture();
    stopPlayback();
    setConnectionState('disconnected');
  }, [audio, stopPlayback]);

  const start = useCallback(
    async (code: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
        return;
      }

      setConnectionState('fetching');
      setErrorMessage('');
      setTranscript('');
      setAssistantText('');

      let pairing: PairingResponse;
      try {
        const res = await fetch(`${getHttpBaseUrl()}/api/pairing/${code.trim().toUpperCase()}`);
        if (!res.ok) {
          throw new Error(`Pairing not found (${res.status})`);
        }
        pairing = (await res.json()) as PairingResponse;
      } catch (e) {
        setConnectionState('error');
        setErrorMessage(e instanceof Error ? e.message : 'Failed to fetch pairing');
        return;
      }

      const deviceId = crypto.randomUUID();
      const params = new URLSearchParams();
      params.set('device_type', 'audio');
      params.set('session_id', pairing.session_id);
      params.set('device_id', deviceId);
      params.set('token', pairing.join_token);
      params.set('character', pairing.character);
      params.set('mode', pairing.mode);

      const url = `${getWsBaseUrl().replace(/\/$/, '')}/ws/voice/realtime/${deviceId}?${params.toString()}`;
      setConnectionState('connecting');

      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionState('connected');
        pingIntervalRef.current = window.setInterval(() => {
          sendJson({ type: 'ping' });
        }, PING_INTERVAL_MS);
        void audio.startCapture();
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          const pcmData = new Int16Array(event.data);
          playPcm(pcmData);
        } else {
          try {
            const msg = JSON.parse(event.data as string) as ServerMessage;
            handleServerMessage(msg);
          } catch (e) {
            console.error('[PairingVoice] failed to parse message', e);
          }
        }
      };

      ws.onclose = () => {
        setConnectionState('disconnected');
        if (pingIntervalRef.current) {
          window.clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        audio.stopCapture();
      };

      ws.onerror = () => {
        setConnectionState('error');
        setErrorMessage('Pairing connection error');
        audio.stopCapture();
      };
    },
    [audio, handleServerMessage, playPcm, sendJson]
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const sendInterrupt = useCallback(() => {
    sendJson({ type: 'command', command: 'interrupt' });
    stopPlayback();
  }, [sendJson, stopPlayback]);

  // Wire captured audio into WebSocket.
  useEffect(() => {
    audio.setOnAudioChunk((chunk) => {
      sendAudio(chunk);
    });
  }, [audio, sendAudio]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
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
  };
}
