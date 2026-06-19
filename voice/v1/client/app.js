"""Casa Voice PWA Client — Web Audio API + WebSocket

Handles:
- Web Audio API recording (16kHz PCM) via ScriptProcessorNode
- Web Audio API playback (16kHz PCM) via AudioBufferSourceNode
- WebSocket connection to voice server
- Barge-in detection (tap to interrupt)
- Character/mode switching
- Volume control
- State visualization (idle, listening, thinking, speaking)
"""

// ── Configuration ───────────────────────────────────────────────────────────

const CONFIG = {
    SERVER_URL: "wss://casa-voice.fly.dev",  // Change to your server
    DEVICE_ID: "pwa-" + Math.random().toString(36).substring(2, 8),
    API_KEY: "demo-key",  // Set real key for production
    SAMPLE_RATE: 16000,
    CHUNK_SIZE: 512,  // 32ms at 16kHz
};

// ── State ────────────────────────────────────────────────────────────────────

let ws = null;
let audioContext = null;
let mediaStream = null;
let processor = null;
let source = null;
let isRecording = false;
let isPlaying = false;
let audioQueue = [];
let playState = "idle";
let currentCharacter = "orsetto";
let currentMode = "default";
let volume = 0.8;

// ── DOM Elements ────────────────────────────────────────────────────────────

const avatar = document.getElementById("avatar");
const statusText = document.getElementById("status");
const talkBtn = document.getElementById("talkBtn");
const connStatus = document.getElementById("connStatus");
const volumeSlider = document.getElementById("volumeSlider");
const volumeValue = document.getElementById("volumeValue");
const debugLog = document.getElementById("debugLog");

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
    console.log("[Casa]", msg);
    const div = document.createElement("div");
    div.textContent = `${new Date().toLocaleTimeString()} ${msg}`;
    debugLog.appendChild(div);
    debugLog.scrollTop = debugLog.scrollHeight;
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connect() {
    const url = `${CONFIG.SERVER_URL}/ws/voice/${CONFIG.DEVICE_ID}?token=${CONFIG.API_KEY}`;
    ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
        log("WebSocket connected");
        updateConnectionStatus(true);
    };

    ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
            // Binary audio frame
            const pcmData = new Int16Array(event.data);
            playAudio(pcmData);
        } else {
            // Text control message
            const msg = JSON.parse(event.data);
            handleServerMessage(msg);
        }
    };

    ws.onclose = () => {
        log("WebSocket disconnected");
        updateConnectionStatus(false);
        // Auto-reconnect after 2s
        setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
        log("WebSocket error: " + err);
    };
}

function handleServerMessage(msg) {
    log("← " + JSON.stringify(msg));

    if (msg.type === "state_change") {
        updateAvatarState(msg.state);
        updateStatus(msg.state);
    } else if (msg.type === "command") {
        if (msg.command === "interrupt") {
            stopPlayback();
            updateAvatarState("listening");
        } else if (msg.command === "stop") {
            stopPlayback();
            updateAvatarState("idle");
        } else if (msg.command === "volume_up") {
            volume = Math.min(1, volume + 0.1);
            updateVolumeUI();
        } else if (msg.command === "volume_down") {
            volume = Math.max(0, volume - 0.1);
            updateVolumeUI();
        } else if (msg.command === "sleep" || msg.command === "timeout" || msg.command === "kill") {
            stopPlayback();
            stopRecording();
            updateAvatarState("idle");
            updateStatus("Goodnight...");
        }
    } else if (msg.type === "mode_changed") {
        if (msg.character) currentCharacter = msg.character;
        if (msg.mode) currentMode = msg.mode;
        updateCharacterAvatar();
    } else if (msg.type === "error") {
        log("Error: " + msg.code + " — " + msg.message);
    }
}

function sendMessage(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        log("→ " + JSON.stringify(msg));
        ws.send(JSON.stringify(msg));
    }
}

function sendAudio(pcmData) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(pcmData.buffer);
    }
}

// ── Audio Recording (16kHz PCM) ────────────────────────────────────────────

async function startRecording() {
    if (isRecording) return;

    try {
        audioContext = new AudioContext({ sampleRate: CONFIG.SAMPLE_RATE });
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: CONFIG.SAMPLE_RATE,
            }
        });

        const input = audioContext.createMediaStreamSource(mediaStream);
        processor = audioContext.createScriptProcessor(CONFIG.CHUNK_SIZE, 1, 1);

        processor.onaudioprocess = (e) => {
            const floatData = e.inputBuffer.getChannelData(0);
            const pcmData = new Int16Array(floatData.length);
            for (let i = 0; i < floatData.length; i++) {
                pcmData[i] = Math.max(-1, Math.min(1, floatData[i])) * 0x7FFF;
            }
            sendAudio(pcmData);
        };

        input.connect(processor);
        processor.connect(audioContext.destination);

        isRecording = true;
        talkBtn.classList.add("recording");
        updateStatus("Listening...");
        updateAvatarState("listening");
        log("Recording started");

    } catch (err) {
        log("Microphone error: " + err);
        alert("Please allow microphone access to talk to the companion.");
    }
}

function stopRecording() {
    if (!isRecording) return;

    if (processor) {
        processor.disconnect();
        processor = null;
    }
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }

    isRecording = false;
    talkBtn.classList.remove("recording");
    updateStatus("Tap to talk");
    updateAvatarState("idle");
    log("Recording stopped");
}

// ── Audio Playback (16kHz PCM) ─────────────────────────────────────────────

let playContext = null;
let nextPlayTime = 0;

function playAudio(pcmData) {
    if (!playContext) {
        playContext = new AudioContext({ sampleRate: CONFIG.SAMPLE_RATE });
        nextPlayTime = playContext.currentTime;
    }

    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / 0x7FFF;
    }

    const buffer = playContext.createBuffer(1, floatData.length, CONFIG.SAMPLE_RATE);
    buffer.getChannelData(0).set(floatData);

    const source = playContext.createBufferSource();
    source.buffer = buffer;

    const gainNode = playContext.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(playContext.destination);

    const duration = buffer.length / CONFIG.SAMPLE_RATE;
    const startTime = Math.max(nextPlayTime, playContext.currentTime);
    source.start(startTime);
    nextPlayTime = startTime + duration;

    isPlaying = true;
}

function stopPlayback() {
    if (playContext) {
        playContext.close();
        playContext = null;
    }
    nextPlayTime = 0;
    isPlaying = false;
}

// ── UI Updates ──────────────────────────────────────────────────────────────

function updateAvatarState(state) {
    playState = state;
    avatar.className = "avatar " + state;

    const emojis = {
        orsetto: "🐻",
        coniglio: "🐰",
        drago: "🐉",
    };
    avatar.textContent = emojis[currentCharacter] || "🐻";
}

function updateStatus(text) {
    statusText.textContent = text;
}

function updateCharacterAvatar() {
    const emojis = {
        orsetto: "🐻",
        coniglio: "🐰",
        drago: "🐉",
    };
    avatar.textContent = emojis[currentCharacter] || "🐻";
}

function updateConnectionStatus(connected) {
    connStatus.textContent = connected ? "Online" : "Offline";
    connStatus.className = "connection-status " + (connected ? "connected" : "disconnected");
}

function updateVolumeUI() {
    volumeSlider.value = volume * 100;
    volumeValue.textContent = Math.round(volume * 100) + "%";
}

// ── Event Handlers ──────────────────────────────────────────────────────────

// Talk button: hold to talk, release to stop
talkBtn.addEventListener("mousedown", startRecording);
talkBtn.addEventListener("mouseup", stopRecording);
talkBtn.addEventListener("mouseleave", stopRecording);
talkBtn.addEventListener("touchstart", (e) => { e.preventDefault(); startRecording(); });
talkBtn.addEventListener("touchend", (e) => { e.preventDefault(); stopRecording(); });

// Character selection
document.querySelectorAll(".char-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".char-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentCharacter = btn.dataset.character;
        sendMessage({ type: "medallion", character_key: currentCharacter, mode_key: currentMode });
    });
});

// Mode selection
document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        currentMode = btn.dataset.mode;
        sendMessage({ type: "medallion", character_key: currentCharacter, mode_key: currentMode });
    });
});

// Volume
volumeSlider.addEventListener("input", (e) => {
    volume = e.target.value / 100;
    volumeValue.textContent = e.target.value + "%";
});

// Avatar click = barge-in
avatar.addEventListener("click", () => {
    if (playState === "speaking") {
        sendMessage({ type: "barge_in" });
        stopPlayback();
        updateAvatarState("listening");
        log("Barge-in triggered");
    }
});

// ── PWA Service Worker ──────────────────────────────────────────────────────

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/client/service-worker.js")
        .then(() => log("Service Worker registered"))
        .catch(err => log("SW registration failed: " + err));
}

// ── Init ────────────────────────────────────────────────────────────────────

connect();
log("Casa PWA initialized. Device ID: " + CONFIG.DEVICE_ID);
