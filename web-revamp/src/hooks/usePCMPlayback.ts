import { useRef, useCallback, useEffect } from 'react';

export function usePCMPlayback(sampleRate: number = 16000) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextTimeRef = useRef<number>(0);

  const ensureContext = useCallback(async () => {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctx({ sampleRate });
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume();
    }
  }, [sampleRate]);

  const playChunk = useCallback(
    async (pcm16: Uint8Array | ArrayBuffer) => {
      await ensureContext();
      const ctx = audioCtxRef.current!;
      const data = pcm16 instanceof ArrayBuffer ? new Uint8Array(pcm16) : pcm16;
      const int16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
      }

      const buffer = ctx.createBuffer(1, float32.length, sampleRate);
      buffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startTime = Math.max(now, nextTimeRef.current);
      source.start(startTime);
      nextTimeRef.current = startTime + buffer.duration;
    },
    [ensureContext, sampleRate]
  );

  const stop = useCallback(() => {
    nextTimeRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  return { playChunk, stop, ensureContext };
}
