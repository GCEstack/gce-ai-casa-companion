"""Pipecat voice pipeline builder.

Pipeline flow:
  WebSocket input -> Deepgram STT -> SafetyFilter -> User context aggregator
  -> OpenAI LLM -> ElevenLabs TTS -> WebSocket output -> Assistant context aggregator
"""

from fastapi import WebSocket
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.transcriptions.language import Language
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)

from .character import CharacterConfig
from .config import settings
from .safety import SafetyFilter
from .serializer import RawAudioFrameSerializer


def create_pipeline(
    websocket: WebSocket, character: CharacterConfig
) -> tuple[Pipeline, PipelineWorker, FastAPIWebsocketTransport]:
    """Create a Pipecat pipeline for a single WebSocket session."""

    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            audio_in_sample_rate=16000,
            audio_out_sample_rate=16000,
            audio_in_channels=1,
            audio_out_channels=1,
            serializer=RawAudioFrameSerializer(),
        ),
    )

    stt = DeepgramSTTService(
        api_key=settings.deepgram_api_key,
        settings=DeepgramSTTService.Settings(
            model=settings.deepgram_model,
            language=Language.EN,
            punctuate=True,
            smart_format=True,
            interim_results=True,
            profanity_filter=True,
        ),
    )

    llm = OpenAILLMService(
        api_key=settings.openai_api_key,
        settings=OpenAILLMService.Settings(
            model=settings.openai_model,
            system_instruction=character.system_prompt,
            temperature=0.8,
            max_tokens=150,
        ),
    )

    tts = ElevenLabsTTSService(
        api_key=settings.elevenlabs_api_key,
        sample_rate=16000,
        settings=ElevenLabsTTSService.Settings(
            voice=character.voice_id,
            model=settings.elevenlabs_model,
        ),
    )

    context = LLMContext()
    user_agg, assistant_agg = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
    )

    safety = SafetyFilter(settings.blocked_words_list)

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            safety,
            user_agg,
            llm,
            tts,
            transport.output(),
            assistant_agg,
        ]
    )

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(),
        enable_turn_tracking=False,
        enable_rtvi=False,
        idle_timeout_secs=300,
    )

    return pipeline, worker, transport
