/**
 * Simple linear-interpolation resampling for 16-bit PCM.
 *
 * The native audio module captures/playback at 16 kHz, but OpenAI's
 * Realtime API expects 24 kHz PCM. We resample in both directions.
 */

/**
 * Resample 16-bit little-endian PCM between two sample rates.
 * @param {Uint8Array} pcmBytes - raw PCM16 bytes
 * @param {number} srcRate - source sample rate
 * @param {number} dstRate - destination sample rate
 * @returns {Uint8Array}
 */
export function resamplePCM16(pcmBytes, srcRate, dstRate) {
  if (srcRate === dstRate) return pcmBytes;

  const srcSamples = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.length / 2);
  const ratio = srcRate / dstRate;
  const dstLength = Math.floor(srcSamples.length / ratio);
  const dstSamples = new Int16Array(dstLength);

  for (let i = 0; i < dstLength; i++) {
    const srcIndex = i * ratio;
    const idx0 = Math.floor(srcIndex);
    const idx1 = Math.min(idx0 + 1, srcSamples.length - 1);
    const frac = srcIndex - idx0;
    const s0 = srcSamples[idx0];
    const s1 = srcSamples[idx1];
    const value = s0 + (s1 - s0) * frac;
    dstSamples[i] = Math.max(-32768, Math.min(32767, Math.round(value)));
  }

  return new Uint8Array(dstSamples.buffer);
}
