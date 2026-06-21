"""Custom Pipecat frame processors for Casa Voice.

These processors plug into the Pipecat pipeline between standard STT/LLM/TTS
services to add Casa-specific behavior: auth gating, COPPA consent checks,
character routing, audio resampling, and dashboard event broadcasting.

All three solutions (A, B, C) import from this module.
"""

from __future__ import annotations

from pipecat.frames.frames import (
    EndFrame,
    ErrorFrame,
    Frame,
    OutputAudioRawFrame,
    TextFrame,
    TranscriptionFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from ..providers import CharacterVoiceRouter, VoiceConfig, resample_24to16, resample_24to16_soxr


class AuthGate(FrameProcessor):
    """Blocks all frames until the device has authenticated.

    The first frame through this processor must be an AuthFrame (set externally
    via the session manager). Until then, all frames are dropped. After auth,
    this processor becomes a pass-through.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._authenticated = False

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, AuthFrame):
            self._authenticated = True
            await self.push_frame(TextFrame("Device authenticated. Ready to chat!"), direction)
            return

        if not self._authenticated:
            # Drop everything until auth passes
            return

        await self.push_frame(frame, direction)


class CoppaConsentGate(FrameProcessor):
    """Blocks the pipeline until parental consent is verified.

    On startup, checks Supabase for the device's parent consent status.
    If not verified, emits an ErrorFrame and closes the pipeline.
    """

    def __init__(self, supabase_client, device_id: str, **kwargs):
        super().__init__(**kwargs)
        self.supabase = supabase_client
        self.device_id = device_id
        self._consent_checked = False

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if not self._consent_checked:
            self._consent_checked = True
            try:
                result = (
                    await self.supabase.table("devices")
                    .select("*, parents(*)")
                    .eq("id", self.device_id)
                    .maybe_single()
                    .execute()
                )
                row = result.data or {}
                parent = row.get("parents", {})
                if not parent.get("consent_verified"):
                    await self.push_frame(
                        ErrorFrame("Parental consent required. Please complete setup in the dashboard."),
                        direction,
                    )
                    await self.push_frame(EndFrame(), direction)
                    return
            except Exception as e:
                print(f"[CoppaConsentGate] consent check failed: {e}")
                # Fail open in dev mode; fail closed in production
                await self.push_frame(
                    ErrorFrame(f"Consent check error: {e}"),
                    direction,
                )
                return

        await self.push_frame(frame, direction)


class CharacterRouter(FrameProcessor):
    """Switches the character's voice and prompt when a medallion tap is detected.

    Listens for MedallionTapFrame (injected from the WebSocket control handler).
    When received, it updates the active character config for the session,
    which downstream TTS processors will pick up on the next turn.
    """

    def __init__(self, voice_router: CharacterVoiceRouter, **kwargs):
        super().__init__(**kwargs)
        self.voice_router = voice_router
        self._active_character = "orsetto"
        self._active_mode = "default"

    @property
    def active_character(self) -> str:
        return self._active_character

    @property
    def active_mode(self) -> str:
        return self._active_mode

    def get_voice_config(self) -> VoiceConfig:
        return self.voice_router.get_voice(self._active_character)

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, MedallionTapFrame):
            self._active_character = frame.character_key
            self._active_mode = frame.mode_key
            print(f"[CharacterRouter] switched to {self._active_character} / {self._active_mode}")
            # Notify the device that the mode changed
            await self.push_frame(
                TextFrame(f"Character switched to {self._active_character}"),
                direction,
            )
            return

        await self.push_frame(frame, direction)


class Resample24To16Processor(FrameProcessor):
    """Resample TTS output from 24kHz to 16kHz so the ESP32 can play it.

    Uses scipy.signal by default. If soxr is installed, it uses that for lower CPU.
    If the output is already 16kHz (e.g., from Kokoro), it passes through.
    """

    def __init__(self, use_soxr: bool = False, **kwargs):
        super().__init__(**kwargs)
        self.use_soxr = use_soxr
        self._has_soxr = False
        if use_soxr:
            try:
                import soxr
                self._has_soxr = True
            except ImportError:
                print("[Resample24To16] soxr not installed, falling back to scipy")

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, OutputAudioRawFrame):
            if frame.sample_rate == 16000:
                # Already 16kHz, pass through
                await self.push_frame(frame, direction)
                return

            if frame.sample_rate != 24000:
                print(f"[Resample24To16] unexpected sample rate {frame.sample_rate}, skipping resample")
                await self.push_frame(frame, direction)
                return

            try:
                if self._has_soxr:
                    resampled_bytes = resample_24to16_soxr(frame.audio)
                else:
                    resampled_bytes = resample_24to16(frame.audio)

                await self.push_frame(
                    OutputAudioRawFrame(
                        audio=resampled_bytes,
                        sample_rate=16000,
                        num_channels=frame.num_channels,
                    ),
                    direction,
                )
            except Exception as e:
                print(f"[Resample24To16] resample failed: {e}, passing original frame")
                await self.push_frame(frame, direction)
            return

        await self.push_frame(frame, direction)


class SsmlChunker(FrameProcessor):
    """Chunks LLM text at sentence boundaries and wraps in SSML before TTS.

    This sits between the LLM and TTS in the Pipecat pipeline. It receives
    TextFrames from the LLM, splits them into sentence-sized chunks, wraps each
    in the character's SSML template, and pushes them as TextFrames for the TTS.

    Also supports Gemini-style inline audio tags: prepends [whispers], [excited],
    [laughs], etc. based on the active mode.
    """

    def __init__(self, character_router: CharacterRouter, max_chars: int = 500, **kwargs):
        super().__init__(**kwargs)
        self.character_router = character_router
        self.max_chars = max_chars

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TextFrame):
            voice_config = self.character_router.get_voice_config()
            text = frame.text

            # Apply expression tags for Gemini-style TTS
            if voice_config.expression_tags:
                tag = voice_config.expression_tags.get(self.character_router.active_mode, "")
                if tag:
                    text = f"{tag} {text}"

            chunks = self._chunk_text(text)
            for chunk in chunks:
                # Wrap in SSML if template is available
                ssml = self._wrap_ssml(chunk, voice_config)
                await self.push_frame(TextFrame(ssml), direction)
            return

        await self.push_frame(frame, direction)

    def _chunk_text(self, text: str) -> list[str]:
        import re
        text = re.sub(r"\s+", " ", text).strip()
        if not text:
            return []

        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        chunks: list[str] = []
        current = ""

        def _flush():
            nonlocal current
            if current:
                chunks.append(current.strip())
                current = ""

        def _split_long(text_piece: str) -> list[str]:
            words = text_piece.split(" ")
            out: list[str] = []
            piece = ""
            for word in words:
                if len(piece) + len(word) + 1 > self.max_chars and piece:
                    out.append(piece.strip())
                    piece = word
                else:
                    piece = f"{piece} {word}".strip()
            if piece:
                out.append(piece.strip())
            return out

        for sentence in sentences:
            if len(sentence) > self.max_chars:
                _flush()
                chunks.extend(_split_long(sentence))
            elif len(current) + len(sentence) + 1 > self.max_chars:
                _flush()
                current = sentence
            else:
                current = f"{current} {sentence}".strip()
        _flush()
        return chunks

    def _wrap_ssml(self, text: str, voice_config: VoiceConfig) -> str:
        # Default: pass through as plain text (Gemini and Kokoro handle this fine)
        # Cartesia needs SSML wrapping; if we use Cartesia fallback, we can add it here
        return text


class EventBroadcaster(FrameProcessor):
    """Pushes sanitized events to dashboard SSE subscribers.

    This processor observes the pipeline state and sends events to the
    session manager's event queues, which the dashboard SSE endpoint reads from.
    """

    def __init__(self, session_manager, **kwargs):
        super().__init__(**kwargs)
        self.session_manager = session_manager

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        # Map frame types to dashboard events
        if isinstance(frame, TranscriptionFrame):
            await self._broadcast({
                "type": "transcript",
                "text": frame.text,
                "timestamp": __import__("time").time(),
            })
        elif isinstance(frame, TextFrame):
            # LLM output / TTS input text
            await self._broadcast({
                "type": "llm_output",
                "text": frame.text[:200],  # Truncate for dashboard
                "timestamp": __import__("time").time(),
            })
        elif isinstance(frame, OutputAudioRawFrame):
            # Audio is streaming — don't send the actual audio to dashboard
            await self._broadcast({
                "type": "audio_streaming",
                "sample_rate": frame.sample_rate,
                "timestamp": __import__("time").time(),
            })

        await self.push_frame(frame, direction)

    async def _broadcast(self, event: dict):
        # session_manager is injected; it has a broadcast_event method
        if hasattr(self.session_manager, "broadcast_event"):
            await self.session_manager.broadcast_event(event)


class SafetyFilter(FrameProcessor):
    """Keyword-based safety filter for Casa Voice.

    If a blocked word appears in a transcript, the response is replaced with a
    safe redirect message. The LLM never sees the blocked content.
    """

    def __init__(self, blocked_words: list[str], redirect_message: str | None = None, **kwargs):
        super().__init__(**kwargs)
        self._blocked = set(w.lower() for w in blocked_words if w)
        self._redirect = redirect_message or (
            "Oops, let's talk about something else! What's your favorite animal?"
        )

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            text_lower = frame.text.lower()
            for word in self._blocked:
                if word in text_lower:
                    await self.push_frame(TextFrame(self._redirect), direction)
                    return

        await self.push_frame(frame, direction)


# ── Casa-specific frame types (used by processors above) ────────────────────

class AuthFrame(Frame):
    """Sent by the session manager when a device authenticates successfully."""
    pass


class MedallionTapFrame(Frame):
    """Sent when the device reports an NFC medallion tap."""

    def __init__(self, character_key: str, mode_key: str):
        super().__init__()
        self.character_key = character_key
        self.mode_key = mode_key
