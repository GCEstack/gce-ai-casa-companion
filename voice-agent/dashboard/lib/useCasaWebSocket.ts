'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CasaMessage,
  CasaState,
  ConnectMessage,
  ModeSelectMessage,
  VoiceInputMessage,
} from './casaProtocol';
import { encodeConnect, encodeModeSelect, encodeVoiceInput } from './casaProtocol';

interface UseCasaWebSocketOptions {
  uri: string;
  character: string;
  mode?: string;
  onMessage?: (msg: CasaMessage) => void;
  onStatusChange?: (state: CasaState) => void;
  reconnectIntervalMs?: number;
}

interface UseCasaWebSocketReturn {
  connected: boolean;
  deviceState: CasaState;
  battery?: number;
  sendVoiceInput: (base64Pcm: string) => void;
  sendModeSelect: (mode: string, character: string) => void;
  reconnect: () => void;
}

export function useCasaWebSocket(
  options: UseCasaWebSocketOptions
): UseCasaWebSocketReturn {
  const {
    uri,
    character,
    mode,
    onMessage,
    onStatusChange,
    reconnectIntervalMs = 3000,
  } = options;

  const [connected, setConnected] = useState(false);
  const [deviceState, setDeviceState] = useState<CasaState>('offline');
  const [battery, setBattery] = useState<number | undefined>();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    cleanup();

    try {
      const ws = new WebSocket(uri);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        // Tell the firmware which character the user selected.
        const connectMsg: ConnectMessage = encodeConnect(character);
        ws.send(JSON.stringify(connectMsg));
        if (mode) {
          const modeMsg: ModeSelectMessage = encodeModeSelect(mode, character);
          ws.send(JSON.stringify(modeMsg));
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setDeviceState('offline');
        if (shouldReconnectRef.current) {
          reconnectTimerRef.current = setTimeout(connect, reconnectIntervalMs);
        }
      };

      ws.onerror = (err) => {
        console.error('Casa WebSocket error:', err);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as CasaMessage;
          if (msg.type === 'status') {
            setDeviceState(msg.state);
            if (typeof msg.battery === 'number') {
              setBattery(msg.battery);
            }
            onStatusChange?.(msg.state);
          }
          onMessage?.(msg);
        } catch (e) {
          console.warn('Invalid Casa message:', event.data);
        }
      };
    } catch (err) {
      console.error('Failed to create Casa WebSocket:', err);
      reconnectTimerRef.current = setTimeout(connect, reconnectIntervalMs);
    }
  }, [uri, character, mode, onMessage, onStatusChange, reconnectIntervalMs, cleanup]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();
    return () => {
      shouldReconnectRef.current = false;
      cleanup();
    };
  }, [connect, cleanup]);

  const sendVoiceInput = useCallback((base64Pcm: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send voice_input: WebSocket not open');
      return;
    }
    const msg: VoiceInputMessage = encodeVoiceInput(base64Pcm);
    ws.send(JSON.stringify(msg));
  }, []);

  const sendModeSelect = useCallback(
    (selectedMode: string, selectedCharacter: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn('Cannot send mode_select: WebSocket not open');
        return;
      }
      const msg: ModeSelectMessage = encodeModeSelect(selectedMode, selectedCharacter);
      ws.send(JSON.stringify(msg));
    },
    []
  );

  const reconnect = useCallback(() => {
    shouldReconnectRef.current = true;
    connect();
  }, [connect]);

  return {
    connected,
    deviceState,
    battery,
    sendVoiceInput,
    sendModeSelect,
    reconnect,
  };
}
