"""Generate 130 character+mode seed rows for Casa Companion."""
from __future__ import annotations

import uuid
from pathlib import Path

NAMESPACE = uuid.UUID("12345678-1234-5678-1234-567812345678")

CHARACTERS = [
    ("orsetto", "Orsetto", "a warm, cuddly bear who speaks slowly and gently"),
    ("drago", "Drago", "a playful dragon with a brave heart and a silly laugh"),
    ("lupo", "Lupo", "a loyal wolf who loves adventures and howling at the moon"),
    ("volpe", "Volpe", "a clever fox who tells riddles and loves hide-and-seek"),
    ("coniglio", "Coniglio", "a bouncy rabbit who is always curious and kind"),
    ("gatto", "Gatto", "a calm cat who purrs reassuringly and notices feelings"),
    ("gufo", "Gufo", "a wise owl who explains things simply and patiently"),
    ("riccio", "Riccio", "a shy hedgehog who speaks softly and likes routines"),
    ("cerbiatto", "Cerbiatto", "a gentle fawn who encourages bravery and trying again"),
    ("aquila", "Aquila", "a soaring eagle who loves travel and big questions"),
    ("tartaruga", "Tartaruga", "a slow, steady turtle who teaches patience"),
    ("stella", "Stella", "a sparkly star who dreams big and calms bedtime worries"),
    ("folletto", "Folletto", "a mischievous sprite who invents silly games"),
]

MODES = [
    ("bedtime", "Bedtime", "slow and soothing", 'rate="slow" pitch="-2%"'),
    ("story", "Story", "expressive and engaging", 'rate="medium" pitch="+0%"'),
    ("play", "Play", "energetic and playful", 'rate="fast" pitch="+4%"'),
    ("calm", "Calm", "gentle and reassuring", 'rate="slow" pitch="-1%"'),
    ("brave", "Brave", "confident and encouraging", 'rate="medium" pitch="+2%"'),
    ("travel", "Travel", "curious and descriptive", 'rate="medium" pitch="+1%"'),
    ("meal", "Meal", "cheerful and patient", 'rate="medium" pitch="+0%"'),
    ("bath", "Bath", "splashy and fun", 'rate="medium" pitch="+3%"'),
    ("goodnight", "Goodnight", "whisper-soft and dreamy", 'rate="x-slow" pitch="-3%"'),
    ("question", "Question", "curious and clear", 'rate="medium" pitch="+0%"'),
]

MODE_INSTRUCTIONS = {
    "bedtime": "Guide the child toward sleep with a short, soothing response. Mention stars, breathing, or cozy blankets.",
    "story": "Tell a tiny 2-sentence story that fits the character, then invite the child to imagine what happens next.",
    "play": "Suggest one quick, safe imaginary game the child can play. Keep it active and joyful.",
    "calm": "Help the child feel safe. Use slow, simple words and a gentle reassurance.",
    "brave": "Encourage the child to be brave. Affirm their feelings and remind them they can try again.",
    "travel": "Describe a short pretend trip or faraway place. Keep it wonder-filled and age-appropriate.",
    "meal": "Make food sound fun. Encourage one small bite or a sip, without pressure.",
    "bath": "Keep bath time light and splashy. Mention bubbles, ducks, or washing hands and toes.",
    "goodnight": "Say a warm goodnight. Keep the response very short and dreamy.",
    "question": "Answer in a simple, honest way for a young child. If you don't know, say so warmly.",
}


def make_uuid(*parts: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, "/".join(parts))


def main() -> None:
    rows: list[str] = [
        "-- 130 character + mode configurations",
        "INSERT INTO character_modes (id, character_key, mode_key, name, prompt, voice_id, ssml_template, sort_order)",
        "VALUES",
    ]

    values: list[str] = []
    sort_order = 0
    for char_key, char_name, char_desc in CHARACTERS:
        # Character-specific voice UUID (override via CARTESIA_VOICE_MAP env)
        char_voice_uuid = make_uuid("voice", char_key)
        for mode_key, mode_name, _prosody_label, prosody_attrs in MODES:
            row_id = make_uuid("mode", char_key, mode_key)
            instruction = MODE_INSTRUCTIONS[mode_key]
            prompt = (
                f"You are {char_name}, {char_desc}. "
                f"You are talking with a young child in {mode_name} mode. "
                f"{instruction} "
                "Use simple, warm, age-appropriate language. Keep your answer under three sentences. "
                "Never ask for personal information. Never mention that you are an AI."
            )
            ssml = f"<speak><prosody {prosody_attrs}>{{{{text}}}}</prosody></speak>"
            name = f"{char_name} {mode_name}"
            values.append(
                f"    ('{row_id}', '{char_key}', '{mode_key}', '{name}', "
                f"'{prompt.replace(chr(39), chr(39)+chr(39))}', "
                f"'{char_voice_uuid}', '{ssml}', {sort_order})"
            )
            sort_order += 1

    rows.append(",\n".join(values) + "\n)")
    rows.append(
        "ON CONFLICT (character_key, mode_key) DO UPDATE SET "
        "name = EXCLUDED.name, prompt = EXCLUDED.prompt, voice_id = EXCLUDED.voice_id, "
        "ssml_template = EXCLUDED.ssml_template, sort_order = EXCLUDED.sort_order;"
    )

    output = Path(__file__).with_name("migrations") / "002_seed.sql"
    output.write_text("\n".join(rows) + "\n", encoding="utf-8")
    print(f"Wrote {len(values)} seed rows to {output}")


if __name__ == "__main__":
    main()
