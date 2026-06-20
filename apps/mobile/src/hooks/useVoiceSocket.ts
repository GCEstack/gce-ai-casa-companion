import { useCallback, useEffect, useRef, useState } from 'react';

function log(...args: unknown[]) {
  console.log('[VoiceSocket]', ...args);
}

function logError(...args: unknown[]) {
  console.error('[VoiceSocket]', ...args);
}

export type VoiceState = 'idle' | 'wake_detected' | 'listening' | 'processing' | 'speaking' | 'interrupted';
export type TurnState = VoiceState;

export type ServerMessage =
  | { type: 'state_change'; state: VoiceState }
  | { type: 'transcript'; text: string; final?: boolean }
  | { type: 'assistant_text'; text: string }
  | { type: 'config_change'; character?: string; mode?: string; volume?: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'interrupt_ack' }
  | { type: 'pong' }
  | { type: 'device_connected'; device_id: string; device_type: string }
  | { type: 'device_disconnected'; device_id: string; device_type: string };

export interface UseVoiceSocketOptions {
  url: string;
  token?: string;
  sessionId?: string;
  deviceId?: string;
  deviceType?: 'audio' | 'dashboard';
  onStateChange?: (state: VoiceState) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onAssistantText?: (text: string) => void;
  onConfigChange?: (change: { character?: string; mode?: string; volume?: number }) => void;
  onError?: (code: string, message: string) => void;
  onBinary?: (pcm: ArrayBuffer) => void;
  onOpen?: () => void;
  onClose?: () => void;
  reconnect?: boolean;
}

export interface UseVoiceSocketReturn {
  connected: boolean;
  connecting: boolean;
  state: VoiceState;
  sendCommand: (command: string) => void;
  sendConfigChange: (change: { character?: string; mode?: string; volume?: number }) => void;
  sendTextInput: (text: string) => void;
  sendPing: () => void;
  sendBinary: (data: ArrayBuffer | ArrayBufferView) => void;
  connect: () => void;
  disconnect: () => void;
}

const PING_INTERVAL_MS = 20000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

export function useVoiceSocket(options: UseVoiceSocketOptions): UseVoiceSocketReturn {
  const {
    url,
    token,
    sessionId = 'mobile',
    deviceId = generateDeviceId(),
    deviceType = 'audio',
    reconnect = true,
  } = options;

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [state, setState] = useState<VoiceState>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(reconnect);

  // Keep refs for latest callbacks so the WebSocket callbacks don't need deps.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const clearTimers = useCallback(() => {
    if (pingIntervalRef.current) {
      window.clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const cleanupSocket = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.onopen = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
    wsRef.current = null;
  }, []);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    clearTimers();
    cleanupSocket();
    setConnected(false);
    setConnecting(false);
  }, [clearTimers, cleanupSocket]);

  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
      const process = (buffer: ArrayBuffer) => {
        optionsRef.current.onBinary?.(buffer);
      };
      if (event.data instanceof Blob) {
        event.data.arrayBuffer().then(process).catch(logError);
      } else {
        process(event.data);
      }
      return;
    }

    try {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      log('←', msg.type, msg);

      switch (msg.type) {
        case 'state_change':
          setState(msg.state);
          optionsRef.current.onStateChange?.(msg.state);
          break;
        case 'transcript':
          optionsRef.current.onTranscript?.(msg.text, msg.final ?? true);
          break;
        case 'assistant_text':
          optionsRef.current.onAssistantText?.(msg.text);
          break;
        case 'config_change':
          optionsRef.current.onConfigChange?.({
            character: msg.character,
            mode: msg.mode,
            volume: msg.volume,
          });
          break;
        case 'error':
          logError('server error', msg.code, msg.message);
          optionsRef.current.onError?.(msg.code, msg.message);
          break;
        case 'interrupt_ack':
          // Server confirmed interrupt; clients usually stop playback here.
          break;
        case 'pong':
          // heartbeat ack
          break;
        case 'device_connected':
        case 'device_disconnected':
          // ignored on mobile audio client
          break;
        default:
          break;
      }
    } catch (e) {
      logError('Failed to parse server message', event.data, e);
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    clearTimers();
    cleanupSocket();
    setConnecting(true);

    const params = new URLSearchParams();
    params.set('device_type', deviceType);
    params.set('device_id', deviceId);
    params.set('session_id', sessionId);
    if (token) params.set('token', token);

    const fullUrl = `${url}?${params.toString()}`;
    log('connecting to', fullUrl);

    try {
      const ws = new WebSocket(fullUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        log('connected');
        reconnectAttemptRef.current = 0;
        setConnected(true);
        setConnecting(false);
        optionsRef.current.onOpen?.();

        pingIntervalRef.current = window.setInterval(() => {
          sendJson(ws, { type: 'ping' });
        }, PING_INTERVAL_MS);
      };

      ws.onclose = () => {
        log('disconnected');
        setConnected(false);
        setConnecting(false);
        optionsRef.current.onClose?.();

        if (shouldReconnectRef.current) {
          const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttemptRef.current, RECONNECT_MAX_MS);
          reconnectAttemptRef.current += 1;
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, delay);
        }
      };

      ws.onerror = (err) => {
        logError('websocket error', err);
      };

      ws.onmessage = handleMessage;
    } catch (e) {
      logError('failed to create websocket', e);
      setConnecting(false);
    }
  }, [url, token, sessionId, deviceId, deviceType, clearTimers, cleanupSocket, handleMessage]);

  const sendCommand = useCallback((command: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    sendJson(ws, { type: 'command', command });
  }, []);

  const sendConfigChange = useCallback((change: { character?: string; mode?: string; volume?: number }) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    sendJson(ws, { type: 'config_change', ...change });
  }, []);

  const sendTextInput = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    sendJson(ws, { type: 'text_input', text });
  }, []);

  const sendPing = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    sendJson(ws, { type: 'ping' });
  }, []);

  const sendBinary = useCallback((data: ArrayBuffer | ArrayBufferView) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(data);
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = reconnect;
  }, [reconnect]);

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connected,
    connecting,
    state,
    sendCommand,
    sendConfigChange,
    sendTextInput,
    sendPing,
    sendBinary,
    connect,
    disconnect,
  };
}

function sendJson(ws: WebSocket, data: unknown) {
  try {
    ws.send(JSON.stringify(data));
  } catch (e) {
    logError('send failed', data, e);
  }
}

function generateDeviceId(): string {
  const stored = typeof window !== 'undefined' ? localStorage.getItem('cc_device_id') : null;
  if (stored) return stored;
  const id = `mobile-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36).slice(-4)}`;
  if (typeof window !== 'undefined') {
    localStorage.setItem('cc_device_id', id);
  }
  return id;
}
