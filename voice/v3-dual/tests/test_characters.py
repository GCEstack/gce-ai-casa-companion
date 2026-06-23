"""Tests for per-character personality and voice routing."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from casa_voice.providers import CharacterVoiceRouter
from casa_voice.sessions import VoiceSession


class FakeLLM:
    pass


class FakeCommands:
    pass


class FakeTTS:
    voice_router = CharacterVoiceRouter()


class FakeProviders:
    llm = FakeLLM()
    tts = FakeTTS()
    commands = FakeCommands()
    stt = None
    native_audio = None


def test_character_voice_mapping():
    router = CharacterVoiceRouter()
    assert router.get_voice("drago") == "Fenrir"
    assert router.get_voice("corvo") == "Charon"
    assert router.get_voice("maestra") == "Leda"
    assert router.get_voice("unknown", "Kore") == "Kore"


def test_character_profile_prompt_prefixes():
    router = CharacterVoiceRouter()
    drago = router.get_profile("drago")
    assert "Drago" in drago.prompt_prefix
    assert "dragon" in drago.prompt_prefix

    liam = router.get_profile("liam")
    assert "DJ" in liam.prompt_prefix

    jenny = router.get_profile("jenny")
    assert "artist" in jenny.prompt_prefix


def test_apply_character_tags():
    router = CharacterVoiceRouter()
    tagged = router.apply_tags("Hello there", "drago", "story")
    assert tagged.startswith("[excited]")

    tagged_calm = router.apply_tags("Shh, it's okay", "liam", "calm")
    assert tagged_calm.startswith("[sighs]")


def test_system_prompt_uses_character_profile():
    providers = FakeProviders()

    drago = VoiceSession("test-drago", providers, character="drago")
    drago_prompt = drago._build_system_prompt()
    assert "Drago, a friendly dragon" in drago_prompt
    assert "Respond briefly (1-2 sentences)" in drago_prompt

    liam = VoiceSession("test-liam", providers, character="liam")
    liam_prompt = liam._build_system_prompt()
    assert "cool teen DJ" in liam_prompt

    jenny = VoiceSession("test-jenny", providers, character="jenny")
    jenny_prompt = jenny._build_system_prompt()
    assert "creative artist" in jenny_prompt


def test_system_prompt_interests_appended():
    providers = FakeProviders()
    session = VoiceSession("test-interests", providers, character="default")
    session._interests = {"love": ["dinosaurs", "spaceships"], "dislike": ["spiders"]}
    prompt = session._build_system_prompt()
    assert "love" in prompt
    assert "dinosaurs" in prompt
    assert "spiders" in prompt


def test_shared_character_prompt_loaded():
    router = CharacterVoiceRouter()
    corvo = router.get_profile("corvo")
    assert "Corvo" in corvo.prompt_prefix
    assert "crow" in corvo.prompt_prefix.lower()

    tartaruga = router.get_profile("tartaruga")
    assert "Tartaruga" in tartaruga.prompt_prefix
    assert "sea turtle" in tartaruga.prompt_prefix.lower()
