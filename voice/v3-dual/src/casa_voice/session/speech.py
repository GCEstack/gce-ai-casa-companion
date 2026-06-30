import asyncio
import logging
import os
import time

from ..filler_generator import filler_generator
from ..protocol import VoiceState, VoiceMessage
from ..providers import DEFAULT_LLM

logger = logging.getLogger(__name__)


async def _process_and_speak(self, text: str, skip_history: bool = False):
    async with self._lock:
        self.state = VoiceState.PROCESSING
        await self._broadcast(VoiceMessage.state_change(VoiceState.PROCESSING))

    # Trigger responses are already final text — bypass LLM entirely.
    if skip_history:
        llm_response = text
        logger.info(f"{self._ctx} PROCESSING: trigger response (LLM skipped)")
    else:
        streaming_enabled = os.environ.get("STREAMING_TTS_ENABLED", "1").strip().lower() not in (
            "0",
            "false",
            "no",
        )
        if (
            streaming_enabled
            and self.providers.llm is not None
            and hasattr(self.providers.llm, "chat_stream")
        ):
            return await self._process_and_speak_streaming(text)

        # Speak a short filler while the LLM thinks. Skip for instant
        # trigger responses and when filler_generator returns None.
        filler = filler_generator.select(text, character=self.character, mode=self.mode)
        if filler:
            logger.info(f"{self._ctx} PROCESSING: filler -> '{filler}'")
            await self._speak(filler)
            # Return to PROCESSING while the LLM runs.
            async with self._lock:
                self.state = VoiceState.PROCESSING
                await self._broadcast(VoiceMessage.state_change(VoiceState.PROCESSING))

        # Compress long transcripts to keywords to cut tokens and latency.
        llm_input = self.providers.commands.keyword_compressor.compress(text)
        logger.info(f"{self._ctx} PROCESSING: calling LLM for '{text}' (compressed: '{llm_input}')")
        t0 = time.perf_counter()
        llm_response = await self._call_llm(llm_input)
        t1 = time.perf_counter()
        logger.info(f"{self._ctx} PROCESSING: LLM took {(t1 - t0):.2f}s")
        logger.info(f"{self._ctx} PROCESSING: LLM response = '{llm_response[:120]}...'")

    if not llm_response:
        await self._return_to_idle()
        return

    if not skip_history:
        self._conversation_history.append({"role": "user", "content": text})
        self._conversation_history.append({"role": "assistant", "content": llm_response})

        if self.store:
            await self.store.save(
                self.session_id,
                self._conversation_history,
                character=self.character,
                mode=self.mode,
            )

    await self._speak(llm_response)


async def _echo_and_learn(self, transcript: str, echo):
    """Fast echo response that also remembers what the kid cares about.

    This bypasses the LLM for speed, stores the utterance + echo in history,
    and merges extracted interests into the session profile so future LLM
    prompts can personalize responses.
    """
    # Merge newly extracted interests into the session profile.
    for category, items in echo.interests.items():
        existing = set(self._interests.get(category, []))
        existing.update(items)
        self._interests[category] = sorted(existing)

    # Remember the exchange so the LLM has context next turn.
    self._conversation_history.append({"role": "user", "content": transcript})
    self._conversation_history.append({"role": "assistant", "content": echo.echo_text})

    if self.store:
        await self.store.save(
            self.session_id,
            self._conversation_history,
            character=self.character,
            mode=self.mode,
            kid_profile={"interests": self._interests},
        )

    logger.info(f"[{self.session_id}] LEARNED interests: {self._interests}")

    # In story mode, start generating the next story segments in the background
    # so "what happens next?" can be answered instantly.
    if self.mode == "story" and self.providers.llm:
        asyncio.create_task(self._story_queue.prefill(self._interests))

    await self._speak(echo.echo_text)


async def _run_scene(self, scene: str):
    """Trigger a scripted scene by sending a canned user prompt to the LLM."""
    prompts = {
        "bedtime": "Tell me a short, calming bedtime story.",
        "greeting": "Greet me in character and ask what I want to do today.",
        "joke": "Tell me a funny joke appropriate for a kid.",
    }
    prompt = prompts.get(scene, "Say something fun and in character.")
    logger.info(f"[{self.session_id}] Running scene: {scene}")
    await self._broadcast(VoiceMessage.transcript(f"[scene: {scene}]"))
    await self._process_and_speak(prompt)


async def _speak(self, text: str):
    async with self._lock:
        self.state = VoiceState.SPEAKING
        await self._broadcast(VoiceMessage.state_change(VoiceState.SPEAKING))
        await self._broadcast(VoiceMessage.assistant_text(text))
        self._speaking.set()
        self._speaking_done.clear()
        self._interrupted.clear()
        # Drop any leftover input audio so the VAD loop doesn't false-trigger
        # barge-in from audio that arrived before we started speaking.
        async with self.input_buffer.lock:
            self.input_buffer.get_and_clear()
        async with self.vad_buffer.lock:
            self.vad_buffer.get_and_clear()

    if self.providers.tts is None:
        logger.error(f"{self._ctx} SPEAKING: no TTS provider configured")
        await self._broadcast(VoiceMessage.error("tts", "No TTS provider configured"))
        self._speaking.clear()
        self._speaking_done.set()
        await self._return_to_idle()
        return

    logger.info(f"{self._ctx} SPEAKING: streaming TTS ({len(text)} chars)")
    t0 = time.perf_counter()
    seq = 0
    first_byte = True
    try:
        async for chunk in self.providers.tts.synthesize_stream(text, self.character, self.mode):
            if first_byte:
                first_byte = False
                tts_latency = time.perf_counter() - t0
                total_latency = time.perf_counter() - self._utterance_start_time
                logger.info(f"{self._ctx} SPEAKING: TTS first byte after {tts_latency:.2f}s (total {total_latency:.2f}s from wake)")
            if self._interrupted.is_set():
                logger.info(f"{self._ctx} TTS interrupted")
                break
            msg = VoiceMessage.tts_chunk(chunk, sequence=seq)
            await self._broadcast(msg)
            seq += 1
        logger.info(f"{self._ctx} SPEAKING: streamed {seq} TTS chunks in {(time.perf_counter() - t0):.2f}s")
    except asyncio.CancelledError:
        logger.info(f"{self._ctx} TTS cancelled")
    except Exception as e:
        logger.error(f"{self._ctx} TTS error: {e}", exc_info=True)
    finally:
        self._speaking.clear()
        self._speaking_done.set()
        if not self._interrupted.is_set():
            await self._return_to_idle()


async def _call_llm(self, transcript: str) -> str:
    system_prompt = self._build_system_prompt()

    messages = [{"role": "system", "content": system_prompt}]
    for turn in self._conversation_history[-6:]:
        messages.append(turn)
    messages.append({"role": "user", "content": transcript})

    try:
        if self.providers.llm:
            return await self.providers.llm.chat(
                messages=messages,
                temperature=0.8,
                max_tokens=150,
            )

        # Fallback to OpenRouter direct call if no LLM provider is configured.
        import httpx
        from ..providers import _get_openrouter_provider_routing

        llm_payload = {
            "model": os.environ.get("OPENROUTER_LLM_MODEL", DEFAULT_LLM),
            "messages": messages,
            "max_tokens": 150,
            "temperature": 0.8,
        }
        routing = _get_openrouter_provider_routing()
        if routing:
            llm_payload["provider"] = routing

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.providers.openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://casa-companion.io",
                    "X-Title": "Casa Companion Voice",
                },
                json=llm_payload,
            )
            if resp.status_code >= 400:
                logger.error(f"[{self.session_id}] LLM error body: {resp.text}")
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        logger.error(f"[{self.session_id}] LLM call failed: {e}", exc_info=True)
        return "Sorry, my brain hiccuped. Can you try again?"


def _build_system_prompt(self) -> str:
    # Prefer the richer character profile from the voice router; fall back
    # to a generic persona if the TTS provider doesn't expose one.
    persona = (
        f"You are {self.character}. Friendly companion for kids. "
        "Respond briefly (1-2 sentences). Be warm and fun."
    )
    if self.providers.tts and hasattr(self.providers.tts, "voice_router"):
        try:
            profile = self.providers.tts.voice_router.get_profile(self.character)
            persona = f"{profile.prompt_prefix} Respond briefly (1-2 sentences). Be warm and fun."
        except Exception:
            pass

    parts = [persona]
    if self._interests:
        summary_parts = []
        for category in ("love", "like", "enjoy", "favorite", "dislike"):
            items = self._interests.get(category, [])
            if items:
                summary_parts.append(f"{category}s: {', '.join(items)}")
        if summary_parts:
            parts.append(
                "What you know about the kid so far: " + "; ".join(summary_parts) + "."
            )
    return " ".join(parts)
