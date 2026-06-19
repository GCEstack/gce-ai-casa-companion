# Voice Design Prompt

Copy and paste the block below into Kimi, ChatGPT, Claude, or any AI assistant. Then paste the character roster from `docs/character-roster.md` underneath it.

---

## Prompt

```
I have a roster of plush-toy AI companions for kids. Each character has:
- Name
- Species / animal / object
- Italian meaning / role
- Personality summary
- Special features (optional modes)

I need a unique voice profile for every single character so that a child can tell them apart by sound alone.

For each character, please generate:

1. **Recommended TTS preset** — pick the closest OpenAI/standard voice (alloy, ash, coral, echo, fable, nova, onyx, sage, shimmer) OR suggest an ElevenLabs-style voice label (e.g., "warm elderly British female").
2. **Voice instructions** — a short prompt I can feed to a TTS engine that supports voice directions (like OpenAI gpt-4o-mini-tts or ElevenLabs). Describe: pitch, pace, energy, warmth, accent, quirks, and delivery style.
3. **Why it fits** — one sentence connecting the voice to the animal/species and personality.
4. **Distinctiveness note** — what makes this voice different from the others, especially characters that share the same base TTS preset.

Rules:
- No two characters should sound identical.
- Lean into the animal/object identity (e.g., a turtle speaks slowly; a dolphin is bright and bouncy; a rooster is loud and cheerful).
- Keep voices kid-friendly, warm, and non-scary.
- If a character is meant to be calming, use a softer, slower delivery.
- If a character is energetic or sporty, use a quicker, more upbeat delivery.
- Use accents or vocal quirks sparingly and only when they fit the character’s theme.

Output as a markdown table with columns:
Character | Base Voice | Voice Instructions | Why It Fits | Distinctiveness

Here is the roster:

[PASTE ROSTER HERE]
```

---

## Example output row

| Character | Base Voice | Voice Instructions | Why It Fits | Distinctiveness |
|---|---|---|---|---|
| **Tartaruga** | `alloy` | Slow, soft, with a gentle rhythmic pace like ocean waves. Slight pauses between phrases. Warm, ancient, and reassuring. | A sea turtle should sound patient and wise, matching her calm, ocean-deep personality. | Uses the slowest pace in the cast and the most deliberate pauses. |
| **Rocco** | `onyx` | Rough, energetic rock-vocalist tone. Loud but friendly, with a slight rasp and a lot of enthusiasm. Ends sentences with a little growl of excitement. | A punk-rock cockroach frontman needs a voice that sounds like he’s shouting into a mic on stage. | The only deliberately raspy/rough voice; high energy without being scary. |
| **Sacco** | `nova` | Groovy DJ energy. Rhythmic cadence, occasional beat-box syllables, and a bouncy, party-host vibe. | A DJ sack bag should sound like he’s always hyping a crowd. | Adds rhythm and musicality to speech; no one else sounds like they’re on a dance floor. |

---

## Tip

If you want to generate actual audio samples, take the "Voice Instructions" column and use it as the `voice.instructions` field with OpenAI's `gpt-4o-mini-tts` model, or as a Voice Design prompt in ElevenLabs.
