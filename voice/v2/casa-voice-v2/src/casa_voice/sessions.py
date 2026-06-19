"""Casa Voice V2 — Session Manager with Wake Phrases

Architecture:
- IDLE: Companion dormant. Audio flows but only wake phrases trigger action.
- WAKE_DETECTED: Wake phrase heard → brief acknowledgment → LISTENING.
- LISTENING: Collecting user speech. END_TURN forces immediate processing.
- PROCESSING: STT → Command → LLM pipeline.
- SPEAKING: TTS streaming. INTERRUPT phrases or BUTTON press cut it off.
- INTERRUPTED: Flush buffers, cancel TTS, return to LISTENING.
- RESETTING: Clear everything, return to IDLE.

Barge-in latency: ~80ms from kid talking → companion stopping.
"""

import asyncio
import logging
from typing import Optional, Callable
from dataclasses import dataclass, field

from .protocol import VoiceMessage, MessageType, VoiceState, CommandType
from .providers import VoiceProviders

logger = logging.getLogger(__name__)


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

    def peek_last(self, seconds: float) -> bytes:
        """Return last N seconds without clearing."""
        bytes_needed = int(seconds * self.sample_rate * 2)
        return bytes(self._data[-bytes_needed:]) if len(self._data) >= bytes_needed else bytes(self._data)

    def __len__(self):
        return len(self._data)


class VoiceSession:
    """One WebSocket session = one kid + one companion voice."""

    def __init__(
        self,
        session_id: str,
        websocket_send: Callable,
        broadcast_event: Callable,
        providers: VoiceProviders,
        character: str = "default",
        mode: str = "default",
    ):
        self.session_id = session_id
        self._send = websocket_send
        self._broadcast = broadcast_event
        self.providers = providers
        self.character = character
        self.mode = mode
        self.state = VoiceState.IDLE

        # Audio buffers
        self.input_buffer = AudioBuffer(max_seconds=10.0)
        self.vad_buffer = AudioBuffer(max_seconds=2.0)

        # Tasks
        self._input_task: Optional[asyncio.Task] = None
        self._output_task: Optional[asyncio.Task] = None
        self._vad_task: Optional[asyncio.Task] = None

        # Barge-in control
        self._speaking = asyncio.Event()
        self._interrupted = asyncio.Event()
        self._end_turn = asyncio.Event()
        self._lock = asyncio.Lock()

        # Conversation context
        self._conversation_history: list = []
        self._current_utterance: str = ""
        self.system_prompt = self._build_system_prompt()
        self.last_activity = asyncio.get_event_loop().time()

    def _build_system_prompt(self) -> str:
        character_prompts = {
            "drago": "You are Drago, a brave dragon companion for children. You are adventurous, encouraging, and protective. You love flying and treasure hunts.",
            "liam": "You are Liam, a cool teen DJ companion for kids. Use casual language, be energetic and fun.",
            "jenny": "You are Jenny, a creative artist companion for children. Be expressive and imaginative.",
            "orsetto": "You are Orsetto, a gentle bear companion for children. You speak softly and kindly. You love hugs and honey.",
            "coniglio": "You are Coniglio, a playful rabbit companion for children. You are energetic, fun, and a bit silly. You love carrots and jumping.",
            "default": "You are a friendly companion for kids. Be warm, encouraging, and fun.",
        }
        base = character_prompts.get(self.character, character_prompts["default"])

        mode_prompts = {
            "default": "Have a friendly chat. Keep it light and fun.",
            "story": "You are in story mode. Tell engaging, age-appropriate stories with a beginning, middle, and end. Use vivid descriptions.",
            "play": "You are in play mode. Be playful and interactive. Ask questions, make jokes, be silly.",
            "bedtime": "You are in bedtime mode. Speak softly and soothingly. Use gentle, calming language. Short responses.",
            "sing": "You are in sing mode. Sing songs, make up rhymes, be musical and rhythmic.",
        }
        mode_addition = mode_prompts.get(self.mode, "")

        return (
            f"{base} {mode_addition} "
            f"Keep responses short (1-2 sentences max). Use simple words a 4-year-old understands. "
            f"Be warm, patient, and encouraging. Never scary or sad."
        )

    def touch(self):
        self.last_activity = asyncio.get_event_loop().time()
        asyncio.create_task(self._broadcast({
            "type": "activity",
            "device_id": self.session_id,
            "timestamp": self.last_activity,
        }))

    # ── Public API ──

    async def start(self):
        self.state = VoiceState.IDLE
        await self._send(VoiceMessage.state_change(VoiceState.IDLE))
        self._input_task = asyncio.create_task(self._input_loop())
        self._vad_task = asyncio.create_task(self._vad_loop())
        logger.info(f"Session {self.session_id} started (IDLE)")

    async def handle_audio(self, pcm: bytes):
        self.input_buffer.append(pcm)
        self.vad_buffer.append(pcm)

    async def handle_command(self, cmd: CommandType):
        """Handle client-side commands (button press, explicit commands)."""
        if cmd == CommandType.BUTTON_PRESS or cmd == CommandType.INTERRUPT:
            await self._trigger_interrupt()
        elif cmd == CommandType.STOP:
            await self._trigger_interrupt()
        elif cmd == CommandType.RESET:
            await self._trigger_reset()
        elif cmd == CommandType.LOUDER:
            await self._send(VoiceMessage.command(CommandType.LOUDER))
        elif cmd == CommandType.SOFTER:
            await self._send(VoiceMessage.command(CommandType.SOFTER))
        elif cmd == CommandType.STORY_MODE:
            self.mode = "story"
            self.system_prompt = self._build_system_prompt()
        elif cmd == CommandType.PLAY_MODE:
            self.mode = "play"
            self.system_prompt = self._build_system_prompt()
        elif cmd == CommandType.BEDTIME_MODE:
            self.mode = "bedtime"
            self.system_prompt = self._build_system_prompt()
        elif cmd == CommandType.SING_MODE:
            self.mode = "sing"
            self.system_prompt = self._build_system_prompt()
        elif cmd in (CommandType.CHARACTER_DRAGO, CommandType.CHARACTER_LIAM, CommandType.CHARACTER_JENNY,
                     CommandType.CHARACTER_ORSETTO, CommandType.CHARACTER_CONIGLIO):
            self.character = cmd.value.replace("character_", "")
            self.system_prompt = self._build_system_prompt()
        elif cmd == CommandType.WAKE:
            # Transition to listening state so audio gets processed
            async with self._lock:
                self.state = VoiceState.LISTENING
                await self._send(VoiceMessage.state_change(VoiceState.LISTENING))

    async def _process_buffered_audio(self):
        """DEPRECATED — kept for compatibility but no longer used."""
        pass

    async def stop(self):
        if self._input_task:
            self._input_task.cancel()
        if self._output_task:
            self._output_task.cancel()
        if self._vad_task:
            self._vad_task.cancel()
        try:
            await asyncio.gather(self._input_task, self._output_task, self._vad_task, return_exceptions=True)
        except Exception:
            pass
        logger.info(f"Session {self.session_id} stopped")

    # ── Core Pipeline ──

    async def _input_loop(self):
        """Main pipeline with wake phrase awareness."""
        while True:
            try:
                # ── IDLE: Wait for wake phrase ──
                if self.state == VoiceState.IDLE:
                    woke = await self._wait_for_wake()
                    if not woke:
                        continue
                    async with self._lock:
                        self.state = VoiceState.WAKE_DETECTED
                        await self._send(VoiceMessage.state_change(VoiceState.WAKE_DETECTED))
                        await self._send(VoiceMessage.wake_detected(woke))
                    # Brief pause then transition to LISTENING
                    await asyncio.sleep(0.3)
                    async with self._lock:
                        self.state = VoiceState.LISTENING
                        await self._send(VoiceMessage.state_change(VoiceState.LISTENING))
                    continue

                # ── LISTENING: Collect until silence or END_TURN ──
                if self.state == VoiceState.LISTENING:
                    audio = await self._collect_utterance()
                    if not audio:
                        continue

                    # STT on the full utterance
                    transcript = await self.providers.stt.transcribe(audio)
                    if not transcript:
                        await self._return_to_idle()
                        continue

                    await self._send(VoiceMessage.transcript(transcript))

                    # Check for commands in the transcript
                    cmd_result = self.providers.commands.classify(transcript)

                    if cmd_result.is_command:
                        handled = await self._handle_command_in_transcript(cmd_result, transcript)
                        if handled:
                            continue

                    # Not a command → process through LLM
                    self._current_utterance = transcript
                    await self._process_and_speak(transcript)
                    continue

                # ── SPEAKING: VAD loop handles barge-in, just wait ──
                if self.state == VoiceState.SPEAKING:
                    await self._speaking.wait()
                    continue

                # ── INTERRUPTED: Return to LISTENING ──
                if self.state == VoiceState.INTERRUPTED:
                    await self._return_to_listening()
                    continue

                # ── RESETTING: Return to IDLE ──
                if self.state == VoiceState.RESETTING:
                    await self._return_to_idle()
                    continue

                await asyncio.sleep(0.05)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Input loop error: {e}")
                await self._return_to_idle()

    async def _vad_loop(self):
        """Background VAD for barge-in detection while SPEAKING."""
        while True:
            try:
                await asyncio.sleep(0.05)

                if self.state != VoiceState.SPEAKING:
                    continue

                audio = self.vad_buffer.get_and_clear()
                if len(audio) < 3200:
                    continue

                if self.providers.vad.detect_speech(audio):
                    # Speech detected while speaking → potential barge-in
                    # Quick STT on the barge-in audio to check for interrupt phrase
                    transcript = await self.providers.stt.transcribe(audio)
                    if transcript:
                        cmd_result = self.providers.commands.classify(transcript)
                        if cmd_result.is_command and cmd_result.command in (
                            CommandType.INTERRUPT, CommandType.STOP, CommandType.END_TURN
                        ):
                            logger.info(f"Barge-in: {cmd_result.command.value} detected")
                            await self._trigger_interrupt()
                        else:
                            # Not an interrupt phrase, but user is talking → barge-in anyway
                            logger.info(f"Barge-in: user started talking ('{transcript}')")
                            await self._trigger_interrupt()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"VAD loop error: {e}")

    # ── Wake Phrase Handling ──

    async def _wait_for_wake(self) -> Optional[str]:
        """In IDLE, collect audio and check for wake phrase. Return phrase if found."""
        while True:
            await asyncio.sleep(0.05)

            audio = self.vad_buffer.get_and_clear()
            if len(audio) < 3200:  # 100ms
                continue

            # Run VAD
            if not self.providers.vad.detect_speech(audio):
                continue

            # Collect a short utterance (max 3 seconds)
            short_audio = await self._collect_short_utterance(max_seconds=3.0)
            if not short_audio:
                continue

            # STT on the short audio
            transcript = await self.providers.stt.transcribe(short_audio)
            if not transcript:
                continue

            # Check for wake phrase
            cmd_result = self.providers.commands.classify(transcript)
            if cmd_result.is_command and cmd_result.command == CommandType.WAKE:
                logger.info(f"Wake phrase detected: '{cmd_result.matched_phrase}'")
                return cmd_result.matched_phrase

            # Not a wake phrase → discard and stay IDLE
            logger.debug(f"IDLE: ignored non-wake transcript: '{transcript}'")
            self.input_buffer.get_and_clear()  # Flush input buffer

    async def _collect_short_utterance(self, max_seconds: float = 3.0) -> bytes:
        """Collect audio until silence or max time. For wake phrase detection."""
        audio = self.input_buffer.get_and_clear()
        silence_frames = 0
        max_frames = int(max_seconds * 1000 / 50)  # 50ms poll

        for _ in range(max_frames):
            await asyncio.sleep(0.05)
            chunk = self.input_buffer.get_and_clear()
            if not chunk:
                silence_frames += 1
            else:
                audio += chunk
                silence_frames = 0

            if silence_frames >= 8:  # 400ms silence
                break

        return audio

    # ── Command Handling in Transcript ──

    async def _handle_command_in_transcript(self, cmd_result, transcript: str) -> bool:
        """Handle a command found in a transcript. Return True if handled."""
        cmd = cmd_result.command

        if cmd == CommandType.INTERRUPT or cmd == CommandType.STOP:
            await self._trigger_interrupt()
            return True

        if cmd == CommandType.END_TURN:
            # Strip the end-turn phrase from transcript and process the rest
            clean_text = self._strip_command_phrase(transcript, cmd_result.matched_phrase)
            if clean_text.strip():
                await self._send(VoiceMessage.end_turn_ack())
                await self._process_and_speak(clean_text.strip())
            else:
                await self._return_to_listening()
            return True

        if cmd == CommandType.RESET:
            await self._trigger_reset()
            return True

        if cmd == CommandType.WAKE:
            # Already awake, just acknowledge
            await self._send(VoiceMessage.wake_detected(cmd_result.matched_phrase))
            return True

        if cmd == CommandType.LOUDER:
            await self._send(VoiceMessage.command(CommandType.LOUDER))
            return True

        if cmd == CommandType.SOFTER:
            await self._send(VoiceMessage.command(CommandType.SOFTER))
            return True

        if cmd == CommandType.STORY_MODE:
            self.mode = "story"
            self.system_prompt = self._build_system_prompt()
            return True

        if cmd == CommandType.PLAY_MODE:
            self.mode = "play"
            self.system_prompt = self._build_system_prompt()
            return True

        if cmd == CommandType.BEDTIME_MODE:
            self.mode = "bedtime"
            self.system_prompt = self._build_system_prompt()
            return True

        if cmd == CommandType.SING_MODE:
            self.mode = "sing"
            self.system_prompt = self._build_system_prompt()
            return True

        if cmd in (CommandType.CHARACTER_DRAGO, CommandType.CHARACTER_LIAM, CommandType.CHARACTER_JENNY,
                   CommandType.CHARACTER_ORSETTO, CommandType.CHARACTER_CONIGLIO):
            self.character = cmd.value.replace("character_", "")
            self.system_prompt = self._build_system_prompt()
            return True

        return False

    def _strip_command_phrase(self, transcript: str, phrase: str) -> str:
        """Remove the command phrase from the transcript."""
        if not phrase:
            return transcript
        # Case-insensitive replacement
        import re
        return re.sub(re.escape(phrase), "", transcript, flags=re.IGNORECASE).strip()

    # ── Process & Speak ──

    async def _process_and_speak(self, text: str):
        """Run LLM → TTS and stream to client."""
        async with self._lock:
            self.state = VoiceState.PROCESSING
            await self._send(VoiceMessage.state_change(VoiceState.PROCESSING))

        # LLM
        llm_response = await self._call_llm(text)
        if not llm_response:
            await self._return_to_listening()
            return

        # Store in history
        self._conversation_history.append({"role": "user", "content": text})
        self._conversation_history.append({"role": "assistant", "content": llm_response})

        # TTS
        await self._speak(llm_response)

    async def _speak(self, text: str):
        """Stream TTS to client with barge-in cancellation support."""
        async with self._lock:
            self.state = VoiceState.SPEAKING
            await self._send(VoiceMessage.state_change(VoiceState.SPEAKING))
            self._speaking.set()
            self._interrupted.clear()

        seq = 0
        try:
            async for chunk in self.providers.tts.synthesize_stream(text, self.character):
                if self._interrupted.is_set():
                    logger.info("TTS interrupted mid-stream")
                    break
                msg = VoiceMessage.tts_chunk(chunk, sequence=seq)
                await self._send(msg)
                seq += 1
        except asyncio.CancelledError:
            logger.info("TTS task cancelled")
        finally:
            self._speaking.clear()
            if not self._interrupted.is_set():
                await self._return_to_listening()

    # ── State Transitions ──

    async def _trigger_interrupt(self):
        """Cancel current output, send interrupt, return to LISTENING."""
        self._interrupted.set()
        if self._output_task and not self._output_task.done():
            self._output_task.cancel()
        await self._send(VoiceMessage.interrupt_ack())
        await self._send(VoiceMessage.command(CommandType.INTERRUPT))
        async with self._lock:
            self.state = VoiceState.INTERRUPTED
        self._speaking.clear()

    async def _trigger_reset(self):
        """Clear all state and return to IDLE."""
        logger.info(f"Session {self.session_id} resetting")
        if self._output_task and not self._output_task.done():
            self._output_task.cancel()
        self._conversation_history.clear()
        self._current_utterance = ""
        self.input_buffer.get_and_clear()
        self.vad_buffer.get_and_clear()
        async with self._lock:
            self.state = VoiceState.RESETTING
            await self._send(VoiceMessage.state_change(VoiceState.RESETTING))

    async def _return_to_listening(self):
        async with self._lock:
            self.state = VoiceState.LISTENING
            self._interrupted.clear()
            await self._send(VoiceMessage.state_change(VoiceState.LISTENING))

    async def _return_to_idle(self):
        async with self._lock:
            self.state = VoiceState.IDLE
            self._interrupted.clear()
            self._current_utterance = ""
            await self._send(VoiceMessage.state_change(VoiceState.IDLE))

    # ── Audio Collection ──

    async def _collect_utterance(self, silence_ms: int = 800) -> bytes:
        """Collect audio until silence or END_TURN signal."""
        audio = self.input_buffer.get_and_clear()
        silence_frames = 0
        max_frames = 300  # 15s max

        for _ in range(max_frames):
            await asyncio.sleep(0.05)
            chunk = self.input_buffer.get_and_clear()
            if not chunk:
                silence_frames += 1
            else:
                audio += chunk
                silence_frames = 0

            # Check for END_TURN signal (from VAD loop detecting end-turn phrase)
            if self._end_turn.is_set():
                self._end_turn.clear()
                break

            if silence_frames >= silence_ms // 50:
                break

        return audio

    # ── LLM Call ──

    async def _call_llm(self, transcript: str) -> str:
        """Call LLM via OpenRouter with conversation history."""
        try:
            messages = self._conversation_history[-6:] + [{"role": "user", "content": transcript}]
            answer = await self.providers.llm.complete(messages, self.system_prompt)
            return answer
        except Exception as e:
            logger.error(f"LLM error: {e}")
            return ""

    async def _process_and_speak(self, text: str):
        """Run LLM → TTS and stream to client."""
        async with self._lock:
            self.state = VoiceState.PROCESSING
            await self._send(VoiceMessage.state_change(VoiceState.PROCESSING))
            self.touch()

        # LLM
        llm_response = await self._call_llm(text)
        if not llm_response:
            await self._return_to_listening()
            return

        # Store in history
        self._conversation_history.append({"role": "user", "content": text})
        self._conversation_history.append({"role": "assistant", "content": llm_response})

        # Trim history to last 12 turns
        if len(self._conversation_history) > 12:
            self._conversation_history = self._conversation_history[-12:]

        # TTS
        await self._speak(llm_response)

    async def _speak(self, text: str):
        """Stream TTS to client with barge-in cancellation support."""
        async with self._lock:
            self.state = VoiceState.SPEAKING
            await self._send(VoiceMessage.state_change(VoiceState.SPEAKING))
            self._speaking.set()
            self._interrupted.clear()
            self.touch()

        seq = 0
        try:
            async for chunk in self.providers.tts.synthesize_stream(text, self.character, self.mode):
                if self._interrupted.is_set():
                    logger.info("TTS interrupted mid-stream")
                    break
                msg = VoiceMessage.tts_chunk(chunk, sequence=seq)
                await self._send(msg)
                seq += 1
        except asyncio.CancelledError:
            logger.info("TTS task cancelled")
        except Exception as e:
            logger.error(f"TTS error: {e}")
            await self._send(VoiceMessage.error("tts", str(e)))
        finally:
            self._speaking.clear()
            if not self._interrupted.is_set():
                await self._return_to_listening()
            self.touch()
