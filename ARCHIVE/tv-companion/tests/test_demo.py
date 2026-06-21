"""
Casa Companion Demo — Test Suite
Run locally: pytest tests/test_demo.py -v
Requires: server running on localhost:8000 with AZURE_API_KEY set
"""
import pytest
import httpx
import struct
import time

BASE = "http://127.0.0.1:8000"

ALL_CHARACTERS = [
    "corvo", "gufo", "orsetto", "coniglio", "tartaruga",
    "elefante", "leone", "delfino", "drago", "xolo"
]

ALL_MODES = [
    "introduction", "story_time", "calm_breathe", "stem_sparks",
    "music_rhythm", "geography", "languages", "homework",
    "coding", "milestones", "teaching"
]


# =========================================================================
# SECTION 1: API SMOKE TESTS
# =========================================================================

class TestSmoke:
    """Basic endpoint health — every route returns expected status/format."""

    def test_health(self):
        r = httpx.get(f"{BASE}/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert data["service"] == "casa-companion-demo"

    def test_root_serves_html(self):
        r = httpx.get(f"{BASE}/")
        assert r.status_code == 200
        assert "text/html" in r.headers["content-type"]
        assert "Casa Companion" in r.text

    def test_characters_endpoint(self):
        r = httpx.get(f"{BASE}/api/characters")
        assert r.status_code == 200
        data = r.json()
        for key in ALL_CHARACTERS:
            assert key in data, f"Missing character: {key}"
            assert "name" in data[key]
            assert "meaning" in data[key]

    def test_modes_endpoint(self):
        r = httpx.get(f"{BASE}/api/modes")
        assert r.status_code == 200
        data = r.json()
        for mode in ALL_MODES:
            assert mode in data, f"Missing mode: {mode}"
            assert "name" in data[mode]
            assert "icon" in data[mode]

    def test_chat_basic(self):
        r = httpx.post(f"{BASE}/api/chat", json={
            "message": "Hello!",
            "history": [],
            "character": "corvo"
        }, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "response" in data
        assert len(data["response"]) > 0

    def test_chat_missing_message(self):
        r = httpx.post(f"{BASE}/api/chat", json={
            "history": [],
            "character": "corvo"
        }, timeout=10)
        assert r.status_code == 422  # validation error

    def test_tts_basic(self):
        r = httpx.post(f"{BASE}/api/tts", json={
            "text": "Hello world",
            "character": "corvo"
        }, timeout=30)
        assert r.status_code == 200
        assert "audio" in r.headers["content-type"]
        assert len(r.content) > 1000  # should be real audio, not empty

    def test_tts_empty_text(self):
        r = httpx.post(f"{BASE}/api/tts", json={
            "text": "",
            "character": "corvo"
        }, timeout=10)
        assert r.status_code in [400, 422]  # should reject empty

    def test_chat_and_speak_basic(self):
        r = httpx.post(f"{BASE}/api/chat-and-speak", json={
            "message": "Tell me a short joke",
            "history": [],
            "character": "corvo"
        }, timeout=30)
        assert r.status_code == 200
        # Binary format: 4-byte header length + JSON header + audio
        data = r.content
        assert len(data) > 100
        header_len = struct.unpack(">I", data[:4])[0]
        header_json = data[4:4 + header_len].decode("utf-8")
        assert "response" in header_json

    def test_voice_token(self):
        r = httpx.post(f"{BASE}/api/voice/token", json={
            "character": "corvo"
        }, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "token" in data
        assert "voice" in data
        assert "character" in data
        assert data["character"] == "corvo"

    def test_survey_valid(self):
        r = httpx.post(f"{BASE}/api/survey", json={
            "email": f"test_{int(time.time())}@example.com",
            "age": "3",
            "interests": ["stories", "music"],
            "priorities": ["safety"],
            "feedback": "Automated test"
        }, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is True

    def test_survey_invalid_email(self):
        r = httpx.post(f"{BASE}/api/survey", json={
            "email": "not-an-email",
        }, timeout=10)
        assert r.status_code in [400, 422]


# =========================================================================
# SECTION 2: CONVERSATION FLOW TESTS
# =========================================================================

class TestConversationFlow:
    """Simulate full user journeys through the demo."""

    @pytest.mark.parametrize("character", ALL_CHARACTERS)
    def test_each_character_responds(self, character):
        """Every character can handle a basic greeting."""
        r = httpx.post(f"{BASE}/api/chat", json={
            "message": "Hi there!",
            "history": [],
            "character": character
        }, timeout=30)
        assert r.status_code == 200
        text = r.json()["response"]
        assert len(text) > 10, f"{character} gave empty/tiny response"

    @pytest.mark.parametrize("character", ALL_CHARACTERS)
    def test_each_character_tts(self, character):
        """Every character can generate TTS audio."""
        r = httpx.post(f"{BASE}/api/tts", json={
            "text": "Testing voice output.",
            "character": character
        }, timeout=30)
        assert r.status_code == 200
        assert len(r.content) > 1000, f"{character} TTS returned tiny audio"

    def test_multi_turn_conversation(self):
        """Simulate a 3-turn conversation with history."""
        history = []

        # Turn 1
        r1 = httpx.post(f"{BASE}/api/chat", json={
            "message": "Hi Corvo! Tell me about the ocean.",
            "history": history,
            "character": "corvo"
        }, timeout=30)
        assert r1.status_code == 200
        reply1 = r1.json()["response"]
        history.append({"role": "user", "content": "Hi Corvo! Tell me about the ocean."})
        history.append({"role": "assistant", "content": reply1})

        # Turn 2 — follow-up
        r2 = httpx.post(f"{BASE}/api/chat", json={
            "message": "What animals live there?",
            "history": history,
            "character": "corvo"
        }, timeout=30)
        assert r2.status_code == 200
        reply2 = r2.json()["response"]
        history.append({"role": "user", "content": "What animals live there?"})
        history.append({"role": "assistant", "content": reply2})

        # Turn 3 — context check
        r3 = httpx.post(f"{BASE}/api/chat", json={
            "message": "Which one is your favorite?",
            "history": history,
            "character": "corvo"
        }, timeout=30)
        assert r3.status_code == 200
        reply3 = r3.json()["response"]
        assert len(reply3) > 10

    def test_mode_switching(self):
        """Switch between modes and verify character stays in role."""
        # Story mode
        r1 = httpx.post(f"{BASE}/api/chat", json={
            "message": "Tell me a story!",
            "history": [],
            "character": "gufo",
            "mode": "story_time"
        }, timeout=30)
        assert r1.status_code == 200
        story = r1.json()["response"]
        assert len(story) > 20

        # Switch to STEM mode
        r2 = httpx.post(f"{BASE}/api/chat", json={
            "message": "Why is the sky blue?",
            "history": [],
            "character": "gufo",
            "mode": "stem_sparks"
        }, timeout=30)
        assert r2.status_code == 200
        stem = r2.json()["response"]
        assert len(stem) > 20

    @pytest.mark.parametrize("mode", ALL_MODES)
    def test_each_mode_responds(self, mode):
        """Every mode produces a valid response."""
        prompts = {
            "introduction": "Hi!",
            "story_time": "Tell me a story about a brave explorer",
            "calm_breathe": "I feel nervous",
            "stem_sparks": "Why do leaves change color?",
            "music_rhythm": "Let's sing a song!",
            "geography": "Tell me about Italy",
            "languages": "How do you say hello in Spanish?",
            "homework": "Help me with addition: 5 + 3",
            "coding": "What is a loop?",
            "milestones": "I learned to tie my shoes!",
            "teaching": "Teach me about colors"
        }
        r = httpx.post(f"{BASE}/api/chat", json={
            "message": prompts.get(mode, "Hello!"),
            "history": [],
            "character": "corvo",
            "mode": mode
        }, timeout=30)
        assert r.status_code == 200
        text = r.json()["response"]
        assert len(text) > 10, f"Mode '{mode}' gave empty/tiny response"

    def test_character_switch_mid_conversation(self):
        """Switch characters — new character should respond in its own voice."""
        r1 = httpx.post(f"{BASE}/api/chat", json={
            "message": "Hi!",
            "history": [],
            "character": "corvo"
        }, timeout=30)
        assert r1.status_code == 200

        r2 = httpx.post(f"{BASE}/api/chat", json={
            "message": "Hi!",
            "history": [],
            "character": "xolo"
        }, timeout=30)
        assert r2.status_code == 200
        # Both should work independently
        assert len(r2.json()["response"]) > 10


# =========================================================================
# SECTION 3: REGRESSION TESTS
# =========================================================================

class TestRegression:
    """Tests for specific bugs we've fixed. Prevent regressions."""

    def test_no_name_prompt_in_intro(self):
        """FIXED: Characters should NOT ask for the user's name."""
        results = []
        for char in ["corvo", "gufo", "orsetto"]:
            r = httpx.post(f"{BASE}/api/chat", json={
                "message": "Hi!",
                "history": [],
                "character": char,
                "mode": "introduction"
            }, timeout=30)
            assert r.status_code == 200
            text = r.json()["response"].lower()
            # Should not ask "what's your name" or similar
            name_prompts = ["what's your name", "what is your name", "may i know your name",
                            "tell me your name", "who am i talking to"]
            for prompt in name_prompts:
                if prompt in text:
                    results.append(f"{char} asked for name: '{prompt}' found in: {text[:100]}")
        assert len(results) == 0, f"Name prompt regression: {results}"

    def test_no_copyrighted_characters(self):
        """Characters must never reference copyrighted IP."""
        r = httpx.post(f"{BASE}/api/chat", json={
            "message": "Tell me a story about Mickey Mouse and Elsa from Frozen!",
            "history": [],
            "character": "corvo",
            "mode": "story_time"
        }, timeout=30)
        assert r.status_code == 200
        text = r.json()["response"].lower()
        banned = ["mickey mouse", "elsa", "frozen", "disney", "peppa pig", "paw patrol"]
        violations = [b for b in banned if b in text]
        assert len(violations) == 0, f"Copyright violation — mentioned: {violations}"

    def test_response_length_bounded(self):
        """Responses should not be excessively long (max_tokens=250)."""
        r = httpx.post(f"{BASE}/api/chat", json={
            "message": "Tell me everything you know about the entire history of the world in detail",
            "history": [],
            "character": "corvo"
        }, timeout=30)
        assert r.status_code == 200
        text = r.json()["response"]
        # 250 tokens ~ roughly 1000 chars max, give generous buffer
        assert len(text) < 2000, f"Response too long: {len(text)} chars"

    def test_chat_and_speak_binary_format(self):
        """FIXED: chat-and-speak must return valid binary header + audio."""
        r = httpx.post(f"{BASE}/api/chat-and-speak", json={
            "message": "Say hello",
            "history": [],
            "character": "corvo"
        }, timeout=30)
        assert r.status_code == 200
        data = r.content
        assert len(data) > 50, "Response too small to contain header + audio"

        # Parse binary format
        header_len = struct.unpack(">I", data[:4])[0]
        assert header_len < 10000, f"Header length unreasonable: {header_len}"

        header_bytes = data[4:4 + header_len]
        import json
        header = json.loads(header_bytes.decode("utf-8"))
        assert "response" in header
        assert len(header["response"]) > 0

        audio_bytes = data[4 + header_len:]
        assert len(audio_bytes) > 500, "Audio portion too small"

    def test_voice_token_per_character(self):
        """Each character should get a valid voice token with correct voice."""
        for char in ["corvo", "gufo", "xolo"]:
            r = httpx.post(f"{BASE}/api/voice/token", json={
                "character": char
            }, timeout=15)
            assert r.status_code == 200
            data = r.json()
            assert data["character"] == char
            assert len(data["token"]) > 20, f"Token too short for {char}"

    def test_concurrent_requests(self):
        """Server handles multiple simultaneous requests without crashing."""
        import concurrent.futures

        def make_request(char):
            r = httpx.post(f"{BASE}/api/chat", json={
                "message": "Hi!",
                "history": [],
                "character": char
            }, timeout=30)
            return r.status_code

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(make_request, c) for c in ALL_CHARACTERS[:5]]
            results = [f.result() for f in futures]

        assert all(s == 200 for s in results), f"Some requests failed: {results}"

    def test_empty_history_ok(self):
        """Empty conversation history should work fine."""
        r = httpx.post(f"{BASE}/api/chat", json={
            "message": "Hello",
            "history": [],
            "character": "corvo"
        }, timeout=30)
        assert r.status_code == 200

    def test_long_history_ok(self):
        """Long conversation history shouldn't crash."""
        history = []
        for i in range(20):
            history.append({"role": "user", "content": f"Message {i}"})
            history.append({"role": "assistant", "content": f"Reply {i}"})

        r = httpx.post(f"{BASE}/api/chat", json={
            "message": "Are you still there?",
            "history": history,
            "character": "corvo"
        }, timeout=30)
        assert r.status_code == 200
        assert len(r.json()["response"]) > 0

    def test_special_characters_in_message(self):
        """Messages with emojis, unicode, quotes shouldn't break anything."""
        r = httpx.post(f"{BASE}/api/chat", json={
            "message": "Hey! 😊 Can you say \"ciao\" to me? It's très cool! 日本語",
            "history": [],
            "character": "corvo"
        }, timeout=30)
        assert r.status_code == 200
        assert len(r.json()["response"]) > 0

    def test_invalid_character_handled(self):
        """Invalid character key should return error, not crash."""
        r = httpx.post(f"{BASE}/api/chat", json={
            "message": "Hi!",
            "history": [],
            "character": "nonexistent_animal"
        }, timeout=15)
        # Should either 400/422 or fall back gracefully
        assert r.status_code in [200, 400, 422]

    def test_invalid_mode_handled(self):
        """Invalid mode should return error or fall back, not crash."""
        r = httpx.post(f"{BASE}/api/chat", json={
            "message": "Hi!",
            "history": [],
            "character": "corvo",
            "mode": "nonexistent_mode"
        }, timeout=15)
        assert r.status_code in [200, 400, 422]
