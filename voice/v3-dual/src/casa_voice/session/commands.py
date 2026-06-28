import logging

from ..protocol import VoiceState, CommandType, VoiceMessage

logger = logging.getLogger(__name__)


async def handle_command(self, cmd: CommandType):
    if cmd == CommandType.INTERRUPT or cmd == CommandType.STOP:
        await self._trigger_interrupt()
    elif cmd == CommandType.RESET:
        await self._trigger_reset()
    elif cmd == CommandType.WAKE:
        if self.state == VoiceState.IDLE:
            async with self._lock:
                self.state = VoiceState.WAKE_DETECTED
                await self._broadcast(VoiceMessage.state_change(VoiceState.WAKE_DETECTED))
    elif cmd == CommandType.START_LISTENING:
        # Push-to-talk: start a new listening turn from any state.
        self._manual_stop = False
        if self.state == VoiceState.SPEAKING:
            await self._trigger_interrupt()
        async with self._lock:
            if self.state in (VoiceState.IDLE, VoiceState.INTERRUPTED):
                self.state = VoiceState.WAKE_DETECTED
                await self._broadcast(VoiceMessage.state_change(VoiceState.WAKE_DETECTED))
            elif self.state == VoiceState.LISTENING:
                # Already listening; extend the current turn.
                pass
    elif cmd == CommandType.STOP_LISTENING:
        # Push-to-talk release: stop collecting audio and process what we have.
        if self.state in (VoiceState.WAKE_DETECTED, VoiceState.LISTENING):
            self._manual_stop = True
            self._wake_event.set()
    elif cmd == CommandType.LOUDER or cmd == CommandType.VOLUME_UP:
        await self.handle_config_change(volume=self.volume + 0.1)
    elif cmd == CommandType.SOFTER or cmd == CommandType.VOLUME_DOWN:
        await self.handle_config_change(volume=self.volume - 0.1)
    elif cmd == CommandType.CHARACTER_DRAGO:
        await self.handle_config_change(character="drago")
    elif cmd == CommandType.CHARACTER_LIAM:
        await self.handle_config_change(character="liam")
    elif cmd == CommandType.CHARACTER_JENNY:
        await self.handle_config_change(character="jenny")
    elif cmd == CommandType.CHARACTER_DEFAULT:
        await self.handle_config_change(character="default")
    elif cmd == CommandType.SCENE_BEDTIME:
        await self._run_scene("bedtime")
    elif cmd == CommandType.SCENE_GREETING:
        await self._run_scene("greeting")
    elif cmd == CommandType.SCENE_JOKE:
        await self._run_scene("joke")


async def _handle_command_in_transcript(self, cmd_result, transcript: str) -> bool:
    cmd = cmd_result.command

    if cmd == CommandType.INTERRUPT or cmd == CommandType.STOP:
        await self._trigger_interrupt()
        return True

    if cmd == CommandType.RESET:
        await self._trigger_reset()
        return True

    if cmd == CommandType.WAKE:
        await self._broadcast(VoiceMessage.state_change(VoiceState.WAKE_DETECTED))
        return True

    if cmd == CommandType.LOUDER:
        await self.handle_config_change(volume=self.volume + 0.1)
        return True

    if cmd == CommandType.SOFTER:
        await self.handle_config_change(volume=self.volume - 0.1)
        return True

    if cmd == CommandType.VOLUME_UP:
        await self.handle_config_change(volume=self.volume + 0.1)
        return True

    if cmd == CommandType.VOLUME_DOWN:
        await self.handle_config_change(volume=self.volume - 0.1)
        return True

    if cmd == CommandType.STORY_MODE:
        await self.handle_config_change(character="drago", mode="story")
        return True

    if cmd == CommandType.PLAY_MODE:
        await self.handle_config_change(character="liam", mode="play")
        return True

    if cmd in (
        CommandType.CHARACTER_DRAGO,
        CommandType.CHARACTER_LIAM,
        CommandType.CHARACTER_JENNY,
        CommandType.CHARACTER_DEFAULT,
    ):
        character = cmd.value.replace("character_", "")
        await self.handle_config_change(character=character)
        return True

    return False
