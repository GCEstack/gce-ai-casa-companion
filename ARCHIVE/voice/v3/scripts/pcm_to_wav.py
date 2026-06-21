"""Wrap a raw pcm_s16le file in a WAV header."""
import struct
import sys

in_path = sys.argv[1]
out_path = in_path.replace(".raw", ".wav")
sample_rate = int(sys.argv[2]) if len(sys.argv) > 2 else 24000
channels = 1
bits_per_sample = 16

with open(in_path, "rb") as f:
    pcm = f.read()

byte_rate = sample_rate * channels * bits_per_sample // 8
block_align = channels * bits_per_sample // 8

wav = b"RIFF"
wav += struct.pack("<I", 36 + len(pcm))
wav += b"WAVE"
wav += b"fmt "
wav += struct.pack("<I", 16)
wav += struct.pack("<H", 1)  # PCM
wav += struct.pack("<H", channels)
wav += struct.pack("<I", sample_rate)
wav += struct.pack("<I", byte_rate)
wav += struct.pack("<H", block_align)
wav += struct.pack("<H", bits_per_sample)
wav += b"data"
wav += struct.pack("<I", len(pcm))
wav += pcm

with open(out_path, "wb") as f:
    f.write(wav)
print(f"Wrote {out_path}")
