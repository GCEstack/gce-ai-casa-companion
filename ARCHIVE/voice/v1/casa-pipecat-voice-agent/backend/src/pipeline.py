"""Pipecat voice pipeline for the advanced Casa-Pipecat voice agent."""

from pipecat.frames.frames import (
    Frame,
    InputAudioRawFrame,
    OutputAudioRawFrame,
    TextFrame,
    TranscriptionFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.serializers.base_serializer import FrameSerializer
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams, FastAPIWebsocketTransport

from characters import CharacterMode
from config import settings


class PCM16RawSerializer(FrameSerializer):
    """Raw 16-bit PCM serializer for simple WebSocket clients."""

    def __init__(self, input_sample_rate: int = 16000, output_sample_rate: int = 24000):
        super().__init__()
        self._input_sample_rate = input_sample_rate
        self._output_sample_rate = output_sample_rate

    async def serialize(self, frame: Frame) -> bytes | None:
        if isinstance(frame, OutputAudioRawFrame):
            return frame.audio
        return None

    async def deserialize(self, data: str | bytes) -> Frame | None:
        if isinstance(data, bytes):
            return InputAudioRawFrame(
                audio=data,
                sample_rate=self._input_sample_rate,
                num_channels=1,
            )
        return None


class KeywordSafetyFilter(FrameProcessor):
    """Basic keyword safety filter for Phase 1."""

    def __init__(self, blocked_words: list[str], **kwargs):
        super().__init__(**kwargs)
        self._blocked_words = set(w.lower() for w in blocked_words)

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, TranscriptionFrame):
            text_lower = frame.text.lower()
            for word in self._blocked_words:
                if word and word in text_lower:
                    await self.push_frame(
                        TextFrame(
                            "Oops, let's talk about something else! What's your favorite animal?"
                        )
                    )
                    return
        await self.push_frame(frame, direction)


def create_pipeline(
    websocket,
    character: CharacterMode,
    input_sample_rate: int = 16000,
    output_sample_rate: int = 24000,
) -> tuple[Pipeline, FastAPIWebsocketTransport]:
    """Create a Pipecat pipeline wired to a FastAPI WebSocket."""
    transport_params = FastAPIWebsocketParams(
        audio_in_enabled=True,
        audio_in_sample_rate=input_sample_rate,
        audio_in_channels=1,
        audio_out_enabled=True,
        audio_out_sample_rate=output_sample_rate,
        audio_out_channels=1,
        add_wav_header=False,
        serializer=PCM16RawSerializer(
            input_sample_rate=input_sample_rate,
            output_sample_rate=output_sample_rate,
        ),
    )
    transport = FastAPIWebsocketTransport(websocket, params=transport_params)

    stt = DeepgramSTTService(
        api_key=settings.deepgram_api_key,
        encoding="linear16",
        channels=1,
        sample_rate=input_sample_rate,
        settings=DeepgramSTTService.Settings(
            model=settings.deepgram_model,
            language="en",
            interim_results=False,
            punctuate=True,
        ),
    )

    llm = OpenAILLMService(
        api_key=settings.openai_api_key,
        settings=OpenAILLMService.Settings(
            model=settings.openai_model,
            temperature=character.temperature,
            max_tokens=character.max_tokens,
        ),
    )

    # Use character voice_id if set, otherwise fall back to global setting.
    voice_id = character.voice_id or settings.elevenlabs_voice_id or None

    tts = ElevenLabsTTSService(
        api_key=settings.elevenlabs_api_key,
        voice_id=voice_id,
        model=character.model or settings.elevenlabs_model,
        auto_mode=True,
        settings=ElevenLabsTTSService.Settings(
            stability=0.5,
            similarity_boost=0.75,
            style=0.0,
            use_speaker_boost=True,
        ),
    )

    safety = KeywordSafetyFilter(blocked_words=settings.blocked_words_list)

    context = LLMContext(
        messages=[
            {"role": "system", "content": character.system_prompt},
        ]
    )
    context_aggregator = LLMContextAggregatorPair(context)

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            safety,
            context_aggregator.user(),
            llm,
            context_aggregator.assistant(),
            tts,
            transport.output(),
        ]
    )

    return pipeline, transport
