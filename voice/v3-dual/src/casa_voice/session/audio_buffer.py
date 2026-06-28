from dataclasses import dataclass, field


@dataclass
class AudioBuffer:
    max_seconds: float = 30.0
    sample_rate: int = 16000
    _data: bytearray = field(default_factory=bytearray)

    def append(self, pcm: bytes):
        self._data.extend(pcm)
        max_bytes = int(self.max_seconds * self.sample_rate * 2)
        if len(self._data) > max_bytes:
            self._data = self._data[-max_bytes:]

    def get_and_clear(self) -> bytes:
        data = bytes(self._data)
        self._data.clear()
        return data

    def __len__(self):
        return len(self._data)
