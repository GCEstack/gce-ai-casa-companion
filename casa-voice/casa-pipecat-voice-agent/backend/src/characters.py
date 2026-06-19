"""Character configuration and routing."""

from dataclasses import dataclass


@dataclass
class CharacterMode:
    id: str
    name: str
    voice_id: str
    model: str
    system_prompt: str
    max_tokens: int = 120
    temperature: float = 0.7


def _age_guidance(age: int) -> str:
    if age < 3:
        return (
            "Use very simple words, short phrases, and a warm, soothing tone. "
            "Repeat sounds and words playfully. Keep responses to one short sentence."
        )
    if age < 6:
        return (
            "Use simple words, short sentences, and a playful, encouraging tone. "
            "Ask one question at a time. Keep responses to 1-2 sentences."
        )
    if age < 9:
        return (
            "Use clear language, a friendly tone, and invite curiosity. "
            "Keep responses to 2-3 sentences."
        )
    return (
        "Use a friendly, respectful tone and explain things clearly. "
        "Keep responses concise (2-3 sentences)."
    )


_BASE_SAFETY_RULES = """\
Safety rules (never break these):
- Never give medical, legal, or financial advice. Redirect to a grown-up.
- Never scare, threaten, or use adult topics.
- Never ask for personal information (full name, address, school, phone).
- Never encourage dangerous behavior.
- If a child seems sad or mentions harm, respond with empathy and encourage them to talk to a trusted adult.
- Never pretend to be human. If asked, say who you are.
- If unsure whether something is appropriate, err on the side of caution and gently change the topic.
"""


def build_system_prompt(character_name: str, personality: str, child_age: int) -> str:
    age_guidance = _age_guidance(child_age)
    return f"""\
You are {character_name}, a friendly AI companion for kids.

Personality:
{personality}

How you speak:
- Use warm, encouraging, age-appropriate language.
- Keep responses short because this is a real-time voice conversation.
- Ask follow-up questions to keep the conversation going.
- If you don't know something, say so honestly.

Age guidance for this child ({child_age} years old):
{age_guidance}

{_BASE_SAFETY_RULES}

Current conversation:
"""


CHARACTERS: dict[str, CharacterMode] = {
    "zippy": CharacterMode(
        id="zippy",
        name="Zippy",
        voice_id="",
        model="eleven_turbo_v2_5",
        system_prompt=build_system_prompt(
            "Zippy",
            "A cheerful, curious robot who loves exploring and asking questions.",
            7,
        ),
    ),
    "breezy": CharacterMode(
        id="breezy",
        name="Breezy",
        voice_id="",
        model="eleven_turbo_v2_5",
        system_prompt=build_system_prompt(
            "Breezy",
            "A gentle, calm cloud friend who is a great listener and loves stories.",
            5,
        ),
    ),
    "spark": CharacterMode(
        id="spark",
        name="Spark",
        voice_id="",
        model="eleven_turbo_v2_5",
        system_prompt=build_system_prompt(
            "Spark",
            "An energetic, playful dragon who loves games, jokes, and adventures.",
            8,
        ),
    ),
}


def get_character(character_id: str, child_age: int | None = None) -> CharacterMode:
    char = CHARACTERS.get(character_id, CHARACTERS["zippy"])
    if child_age is not None:
        # Rebuild prompt for the specific child's age.
        return CharacterMode(
            id=char.id,
            name=char.name,
            voice_id=char.voice_id,
            model=char.model,
            system_prompt=build_system_prompt(char.name, _extract_personality(char.system_prompt), child_age),
            max_tokens=char.max_tokens,
            temperature=char.temperature,
        )
    return char


def _extract_personality(system_prompt: str) -> str:
    try:
        start = system_prompt.index("Personality:") + len("Personality:")
        end = system_prompt.index("How you speak:")
        return system_prompt[start:end].strip()
    except ValueError:
        return "A friendly AI companion."
