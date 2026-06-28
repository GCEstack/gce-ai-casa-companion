import { useEffect, useState } from 'react';
import { QRCode } from 'react-qr-code';
import { toast } from 'sonner';

const BACKEND_HTTP = import.meta.env.VITE_BACKEND_HTTP_URL || 'https://casa-voice-agent.fly.dev';

interface Props {
  characterSlug: string;
  modeSlug: string;
  onSessionReady: (info: { sessionId: string; token: string }) => void;
  onCancel: () => void;
}

export default function PairingPanel({ characterSlug, modeSlug, onSessionReady, onCancel }: Props) {
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
    } catch (e: any) {
      toast.error('Could not create pairing: ' + e.message);
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

  const qrValue = `https://casa-frontend.fly.dev/pair?code=${code}`;

  return (
    <div className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-black/60 border border-white/10 max-w-sm">
      <h2 className="text-white text-lg font-semibold">Use your phone as the mic</h2>
      <p className="text-sm text-white/60 text-center">
        Open the Casa mobile app, scan this code, or type the code below.
      </p>
      <div className="text-5xl font-mono font-bold tracking-[0.25em] text-yellow-400">{code}</div>
      <div className="p-3 rounded-xl bg-white">
        <QRCode value={qrValue} size={180} bgColor="#ffffff" fgColor="#000000" />
      </div>
      <p className="text-xs text-white/40">Code expires in 10 minutes</p>
      <div className="flex gap-3 w-full">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 rounded-lg border border-white/10 text-white/70 hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!info}
          onClick={() => info && onSessionReady({ sessionId: info.sessionId, token: info.token })}
          className="flex-1 px-4 py-2 rounded-lg bg-yellow-400 text-black font-medium disabled:opacity-50 hover:bg-yellow-300"
        >
          I'm ready
        </button>
      </div>
    </div>
  );
}
