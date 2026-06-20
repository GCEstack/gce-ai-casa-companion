import { useCallback, useRef, useState } from 'react';

const TARGET_SAMPLE_RATE = 16000;
const FRAME_MS = 80;
const FRAME_SAMPLES = Math.round((TARGET_SAMPLE_RATE * FRAME_MS) / 1000); // 1280

function log(...args: unknown[]) {
  console.log('[AudioWorklet]', ...args);
}

function logError(...args: unknown[]) {
  console.error('[AudioWorklet]', ...args);
}

export interface UseAudioWorkletOptions {
  onPcmFrame?: (pcm: ArrayBuffer) => void;
  onError?: (message: string) => void;
  volume?: number;
}

export interface UseAudioWorkletReturn {
  isRecording: boolean;
  isPlaying: boolean;
  micLevel: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  playPcm: (pcm: ArrayBuffer) => void;
  stopPlayback: () => void;
  unlockAudio: () => Promise<void>;
}

export function useAudioWorklet(options: UseAudioWorkletOptions): UseAudioWorkletReturn {
  const { onPcmFrame, onError, volume = 1.0 } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sendBufferRef = useRef<Int16Array>(new Int16Array(0));

  const playContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const playbackGainRef = useRef<GainNode | null>(null);

  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const stopRecording = useCallback(() => {
    try {
      workletNodeRef.current?.disconnect();
      workletNodeRef.current = null;
      scriptNodeRef.current?.disconnect();
      scriptNodeRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      audioContextRef.current?.close();
      audioContextRef.current = null;
      sendBufferRef.current = new Int16Array(0);
      setIsRecording(false);
      setMicLevel(0);
    } catch (e) {
      logError('stopRecording error', e);
    }
  }, []);

  const handleWorkletMessage = useCallback(
    (event: MessageEvent) => {
      const pcm = event.data?.pcm as ArrayBuffer | undefined;
      const max = (event.data?.max as number) ?? 0;
      if (!pcm) return;

      setMicLevel(Math.min(100, Math.round(max * 100)));

      // Accumulate small AudioWorklet chunks into 80ms frames.
      const chunk = new Int16Array(pcm);
      const combined = new Int16Array(sendBufferRef.current.length + chunk.length);
      combined.set(sendBufferRef.current);
      combined.set(chunk, sendBufferRef.current.length);
      sendBufferRef.current = combined;

      while (sendBufferRef.current.length >= FRAME_SAMPLES) {
        const frame = sendBufferRef.current.subarray(0, FRAME_SAMPLES);
        onPcmFrame?.(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength));
        sendBufferRef.current = sendBufferRef.current.subarray(FRAME_SAMPLES);
      }
    },
    [onPcmFrame]
  );

  const startRecording = useCallback(async () => {
    if (isRecording) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      onError?.('Microphone access is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      audioContextRef.current = ctx;
      await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);

      if (ctx.audioWorklet) {
        try {
          const processorName = `casa-pcm-processor-${Date.now()}`;
          const blob = new Blob([getWorkletCode(processorName)], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(blob);
          await ctx.audioWorklet.addModule(workletUrl);

          const worklet = new AudioWorkletNode(ctx, processorName);
          worklet.port.onmessage = handleWorkletMessage;
          worklet.onprocessorerror = (err) => logError('worklet processor error', err);
          source.connect(worklet);
          workletNodeRef.current = worklet;
          log('AudioWorklet recording started');
        } catch (workletErr) {
          log('AudioWorklet failed, falling back to ScriptProcessorNode', workletErr);
          workletNodeRef.current = null;
          setupScriptProcessor(ctx, source, handleWorkletMessage);
        }
      } else {
        log('AudioWorklet not supported; using ScriptProcessorNode fallback');
        setupScriptProcessor(ctx, source, handleWorkletMessage);
      }

      setIsRecording(true);
    } catch (e) {
      logError('startRecording error', e);
      const msg = e instanceof Error ? e.message : 'Could not access microphone.';
      onError?.(msg);
      stopRecording();
    }
  }, [isRecording, onError, handleWorkletMessage, stopRecording]);

  const stopPlayback = useCallback(() => {
    try {
      playContextRef.current?.close();
      playContextRef.current = null;
      nextPlayTimeRef.current = 0;
      playbackGainRef.current = null;
      setIsPlaying(false);
    } catch (e) {
      logError('stopPlayback error', e);
    }
  }, []);

  const unlockAudio = useCallback(async () => {
    try {
      // iOS/Safari require the AudioContext to be resumed from a user gesture.
      // Warm up both contexts so mic capture and playback work on first tap.
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      if (playContextRef.current && playContextRef.current.state === 'suspended') {
        await playContextRef.current.resume();
      }
    } catch (e) {
      logError('unlockAudio error', e);
    }
  }, []);

  const playPcm = useCallback(
    (pcm: ArrayBuffer) => {
      try {
        if (!playContextRef.current) {
          const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!Ctx) return;
          playContextRef.current = new Ctx();
          nextPlayTimeRef.current = playContextRef.current.currentTime;
        }

        const ctx = playContextRef.current;
        if (!playbackGainRef.current) {
          const gain = ctx.createGain();
          gain.gain.value = volumeRef.current;
          gain.connect(ctx.destination);
          playbackGainRef.current = gain;
        }
        playbackGainRef.current.gain.value = volumeRef.current;

        const int16 = new Int16Array(pcm);
        const floatData = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          floatData[i] = int16[i] / 32768;
        }

        // Server sends 16kHz PCM. Resample to the playback context rate if needed.
        const actualRate = ctx.sampleRate;
        let finalData = floatData;
        if (actualRate !== TARGET_SAMPLE_RATE) {
          const ratio = TARGET_SAMPLE_RATE / actualRate;
          const outLen = Math.floor(floatData.length / ratio);
          finalData = new Float32Array(outLen);
          for (let i = 0; i < outLen; i++) {
            const srcIdx = i * ratio;
            const idx0 = Math.floor(srcIdx);
            const idx1 = Math.min(idx0 + 1, floatData.length - 1);
            const frac = srcIdx - idx0;
            finalData[i] = floatData[idx0] * (1 - frac) + floatData[idx1] * frac;
          }
        }

        const buffer = ctx.createBuffer(1, finalData.length, actualRate);
        buffer.getChannelData(0).set(finalData);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(playbackGainRef.current);

        const startTime = Math.max(nextPlayTimeRef.current, ctx.currentTime);
        source.start(startTime);
        nextPlayTimeRef.current = startTime + buffer.duration;
        setIsPlaying(true);

        source.onended = () => {
          // Simple heuristic: if we're near the current time, we're done.
          if (ctx.currentTime >= nextPlayTimeRef.current - 0.1) {
            setIsPlaying(false);
          }
        };
      } catch (e) {
        logError('playPcm error', e);
      }
    },
    []
  );

  return {
    isRecording,
    isPlaying,
    micLevel,
    startRecording,
    stopRecording,
    playPcm,
    stopPlayback,
    unlockAudio,
  };
}

function getWorkletCode(processorName: string): string {
  return `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = ${TARGET_SAMPLE_RATE};
    this.frameSize = ${FRAME_SAMPLES};
    this.resampled = new Float32Array(0);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0 || input[0].length === 0) return true;
    const src = input[0];
    const srcRate = sampleRate;
    const dstRate = this.targetSampleRate;
    const ratio = srcRate / dstRate;
    const outLen = Math.max(0, Math.floor(src.length / ratio));
    if (outLen === 0) return true;

    const newBuf = new Float32Array(this.resampled.length + outLen);
    newBuf.set(this.resampled);
    let writeIdx = this.resampled.length;
    for (let i = 0; i < outLen; i++) {
      const srcIdx = i * ratio;
      const idx0 = Math.floor(srcIdx);
      const idx1 = Math.min(idx0 + 1, src.length - 1);
      const frac = srcIdx - idx0;
      newBuf[writeIdx++] = src[idx0] * (1 - frac) + src[idx1] * frac;
    }
    this.resampled = newBuf;

    while (this.resampled.length >= this.frameSize) {
      const chunk = this.resampled.subarray(0, this.frameSize);
      const pcmData = new Int16Array(this.frameSize);
      let maxVal = 0;
      for (let i = 0; i < this.frameSize; i++) {
        const val = Math.max(-1, Math.min(1, chunk[i]));
        pcmData[i] = Math.round(val * 32767);
        if (Math.abs(val) > maxVal) maxVal = Math.abs(val);
      }
      this.port.postMessage({ pcm: pcmData.buffer, max: maxVal }, [pcmData.buffer]);
      this.resampled = this.resampled.subarray(this.frameSize);
    }

    return true;
  }
}
registerProcessor("${processorName}", PCMProcessor);
`;
}

function setupScriptProcessor(
  ctx: AudioContext,
  source: MediaStreamAudioSourceNode,
  onMessage: (event: MessageEvent) => void
) {
  const bufferSize = 4096;
  const scriptNode = ctx.createScriptProcessor(bufferSize, 1, 1);
  const srcRate = ctx.sampleRate;
  const dstRate = TARGET_SAMPLE_RATE;
  const ratio = srcRate / dstRate;
  const frameSize = FRAME_SAMPLES;
  let resampled = new Float32Array(0);

  scriptNode.onaudioprocess = (e) => {
    const floatData = e.inputBuffer.getChannelData(0);
    const outLen = Math.max(0, Math.floor(floatData.length / ratio));
    if (outLen === 0) return;

    const newBuf = new Float32Array(resampled.length + outLen);
    newBuf.set(resampled);
    let writeIdx = resampled.length;
    for (let i = 0; i < outLen; i++) {
      const srcIdx = i * ratio;
      const idx0 = Math.floor(srcIdx);
      const idx1 = Math.min(idx0 + 1, floatData.length - 1);
      const frac = srcIdx - idx0;
      newBuf[writeIdx++] = floatData[idx0] * (1 - frac) + floatData[idx1] * frac;
    }
    resampled = newBuf;

    while (resampled.length >= frameSize) {
      const chunk = resampled.subarray(0, frameSize);
      const pcmData = new Int16Array(frameSize);
      let maxVal = 0;
      for (let i = 0; i < frameSize; i++) {
        const val = Math.max(-1, Math.min(1, chunk[i]));
        pcmData[i] = Math.round(val * 32767);
        if (Math.abs(val) > maxVal) maxVal = Math.abs(val);
      }
      // Mimic the worklet message shape.
      onMessage(new MessageEvent('message', { data: { pcm: pcmData.buffer, max: maxVal } }));
      resampled = resampled.subarray(frameSize);
    }
  };

  source.connect(scriptNode);
  scriptNode.connect(ctx.destination);
}
