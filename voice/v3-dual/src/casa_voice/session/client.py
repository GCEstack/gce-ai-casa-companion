import asyncio
from typing import Optional, Callable, Awaitable
from dataclasses import dataclass, field

from ..protocol import VoiceMessage


@dataclass
class ClientHandle:
    """A single WebSocket connection attached to a session."""

    device_id: str
    device_type: str  # "audio" or "dashboard"
    send: Callable[[VoiceMessage], Awaitable[None]]
    events: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=100))

    @property
    def is_audio(self) -> bool:
        return self.device_type == "audio"

    @property
    def is_dashboard(self) -> bool:
        return self.device_type == "dashboard"

    def put_event(self, data: str) -> None:
        """Enqueue an SSE event, dropping the oldest event if the queue is full."""
        if self.events.full():
            try:
                self.events.get_nowait()
            except asyncio.QueueEmpty:
                pass
        try:
            self.events.put_nowait(data)
        except asyncio.QueueFull:
            pass

    async def get_event(self, timeout: Optional[float] = None):
        """Get the next SSE event, or None on timeout."""
        try:
            return await asyncio.wait_for(self.events.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None
