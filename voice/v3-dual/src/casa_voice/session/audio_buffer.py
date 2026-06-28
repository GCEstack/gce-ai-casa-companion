import asyncio
from dataclasses import dataclass, field


@dataclass
class AudioBuffer:
    max_seconds: float = 30.0
    sample_rate: int = 16000
    _data: bytearray = field(default_factory=bytearray)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def append(self, pcm: bytes):
        self._data.extend(pcm)
        # Keep a whole number of 16-bit samples; force even byte count.
        max_bytes = int(self.max_seconds * self.sample_rate * 2) & ~1
        if len(self._data) > max_bytes:
            # Align the tail to a sample boundary.
            trim = len(self._data) - max_bytes
            if trim % 2:
                trim += 1
            self._data = self._data[trim:]

    def get_and_clear(self) -> bytes:
        data = bytes(self._data)
        self._data.clear()
        return data

    def __len__(self):
        return len(self._data)
