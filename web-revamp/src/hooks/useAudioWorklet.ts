import { useCallback, useEffect, useRef } from 'react';

const SAMPLE_RATE = 16000;
const CHUNK_SAMPLES = 960; // 60 ms @ 16 kHz

export interface AudioWorkletHook {
  startCapture: () => Promise<void>;
  stopCapture: () => void;
  setOnAudioChunk: (handler: (chunk: ArrayBuffer) => void) => void;
}

function getWorkletCode(processorName: string): string {
  return `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.frameSize = 960;
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
      for (let i = 0; i < this.frameSize; i++) {
        const val = Math.max(-1, Math.min(1, chunk[i]));
        pcmData[i] = Math.round(val * 0x7FFF);
      }
      this.port.postMessage(pcmData.buffer, [pcmData.buffer]);
      this.resampled = this.resampled.subarray(this.frameSize);
    }
    return true;
  }
}
registerProcessor("${processorName}", PCMProcessor);
`;
}

export function useAudioWorklet(): AudioWorkletHook {
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const scriptNodeRef = useRef<ScriptProcessorNode | null>(null);
  const onChunkRef = useRef<(chunk: ArrayBuffer) => void>(() => {});
  const isCapturingRef = useRef(false);

  const setOnAudioChunk = useCallback((handler: (chunk: ArrayBuffer) => void) => {
    onChunkRef.current = handler;
  }, []);

  const cleanup = useCallback(() => {
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      workletNodeRef.current = null;
    }
    if (scriptNodeRef.current) {
      try {
        scriptNodeRef.current.disconnect();
      } catch {
        // ignore
      }
      scriptNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        void audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    isCapturingRef.current = false;
  }, []);

  const startCapture = useCallback(async () => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: SAMPLE_RATE },
          channelCount: { ideal: 1 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioContext;
      await audioContext.resume();

      const input = audioContext.createMediaStreamSource(stream);

      if (audioContext.audioWorklet) {
        try {
          const processorName = `casa-pcm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const blob = new Blob([getWorkletCode(processorName)], { type: 'application/javascript' });
          const workletUrl = URL.createObjectURL(blob);
          await audioContext.audioWorklet.addModule(workletUrl);
          URL.revokeObjectURL(workletUrl);

          const workletNode = new AudioWorkletNode(audioContext, processorName);
          workletNode.onprocessorerror = (err) => {
            console.error('[AudioWorklet] processor error', err);
          };
          workletNode.port.onmessage = (e) => {
            if (onChunkRef.current) {
              onChunkRef.current(e.data as ArrayBuffer);
            }
          };
          input.connect(workletNode);
          workletNodeRef.current = workletNode;
        } catch (workletErr) {
          console.warn('[useAudioWorklet] AudioWorklet failed, falling back', workletErr);
          workletNodeRef.current = null;
          setupScriptProcessor(audioContext, input, onChunkRef);
        }
      } else {
        setupScriptProcessor(audioContext, input, onChunkRef);
      }
    } catch (err) {
      console.error('[useAudioWorklet] microphone error', err);
      cleanup();
      throw err;
    }
  }, [cleanup]);

  const stopCapture = useCallback(() => {
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    startCapture,
    stopCapture,
    setOnAudioChunk,
  };
}

function setupScriptProcessor(
  audioContext: AudioContext,
  input: MediaStreamAudioSourceNode,
  onChunkRef: React.MutableRefObject<(chunk: ArrayBuffer) => void>
) {
  const bufferSize = 4096;
  const scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
  const srcRate = audioContext.sampleRate;
  const dstRate = SAMPLE_RATE;
  const ratio = srcRate / dstRate;
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

    while (resampled.length >= CHUNK_SAMPLES) {
      const chunk = resampled.subarray(0, CHUNK_SAMPLES);
      const pcmData = new Int16Array(CHUNK_SAMPLES);
      for (let i = 0; i < CHUNK_SAMPLES; i++) {
        const val = Math.max(-1, Math.min(1, chunk[i]));
        pcmData[i] = Math.round(val * 0x7FFF);
      }
      if (onChunkRef.current) {
        onChunkRef.current(pcmData.buffer.slice(pcmData.byteOffset, pcmData.byteOffset + pcmData.byteLength));
      }
      resampled = resampled.subarray(CHUNK_SAMPLES);
    }
  };

  input.connect(scriptNode);
  // Do not connect scriptNode to destination to avoid feedback.
}
