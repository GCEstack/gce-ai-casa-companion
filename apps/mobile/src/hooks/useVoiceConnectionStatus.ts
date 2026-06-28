import { useEffect } from 'react';
import { useVoiceSocket } from './useVoiceSocket';

const VOICE_SERVER_URL =
  import.meta.env.VITE_VOICE_SERVER_URL ||
  (typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? `wss://${window.location.host}`
    : `ws://${window.location.host}`);

const VOICE_SERVER_TOKEN = import.meta.env.VITE_VOICE_SERVER_API_KEY;

export function useVoiceConnectionStatus() {
  const socket = useVoiceSocket({
    url: VOICE_SERVER_URL,
    token: VOICE_SERVER_TOKEN,
    sessionId: 'landing-status',
    deviceType: 'dashboard',
    reconnect: true,
  });

  useEffect(() => {
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  return {
    isConnected: socket.connected,
    isConnecting: socket.connecting,
  };
}
