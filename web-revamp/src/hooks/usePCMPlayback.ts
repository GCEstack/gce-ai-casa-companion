import { useRef, useCallback, useEffect } from 'react';

const PCM16_MAX = 32768;

export function usePCMPlayback(sampleRate: number = 16000) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const ensureContext = useCallback(async () => {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) {
      throw new Error('Web Audio API not supported');
    }

    let ctx = audioCtxRef.current;
    if (!ctx || ctx.sampleRate !== sampleRate || ctx.state === 'closed') {
      if (ctx && ctx.state !== 'closed') {
        await ctx.close();
      }
      ctx = audioCtxRef.current = new Ctx({ sampleRate });
    }

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }, [sampleRate]);

  const playChunk = useCallback(
    async (pcm16: Uint8Array | ArrayBuffer) => {
      await ensureContext();
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const data = pcm16 instanceof ArrayBuffer ? new Uint8Array(pcm16) : pcm16;
      if (data.byteLength % 2 !== 0) {
        console.warn('usePCMPlayback: odd-length PCM chunk dropped');
        return;
      }

      const int16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / PCM16_MAX;
      }

      const buffer = ctx.createBuffer(1, float32.length, sampleRate);
      buffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      activeSourcesRef.current.add(source);
      source.onended = () => {
        activeSourcesRef.current.delete(source);
      };

      const now = ctx.currentTime;
      const startTime = Math.max(now, nextTimeRef.current);
      try {
        source.start(startTime);
      } catch (err) {
        console.error('usePCMPlayback: failed to start source', err);
        activeSourcesRef.current.delete(source);
        source.disconnect();
        return;
      }
      nextTimeRef.current = startTime + buffer.duration;
    },
    [ensureContext, sampleRate]
  );

  const stop = useCallback(() => {
    activeSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // ignore already stopped sources
      }
      try {
        source.disconnect();
      } catch {
        // ignore already disconnected sources
      }
    });
    activeSourcesRef.current.clear();
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
