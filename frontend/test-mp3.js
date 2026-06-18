const fs = require("fs");
const lamejs = require("@breezystack/lamejs");

function float32ToMp3(samples, sampleRate = 16000) {
  const encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
  const blockSize = 11520;
  const mp3Chunks = [];
  for (let i = 0; i < samples.length; i += blockSize) {
    const block = samples.subarray(i, i + blockSize);
    const int16 = new Int16Array(block.length);
    for (let j = 0; j < block.length; j++) {
      const s = Math.max(-1, Math.min(1, block[j]));
      int16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const encoded = encoder.encodeBuffer(int16);
    if (encoded.length > 0) mp3Chunks.push(encoded);
  }
  const flushed = encoder.flush();
  if (flushed.length > 0) mp3Chunks.push(flushed);

  let total = 0;
  for (const c of mp3Chunks) total += c.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of mp3Chunks) {
    out.set(new Uint8Array(c.buffer, c.byteOffset, c.length), pos);
    pos += c.length;
  }
  return out;
}

const sampleRate = 16000;
const samples = new Float32Array(sampleRate * 2);
for (let i = 0; i < samples.length; i++) {
  samples[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
}
const mp3 = float32ToMp3(samples, sampleRate);
fs.writeFileSync("test-out.mp3", mp3);
console.log("wrote test-out.mp3", mp3.length);
