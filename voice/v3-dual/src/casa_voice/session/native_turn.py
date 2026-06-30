import logging

from ..protocol import VoiceState, VoiceMessage

logger = logging.getLogger(__name__)


async def _process_native_audio(self, audio_buffer: bytes):
    """Quick Chat mode: one native audio -> audio call via OpenRouter.

    Bypasses STT, LLM, and TTS. Streams assistant text to dashboards and PCM
    audio to audio clients as chunks arrive. The model's transcript of the
    user's audio is used as the visible user transcript.
    """
    async with self._lock:
        self.state = VoiceState.PROCESSING
        await self._broadcast(VoiceMessage.state_change(VoiceState.PROCESSING))

    system_prompt = self._build_system_prompt()
    full_assistant_text = ""
    user_transcript = ""
    seq = 0
    first_text = True
    first_audio = True

    try:
        async for chunk in self.providers.native_audio.stream_turn(
            audio_pcm=audio_buffer,
            system_prompt=system_prompt,
            conversation_history=self._native_history,
        ):
            if self._interrupted.is_set():
                logger.info(f"{self._ctx} Native audio turn interrupted")
                break

            chunk_type = chunk.get("type")

            if chunk_type == "text":
                text_chunk = chunk.get("content", "")
                full_assistant_text += text_chunk
                if first_text:
                    first_text = False
                    await self._broadcast(VoiceMessage.assistant_text(full_assistant_text))

            elif chunk_type == "audio":
                if first_audio:
                    first_audio = False
                    async with self._lock:
                        self.state = VoiceState.SPEAKING
                        await self._broadcast(VoiceMessage.state_change(VoiceState.SPEAKING))
                        self._speaking.set()
                        self._speaking_done.clear()
                        self._interrupted.clear()
                    if full_assistant_text:
                        await self._broadcast(VoiceMessage.assistant_text(full_assistant_text))
                pcm = chunk.get("data", b"")
                if pcm:
                    await self._broadcast(VoiceMessage.tts_chunk(pcm, sequence=seq))
                    seq += 1

            elif chunk_type == "user_transcript":
                user_transcript = chunk.get("content", "")
                await self._broadcast(VoiceMessage.transcript(user_transcript))

            elif chunk_type == "transcript":
                # Final assistant transcript; prefer accumulated text.
                final = chunk.get("content", "") or full_assistant_text
                if final:
                    full_assistant_text = final

    except Exception as e:
        logger.error(f"{self._ctx} Native audio turn failed: {e}", exc_info=True)
        await self._broadcast(VoiceMessage.error("native_audio_failed", "Sorry, I had trouble hearing you. Try again!"))
    finally:
        self._speaking.clear()
        self._speaking_done.set()
        # Update native history for context across quick-chat turns.
        if user_transcript:
            self._native_history.append({"role": "user", "content": user_transcript})
        if full_assistant_text:
            self._native_history.append({"role": "assistant", "content": full_assistant_text})
        if len(self._native_history) > 40:
            self._native_history = self._native_history[-40:]
        await self._return_to_idle()
