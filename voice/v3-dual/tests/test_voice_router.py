"""Unit tests for casa_voice.providers.CharacterVoiceRouter."""

import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / "src"))

import pytest

from casa_voice.providers import CharacterVoiceRouter


@pytest.fixture
def router():
    return CharacterVoiceRouter()


class TestCharacterVoiceRouter:
    def test_default_voice(self, router):
        assert router.get_voice("unknown") == "Kore"
        assert router.get_voice("unknown", default_voice="Puck") == "Puck"

    def test_known_characters_have_distinct_gemini_voices(self, router):
        voices = {
            router.get_voice(char)
            for char in [
                "pietro",
                "coniglio",
                "corvo",
                "gufo",
                "orsetto",
                "tartaruga",
                "elefante",
                "leone",
                "delfino",
                "drago",
                "rocco",
                "vinile",
                "battito",
                "onda",
                "maestra",
                "costruttore",
                "dottore",
                "mamma",
                "nonna",
                "cucita",
                "polpo",
                "xolo",
                "scheletro",
                "ragno",
                "veloce",
                "stellino",
                "sacco",
                "spugna",
                "borsa",
                "forza",
                "bella",
                "cuoco",
                "verita",
            ]
        }
        # With 30 Gemini voices and 33 characters, a few share. Assert most are unique.
        assert len(voices) >= 25, f"Expected many distinct voices, got {len(voices)}: {voices}"

    def test_all_mapped_voices_are_valid_gemini_names(self, router):
        valid_gemini_voices = {
            "Achernar",
            "Achird",
            "Algenib",
            "Algieba",
            "Alnilam",
            "Aoede",
            "Autonoe",
            "Callirrhoe",
            "Charon",
            "Despina",
            "Enceladus",
            "Erinome",
            "Fenrir",
            "Gacrux",
            "Iapetus",
            "Kore",
            "Laomedeia",
            "Leda",
            "Orus",
            "Pulcherrima",
            "Puck",
            "Rasalgethi",
            "Sadachbia",
            "Sadaltager",
            "Schedar",
            "Sulafat",
            "Umbriel",
            "Vindemiatrix",
            "Zephyr",
            "Zubenelgenubi",
        }
        for character, voice in router.GEMINI_VOICES.items():
            assert voice in valid_gemini_voices, f"{character} -> invalid voice {voice}"

    def test_apply_tags_returns_tagged_text(self, router):
        text = "Hello there"
        tagged = router.apply_tags(text, "drago", "story")
        assert tagged.startswith("[excited] Hello there")

    def test_apply_tags_unknown_character_uses_default(self, router):
        text = "Hello there"
        tagged = router.apply_tags(text, "some_new_character", "play")
        assert tagged.startswith("[laughs] Hello there")
