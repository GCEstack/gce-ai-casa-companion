import asyncio
import logging
import os
import re
from typing import Optional

from ..filler_generator import filler_generator
from ..protocol import VoiceState, VoiceMessage

logger = logging.getLogger(__name__)


async def _process_and_speak_streaming(self, text: str):
    """Stream LLM sentences to TTS as they arrive.

    Instead of waiting for the full LLM response, we split it into sentences
    and start TTS on the first sentence while the model is still generating
    the rest. This cuts the time-to-first-audio for fresh LLM responses.
    """
    if self.providers.tts is None:
        logger.error(f"{self._ctx} PROCESSING (streaming): no TTS provider configured")
        await self._broadcast(VoiceMessage.error("tts", "No TTS provider configured"))
        await self._return_to_idle()
        return

    # Speak a short filler while the LLM thinks.
    filler = filler_generator.select(text, character=self.character, mode=self.mode)
    if filler:
        logger.info(f"{self._ctx} PROCESSING (streaming): filler -> '{filler}'")
        await self._speak(filler)
        # _speak returns to IDLE, so return to PROCESSING for the LLM stream.
        async with self._lock:
            self.state = VoiceState.PROCESSING
            await self._broadcast(VoiceMessage.state_change(VoiceState.PROCESSING))

    # Compress long transcripts to keywords to cut tokens and latency.
    llm_input = self.providers.commands.keyword_compressor.compress(text)
    logger.info(f"{self._ctx} PROCESSING (streaming): calling LLM for '{text}' (compressed: '{llm_input}')")

    system_prompt = self._build_system_prompt()
    messages = [{"role": "system", "content": system_prompt}]
    for turn in self._conversation_history[-6:]:
        messages.append(turn)
    messages.append({"role": "user", "content": llm_input})

    full_response = ""
    sentence_queue: asyncio.Queue[Optional[str]] = asyncio.Queue()
    llm_done = asyncio.Event()
    tts_seq = 0
    first_audio = True

    async def llm_producer():
        nonlocal full_response
        buffer = ""
        try:
            async for chunk in self.providers.llm.chat_stream(
                messages=messages,
                temperature=0.8,
                max_tokens=150,
            ):
                if self._interrupted.is_set():
                    break
                buffer += chunk
                full_response += chunk

                # Flush complete sentences to the TTS queue.
                while True:
                    match = re.search(r"(?<=[.!?])\s+", buffer)
                    if not match:
                        break
                    sentence = buffer[: match.start()]
                    buffer = buffer[match.end() :]
                    if sentence.strip():
                        await sentence_queue.put(sentence.strip())

            if buffer.strip() and not self._interrupted.is_set():
                await sentence_queue.put(buffer.strip())
        except Exception as e:
            logger.error(f"[{self.session_id}] LLM stream error: {e}", exc_info=True)
            await self._broadcast(VoiceMessage.error("llm", "Sorry, I had trouble thinking. Try again!"))
        finally:
            await sentence_queue.put(None)
            llm_done.set()

    async def tts_consumer():
        nonlocal tts_seq, first_audio
        try:
            while True:
                sentence = await sentence_queue.get()
                if sentence is None:
                    break
                if self._interrupted.is_set():
                    break

                if first_audio:
                    first_audio = False
                    async with self._lock:
                        self.state = VoiceState.SPEAKING
                        await self._broadcast(VoiceMessage.state_change(VoiceState.SPEAKING))
                        self._speaking.set()
                        self._speaking_done.clear()
                        self._interrupted.clear()
                    async with self.input_buffer.lock:
                        self.input_buffer.get_and_clear()
                    async with self.vad_buffer.lock:
                        self.vad_buffer.get_and_clear()

                logger.info(f"[{self.session_id}] TTS streaming sentence ({len(sentence)} chars)")
                async for chunk in self.providers.tts.synthesize_stream(sentence, self.character, self.mode):
                    if self._interrupted.is_set():
                        break
                    await self._broadcast(VoiceMessage.tts_chunk(chunk, sequence=tts_seq))
                    tts_seq += 1

                if self._interrupted.is_set():
                    break
        except Exception as e:
            logger.error(f"[{self.session_id}] TTS streaming error: {e}", exc_info=True)
            await self._broadcast(VoiceMessage.error("tts", "Sorry, I had trouble speaking. Try again!"))

    pipeline_error: Optional[Exception] = None
    try:
        await asyncio.gather(llm_producer(), tts_consumer())
    except Exception as e:
        pipeline_error = e
        logger.error(f"[{self.session_id}] Streaming pipeline error: {e}", exc_info=True)
        await self._broadcast(VoiceMessage.error("pipeline", "Sorry, something went wrong. Try again!"))

    self._speaking.clear()
    self._speaking_done.set()

    # If something failed but we never produced audio, try a spoken apology.
    if pipeline_error and tts_seq == 0 and self.providers.tts is not None:
        try:
            apology = "Sorry, I didn't catch that. Can you say it again?"
            async for chunk in self.providers.tts.synthesize_stream(apology, self.character, self.mode):
                await self._broadcast(VoiceMessage.tts_chunk(chunk, sequence=tts_seq))
                tts_seq += 1
        except Exception as apology_err:
            logger.warning(f"[{self.session_id}] Apology TTS also failed: {apology_err}")

    # Persist the complete exchange.
    if full_response.strip():
        await self._broadcast(VoiceMessage.assistant_text(full_response.strip()))
        self._conversation_history.append({"role": "user", "content": text})
        self._conversation_history.append({"role": "assistant", "content": full_response.strip()})
        if self.store:
            await self.store.save(
                self.session_id,
                self._conversation_history,
                character=self.character,
                mode=self.mode,
            )

    await self._return_to_idle()
