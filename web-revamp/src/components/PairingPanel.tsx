import { useEffect, useState } from 'react';
import { QRCode } from 'react-qr-code';
import { toast } from 'sonner';

const BACKEND_HTTP = import.meta.env.VITE_BACKEND_HTTP_URL || 'https://casa-voice-agent.fly.dev';
const PARENT_JOIN_URL = import.meta.env.VITE_PARENT_JOIN_URL || 'https://casa-mobile-main.vercel.app/pair';

interface Props {
  characterSlug: string;
  modeSlug: string;
  onSessionReady: (info: { sessionId: string; token: string }) => void;
}

export default function PairingPanel({ characterSlug, modeSlug, onSessionReady }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [info, setInfo] = useState<{ sessionId: string; token: string; expiresAt: number } | null>(null);

  const create = async () => {
    try {
      const res = await fetch(`${BACKEND_HTTP}/api/pairing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ character: characterSlug, mode: modeSlug }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCode(data.code);
      setInfo({ sessionId: data.session_id, token: data.join_token, expiresAt: data.expires_at });
      onSessionReady({ sessionId: data.session_id, token: data.join_token });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast.error('Could not create pairing: ' + message);
    }
  };

  useEffect(() => {
    create();
  }, [characterSlug, modeSlug]);

  if (!code || !info) {
    return (
      <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-black/60">
        <div className="w-8 h-8 border-2 border-white/20 border-t-yellow-400 rounded-full animate-spin" />
        <p className="text-white/80">Creating pairing code...</p>
      </div>
    );
  }

  const qrValue = `${PARENT_JOIN_URL}?code=${code}`;

  return (
    <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-black/60 border border-white/10">
      <h2 className="text-white text-lg font-semibold">Use your phone as the mic</h2>
      <p className="text-sm text-white/60 text-center">
        Open the Casa mobile app and scan this code, or enter it manually.
      </p>
      <div className="text-5xl font-mono font-bold tracking-[0.25em] text-yellow-400">{code}</div>
      <div className="p-3 rounded-xl bg-white">
        <QRCode value={qrValue} size={180} bgColor="#ffffff" fgColor="#000000" />
      </div>
      <p className="text-xs text-white/40">Code expires in 10 minutes</p>
    </div>
  );
}
