"""Casa Voice V2 — Voice Command Intent Classifier (Wake Phrase Edition)

Three action categories:
1. WAKE: Start listening ("Hello", "Hey", "Wake up", "Wake")
2. INTERRUPT: Cut off speaking ("Yo", "WTF", "One sec", "Hold on")
3. END_TURN: Force utterance end ("Send", "End", "Capische")
4. RESET: Clear session ("Reset")

Plus legacy commands (stop, louder, softer, modes, characters).

Runs entirely local, zero API cost, <10ms latency.
"""

import re
from typing import Optional, Tuple, Dict, List
from dataclasses import dataclass

from .protocol import CommandType


@dataclass
class CommandResult:
    is_command: bool
    command: Optional[CommandType] = None
    confidence: float = 1.0
    matched_phrase: Optional[str] = None


class CommandClassifier:
    """Fast regex-based command classifier with wake phrase support."""

    # Order matters: more specific / higher priority first
    PATTERNS = [
        # --- INTERRUPT (highest priority — can cut off TTS) ---
        (r"\b(yo\b|hold on|one sec|one second|wait up|cut it|shush|hush|quiet|enough|stop talking)\b", CommandType.INTERRUPT),

        # --- END TURN (force process current utterance) ---
        (r"\b(send it|send|end turn|end it|that\'s it|capische|capisce|done|over and out)\b", CommandType.END_TURN),

        # --- RESET (clear everything) ---
        (r"\b(reset|start over|clear session|forget everything)\b", CommandType.RESET),

        # --- WAKE (start listening from dormant) ---
        (r"\b(hello|hello casa|hey|hey casa|wake up|wake up casa|wake|casa|porcupine)\b", CommandType.WAKE),

        # --- STOP / Interrupt aliases ---
        (r"\b(stop talking|shut up|be quiet|halt|cease|enough)\b", CommandType.STOP),
        (r"\b(stop|quit|pause)\b", CommandType.STOP),

        # --- Volume ---
        (r"\b(louder|volume up|speak up|turn it up)\b", CommandType.LOUDER),
        (r"\b(softer|quieter|volume down|turn it down)\b", CommandType.SOFTER),

        # --- Volume (UI buttons) ---
        (r"\b(volume_up|volume up)\b", CommandType.VOLUME_UP),
        (r"\b(volume_down|volume down)\b", CommandType.VOLUME_DOWN),

        # --- Modes (kept as commands only for explicit short phrases) ---
        (r"\b(story mode|play mode)\b", CommandType.STORY_MODE),

        # --- Characters ---
        (r"\b(i want the dragon|drago|dragon mode)\b", CommandType.CHARACTER_DRAGO),
        (r"\b(liam|peter|jimmy)\b", CommandType.CHARACTER_LIAM),
        (r"\b(jenny|jennifer)\b", CommandType.CHARACTER_JENNY),
    ]

    # Wake-phrase prefix used to clean up transcripts after wake detection.
    # Anchored to the start of the string; tolerant of punctuation/whitespace after it.
    WAKE_PREFIX_RE = re.compile(
        r"^\s*(hello(?:\s+casa)?|hey(?:\s+casa)?|wake(?:\s+up(?:\s+casa)?)?|"
        r"i\'m\s+here|i\'m\s+back|casa|porcupine)[\s,!.]*",
        re.IGNORECASE,
    )

    def __init__(self):
        self._compiled = [(re.compile(p, re.IGNORECASE), cmd) for p, cmd in self.PATTERNS]

    def classify(self, transcript: str) -> CommandResult:
        """Return CommandResult. If no match, is_command=False."""
        for pattern, cmd in self._compiled:
            match = pattern.search(transcript)
            if match:
                return CommandResult(
                    is_command=True,
                    command=cmd,
                    confidence=1.0,
                    matched_phrase=match.group(0)
                )
        return CommandResult(is_command=False)

    def classify_with_score(self, transcript: str) -> Tuple[Optional[CommandType], float, Optional[str]]:
        result = self.classify(transcript)
        if result.is_command:
            return result.command, result.confidence, result.matched_phrase
        return None, 0.0, None

    def strip_wake_phrase(self, transcript: str) -> str:
        """Remove leading wake phrases, including repeated ones."""
        prev = None
        text = transcript
        while prev != text:
            prev = text
            text = self.WAKE_PREFIX_RE.sub("", text).strip()
        return text

    def is_wake_phrase(self, transcript: str) -> bool:
        """Quick check: is this a wake phrase?"""
        result = self.classify(transcript)
        return result.is_command and result.command == CommandType.WAKE

    def is_interrupt_phrase(self, transcript: str) -> bool:
        """Quick check: is this an interrupt phrase?"""
        result = self.classify(transcript)
        return result.is_command and result.command == CommandType.INTERRUPT

    def is_end_turn_phrase(self, transcript: str) -> bool:
        """Quick check: is this an end-turn phrase?"""
        result = self.classify(transcript)
        return result.is_command and result.command == CommandType.END_TURN


# Singleton
classifier = CommandClassifier()


# ── Trigger Responses ─────────────────────────────────────────────────────────
# Instant, zero-LLM replies for common phrases. Rotates so it doesn't sound robotic.

import random
from datetime import datetime


class TriggerResponder:
    """Map common voice intents to pre-canned responses."""

    RESPONSES = {
        "joke": [
            "Why did the teddy bear say no to dessert? Because it was already stuffed!",
            "Why did the bicycle fall over? Because it was two-tired!",
            "What do you call a bear with no socks? Bare-foot!",
            "Why can't you trust atoms? Because they make up everything!",
            "What do you call cheese that isn't yours? Nacho cheese!",
        ],
        "story": [
            "Once upon a time, a little dragon named Spark learned that the bravest thing you can do is share your toys.",
            "In a cozy cave at the edge of Whispering Woods, a friendly bear waited for the first star to make a wish.",
            "Long ago, a curious robot found a garden and discovered that flowers grow best when you talk to them nicely.",
        ],
        "greeting": [
            "Hey there! I'm Casa. What should we do today?",
            "Hi friend! Ready for an adventure?",
            "Hello! I've been waiting to play with you.",
        ],
        "bedtime": [
            "Sweet dreams, little one. The moon is watching over you.",
            "Time to rest your brave heart. See you in the morning.",
            "Goodnight. I'll be right here when you wake up.",
        ],
        "song": [
            "Twinkle twinkle little star, how I wonder what you are!",
            "You are my sunshine, my only sunshine. You make me happy when skies are gray!",
            "Row, row, row your boat, gently down the stream. Merrily, merrily, merrily, life is but a dream!",
        ],
    }

    TRIGGER_PATTERNS = [
        (re.compile(r"\b(tell me a joke|make me laugh|say something funny)\b", re.IGNORECASE), "joke"),
        (re.compile(r"\b(tell me a story|read me a story|story time)\b", re.IGNORECASE), "story"),
        (re.compile(r"\b(hello|hi there|hey casa|good morning|good afternoon)\b", re.IGNORECASE), "greeting"),
        (re.compile(r"\b(goodnight|bedtime|time for bed|night night)\b", re.IGNORECASE), "bedtime"),
        (re.compile(r"\b(sing me a song|sing a song|sing something)\b", re.IGNORECASE), "song"),
    ]

    def match(self, transcript: str) -> Optional[str]:
        """Return an instant response if the transcript matches a trigger, else None."""
        lowered = transcript.lower()

        # Time is special — generate dynamically.
        if re.search(r"\b(what time is it|what's the time|tell me the time)\b", lowered):
            return f"It's {datetime.now().strftime('%I:%M %p')}."

        for pattern, key in self.TRIGGER_PATTERNS:
            if pattern.search(transcript):
                responses = self.RESPONSES.get(key, [])
                if responses:
                    return random.choice(responses)
        return None


# ── Voice Echo (Keyword Learning) ─────────────────────────────────────────────
# Fast, zero-LLM acknowledgement that also extracts what the kid cares about.

@dataclass
class EchoMatch:
    echo_text: str
    interests: Dict[str, List[str]]


class EchoResponder:
    """Detect interest verbs + topics in a transcript and echo them back instantly.

    Example: "I love to talk about math and story time with my turtle"
      → echo: "You love math and story time with your turtle? That sounds awesome! Tell me more."
      → interests: {"love": ["math", "story time with your turtle"]}
    """

    VERB_MAP = {
        "love": "love",
        "like": "like",
        "enjoy": "enjoy",
        "favorite": "favorite",
        "favourite": "favorite",
        "hate": "dislike",
        "dislike": "dislike",
    }

    # Match "I love ...", "I like ...", "My favorite ...", "I don't like ...", etc.
    INTEREST_RE = re.compile(
        r"\b(?:i\s+(?P<verb1>love|like|enjoy|hate|dislike)|my\s+(?P<verb2>favorite|favourite)|i\s+don['’]t\s+like)\b"
        r"\s*(?P<rest>[^.!?]+)",
        re.IGNORECASE,
    )

    # Strip leading filler words from extracted topic phrases.
    FILLER_RE = re.compile(
        r"^(?:to|about|with|of|for|on|in|at|playing|talking|talk|discussing|the|a|an)\s+",
        re.IGNORECASE,
    )

    def match(self, transcript: str) -> Optional[EchoMatch]:
        lowered = transcript.lower()
        # Fast gate: don't run regex unless an interest verb is present.
        if not any(v in lowered for v in self.VERB_MAP):
            return None

        interests: Dict[str, List[str]] = {}
        for m in self.INTEREST_RE.finditer(transcript):
            verb = (m.group("verb1") or m.group("verb2") or "dislike").lower()
            category = self.VERB_MAP.get(verb, "like")
            rest = m.group("rest").strip()
            if not rest:
                continue

            # Split joint interests on "and" or commas.
            parts = re.split(r"\band\b|(?<!\band),", rest, flags=re.IGNORECASE)
            for part in parts:
                item = self._clean_item(part)
                if item and item not in interests.get(category, []):
                    interests.setdefault(category, []).append(item)

        if not interests:
            return None

        return EchoMatch(echo_text=self._build_echo(interests), interests=interests)

    def _clean_item(self, text: str) -> str:
        text = text.strip()
        # Remove leading filler words repeatedly.
        while True:
            cleaned = self.FILLER_RE.sub("", text).strip()
            if cleaned == text:
                break
            text = cleaned
        # Echo back from the kid's perspective: "my turtle" → "your turtle".
        if text.lower().startswith("my "):
            text = "your " + text[3:]
        text = re.sub(r"\bmy\b", "your", text, flags=re.IGNORECASE)
        return text

    def _build_echo(self, interests: Dict[str, List[str]]) -> str:
        # Build natural phrases, grouped by verb category.
        category_phrases = []
        for category in ("love", "like", "enjoy", "favorite", "dislike"):
            items = interests.get(category, [])
            if not items:
                continue
            if category == "dislike":
                verb = "don't like"
            elif category == "favorite":
                verb = "love"
            else:
                verb = category

            if len(items) > 1:
                item_phrase = ", ".join(items[:-1]) + f" and {items[-1]}"
            else:
                item_phrase = items[0]
            category_phrases.append(f"{verb} {item_phrase}")

        if not category_phrases:
            category_phrases = ["like that"]

        if len(category_phrases) > 1:
            full = ", ".join(category_phrases[:-1]) + f", and {category_phrases[-1]}"
        else:
            full = category_phrases[0]

        if "dislike" in interests and len(interests) == 1:
            return f"You {full}? That's okay. Everyone likes different things."
        return f"You {full}? That sounds awesome! Tell me more."


# ── Keyword Compressor ────────────────────────────────────────────────────────
# Shrinks a long kid utterance to keyword tokens before sending it to the LLM.
# This cuts token count and can reduce LLM latency for rambling transcripts.

class KeywordCompressor:
    """Strip filler words and keep the content words."""

    STOP_WORDS = {
        "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your",
        "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she",
        "her", "hers", "herself", "it", "its", "itself", "they", "them", "their",
        "theirs", "themselves", "what", "which", "who", "whom", "this", "that",
        "these", "those", "am", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "having", "do", "does", "did", "doing", "a", "an",
        "the", "and", "but", "if", "or", "because", "as", "until", "while", "of",
        "at", "by", "for", "with", "through", "during", "before", "after", "above",
        "below", "up", "down", "in", "out", "on", "off", "over", "under", "again",
        "further", "then", "once", "here", "there", "when", "where", "why", "how",
        "all", "any", "both", "each", "few", "more", "most", "other", "some",
        "such", "only", "own", "same", "so", "than", "too",
        "very", "s", "t", "can", "will", "just", "should", "now", "to",
        "about", "also", "would", "could", "may", "might",
        "um", "uh", "oh", "ok", "okay", "yeah", "yes",
    }

    # Expand common contractions so negation isn't lost when the apostrophe is stripped.
    CONTRACTIONS = {
        "don't": "do not",
        "doesn't": "does not",
        "didn't": "did not",
        "won't": "will not",
        "wouldn't": "would not",
        "couldn't": "could not",
        "shouldn't": "should not",
        "can't": "can not",
        "isn't": "is not",
        "aren't": "are not",
        "wasn't": "was not",
        "weren't": "were not",
        "haven't": "have not",
        "hasn't": "has not",
        "hadn't": "had not",
        "i'm": "i am",
        "it's": "it is",
        "that's": "that is",
        "what's": "what is",
        "let's": "let us",
    }

    def compress(self, transcript: str) -> str:
        # Expand contractions first so negation and meaning are preserved.
        text = transcript.lower()
        for contraction, expansion in self.CONTRACTIONS.items():
            text = re.sub(r"\b" + re.escape(contraction) + r"\b", expansion, text)

        # Remove punctuation and split.
        cleaned = re.sub(r"[^\w\s]", " ", text)
        words = cleaned.split()
        kept = [
            w for w in words
            if w not in self.STOP_WORDS and len(w) > 2 and not w.isdigit()
        ]
        return " ".join(kept) if kept else transcript.strip()


# Singletons
classifier = CommandClassifier()
trigger_responder = TriggerResponder()
echo_responder = EchoResponder()
keyword_compressor = KeywordCompressor()
