import asyncio
import logging
import time
from typing import Optional

import numpy as np

from ..protocol import VoiceState, CommandType, VoiceMessage

logger = logging.getLogger(__name__)


async def _wait_for_wake(self) -> Optional[str]:
    logger.info(f"[{self.session_id}] IDLE: wake listener active")

    # Fast path: use the local wake-word engine if available.
    if self.wake_word_detector:
        return await self._wait_for_wake_porcupine()

    # Fallback: STT-based wake phrase detection.
    return await self._wait_for_wake_stt()


async def _wait_for_wake_porcupine(self) -> Optional[str]:
    """Listen continuously and return as soon as Porcupine fires."""
    logger.info(f"[{self.session_id}] IDLE: Porcupine wake-word listener active")
    self.wake_word_detector.reset()
    detected_keyword = None

    while not detected_keyword:
        self._wake_event.clear()
        try:
            await asyncio.wait_for(self._wake_event.wait(), timeout=0.05)
        except asyncio.TimeoutError:
            pass

        # A manual wake command (e.g. push-to-talk button) can move us out of IDLE.
        if self.state != VoiceState.IDLE:
            logger.info(f"[{self.session_id}] IDLE: wake listener aborted by state change")
            return None

        chunk = self.input_buffer.get_and_clear()
        if chunk:
            detected_keyword = self.wake_word_detector.process(chunk)

    logger.info(f"[{self.session_id}] IDLE: Porcupine detected '{detected_keyword}'")
    await self._broadcast(VoiceMessage.state_change(VoiceState.WAKE_DETECTED))
    self._new_request_id()
    logger.info(f"{self._ctx} Turn started (wake-word)")

    # Carry over only the audio that arrived after the wake-word frame.
    # The detector's remainder is exactly that; any newer audio is still in
    # the input buffer and will be collected during the listening phase.
    pending = self.wake_word_detector.get_remainder()
    post_wake_audio = bytearray(pending)
    post_wake_audio.extend(self.input_buffer.get_and_clear())
    if len(post_wake_audio) > 0:
        self._pending_audio = bytes(post_wake_audio)
        logger.info(f"[{self.session_id}] IDLE: carrying over {len(self._pending_audio)} bytes of post-wake audio")

    return detected_keyword


async def _wait_for_wake_stt(self) -> Optional[str]:
    """Legacy STT-based wake phrase detection."""
    logger.info(f"[{self.session_id}] IDLE: STT-based wake listener active")
    while True:
        self._wake_event.clear()
        try:
            await asyncio.wait_for(self._wake_event.wait(), timeout=0.05)
        except asyncio.TimeoutError:
            pass

        # A manual wake command (e.g. push-to-talk button) can move us out of IDLE.
        if self.state != VoiceState.IDLE:
            logger.info(f"[{self.session_id}] IDLE: STT wake listener aborted by state change")
            return None

        # Don't discard audio until we have enough for VAD.
        if len(self.vad_buffer) < 3200:
            continue

        audio = self.vad_buffer.get_and_clear()
        arr = np.frombuffer(audio, dtype=np.int16)
        mean_abs = float(np.mean(np.abs(arr))) / 32768.0 if arr.size else 0.0
        peak = float(np.max(np.abs(arr))) / 32768.0 if arr.size else 0.0
        logger.info(
            f"[{self.session_id}] IDLE: checking {len(audio)} bytes "
            f"mean={mean_abs:.5f} peak={peak:.5f}"
        )
        try:
            speech = await self.providers.vad.detect_speech(audio)
        except Exception as e:
            logger.error(f"[{self.session_id}] IDLE: VAD error: {e}", exc_info=True)
            continue
        if not speech:
            continue

        logger.info(f"[{self.session_id}] IDLE: speech detected, collecting utterance for wake phrase")
        short_audio = await self._collect_short_utterance()
        if not short_audio:
            logger.debug(f"[{self.session_id}] IDLE: no utterance collected")
            continue

        logger.info(f"[{self.session_id}] IDLE: transcribing {len(short_audio)} bytes")
        t0 = time.perf_counter()
        transcript = await self.providers.stt.transcribe(short_audio)
        logger.info(f"[{self.session_id}] IDLE: STT took {(time.perf_counter() - t0):.2f}s -> '{transcript}'")
        if not transcript:
            continue

        cmd_result = self.providers.commands.classifier.classify(transcript)
        if cmd_result.is_command and cmd_result.command == CommandType.WAKE:
            logger.info(f"Wake phrase: '{cmd_result.matched_phrase}'")
            await self._broadcast(VoiceMessage.state_change(VoiceState.WAKE_DETECTED))
            self._new_request_id()
            logger.info(f"{self._ctx} Turn started (wake phrase)")

            # Use the last matched wake phrase as the cut-off point so we don't
            # send the junk that came before it to the LLM.
            matched = cmd_result.matched_phrase.lower()
            idx = transcript.lower().rfind(matched)
            if idx != -1:
                trailing = transcript[idx + len(matched) :]
            else:
                trailing = transcript
            trailing = self.providers.commands.classifier.strip_wake_phrase(trailing)
            if trailing:
                logger.info(f"[{self.session_id}] IDLE: carrying over '{trailing}'")
                self._pending_utterance = trailing

            # Discard any audio that arrived while we were running STT so the
            # next listening phase doesn't re-transcribe the wake phrase.
            self.input_buffer.get_and_clear()
            return cmd_result.matched_phrase

        logger.info(f"[{self.session_id}] IDLE: ignored '{transcript}'")
        self.input_buffer.get_and_clear()


async def _collect_short_utterance(self) -> bytes:
    audio = self.input_buffer.get_and_clear()
    silence_frames = 0
    max_frames = int(self.wake_max_seconds * 1000 / 50)
    silence_limit = max(1, self.wake_silence_ms // 50)

    for _ in range(max_frames):
        self._wake_event.clear()
        try:
            await asyncio.wait_for(self._wake_event.wait(), timeout=0.05)
        except asyncio.TimeoutError:
            pass
        chunk = self.input_buffer.get_and_clear()
        if not chunk:
            silence_frames += 1
        else:
            audio += chunk
            silence_frames = 0

        if silence_frames >= silence_limit:
            break

    return audio
