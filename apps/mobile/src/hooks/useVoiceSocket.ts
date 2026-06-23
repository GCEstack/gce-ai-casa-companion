import { useCallback, useEffect, useRef, useState } from 'react';

const SAMPLE_RATE = 16000;
const PING_INTERVAL_MS = 20000;
const SEND_FRAME_MS = 80;
const SEND_FRAME_SAMPLES = Math.round((SAMPLE_RATE * SEND_FRAME_MS) / 1000); // 1280

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';
type VoiceState = 'idle' | 'wake_detected' | 'listening' | 'processing' | 'speaking' | 'interrupted';

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

export interface VoiceSocketHook {
  connectionState: ConnectionState;
  voiceState: VoiceState;
  transcript: string;
  assistantText: string;
  isSpeaking: boolean;
  errorMessage: string;
  connect: () => void;
  disconnect: () => void;
  sendAudio: (pcmChunk: ArrayBuffer) => void;
  sendCommand: (command: string) => void;
  sendConfigChange: (character: string, mode: string) => void;
  sendTextInput: (text: string) => void;
  stopPlayback: () => void;
}

function getOrCreateDeviceId(): string {
  try {
    const existing = sessionStorage.getItem('casa_device_id');
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem('casa_device_id', id);
    return id;
  } catch {
    return `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem('casa_session_id');
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem('casa_session_id', id);
    return id;
  } catch {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function inferWsUrl(): string {
  const configured = import.meta.env.VITE_VOICE_SERVER_URL;
  if (configured) return configured;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

export function useVoiceSocket(): VoiceSocketHook {
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [assistantText, setAssistantText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);

  const sendBufferRef = useRef<Int16Array>(new Int16Array(0));
  const flushTimerRef = useRef<number | null>(null);

  const playContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);

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
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const pcmData = new Int16Array(pcmChunk);
      if (pcmData.length === 0) return;

      // Accumulate small chunks into ~80 ms frames to match server expectations.
      const combined = new Int16Array(sendBufferRef.current.length + pcmData.length);
      combined.set(sendBufferRef.current);
      combined.set(pcmData, sendBufferRef.current.length);
      sendBufferRef.current = combined;

      while (sendBufferRef.current.length >= SEND_FRAME_SAMPLES) {
        const frame = sendBufferRef.current.subarray(0, SEND_FRAME_SAMPLES);
        ws.send(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength));
        sendBufferRef.current = sendBufferRef.current.subarray(SEND_FRAME_SAMPLES);
      }

      // Flush remainder shortly after to avoid latency on small final chunks.
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
      }
      flushTimerRef.current = window.setTimeout(flushSendBuffer, 150);
    },
    [flushSendBuffer]
  );

  const sendJson = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const sendCommand = useCallback(
    (command: string) => {
      sendJson({ type: 'command', command });
      if (command === 'interrupt' || command === 'stop') {
        stopPlayback();
      }
    },
    [sendJson, stopPlayback]
  );

  const sendConfigChange = useCallback(
    (character: string, mode: string) => {
      sendJson({ type: 'config_change', character, mode });
    },
    [sendJson]
  );

  const sendTextInput = useCallback(
    (text: string) => {
      sendJson({ type: 'text_input', text });
    },
    [sendJson]
  );

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

    // Convert Int16 -> Float32
    const srcFloat = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      srcFloat[i] = pcmData[i] / 0x7fff;
    }

    // Resample if playback context rate differs from 16 kHz.
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
            setAssistantText((prev) => (prev ? `${prev} ${msg.text}` : (msg.text ?? '')));
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
          // ignore unknown messages
          break;
      }
    },
    [stopPlayback]
  );

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
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
    stopPlayback();
    setConnectionState('disconnected');
  }, [stopPlayback]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const baseUrl = inferWsUrl();
    const params = new URLSearchParams();
    params.set('device_type', 'audio');
    params.set('session_id', getOrCreateSessionId());
    params.set('device_id', getOrCreateDeviceId());
    const apiKey = import.meta.env.VITE_VOICE_SERVER_API_KEY;
    if (apiKey) {
      params.set('token', apiKey);
    }

    const url = `${baseUrl.replace(/\/$/, '')}/ws/voice?${params.toString()}`;
    setConnectionState('connecting');
    setErrorMessage('');

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[VoiceSocket] connected', url);
      reconnectCountRef.current = 0;
      setConnectionState('connected');
      pingIntervalRef.current = window.setInterval(() => {
        sendJson({ type: 'ping' });
      }, PING_INTERVAL_MS);
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
          console.error('[VoiceSocket] failed to parse message', e);
        }
      }
    };

    ws.onclose = () => {
      setConnectionState('disconnected');
      if (pingIntervalRef.current) {
        window.clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (reconnectCountRef.current < 5) {
        const delay = Math.min(1000 * 2 ** reconnectCountRef.current, 30000);
        reconnectCountRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      } else {
        setErrorMessage('Voice server connection lost');
      }
    };

    ws.onerror = () => {
      setConnectionState('error');
      setErrorMessage('Voice server connection error');
    };
  }, [handleServerMessage, playPcm, sendJson]);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connectionState,
    voiceState,
    transcript,
    assistantText,
    isSpeaking: voiceState === 'speaking',
    errorMessage,
    connect,
    disconnect,
    sendAudio,
    sendCommand,
    sendConfigChange,
    sendTextInput,
    stopPlayback,
  };
}
