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
    events: asyncio.Queue = field(default_factory=asyncio.Queue)

    @property
    def is_audio(self) -> bool:
        return self.device_type == "audio"

    @property
    def is_dashboard(self) -> bool:
        return self.device_type == "dashboard"

    async def get_event(self, timeout: Optional[float] = None):
        """Get the next SSE event, or None on timeout."""
        try:
            return await asyncio.wait_for(self.events.get(), timeout=timeout)
        except asyncio.TimeoutError:
            return None
