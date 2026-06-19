/* Casa Voice PWA Client — Web Audio API + WebSocket
 *
 * Handles:
 * - Web Audio API recording (16kHz PCM) via ScriptProcessorNode
 * - Web Audio API playback (16kHz PCM) via AudioBufferSourceNode
 * - WebSocket connection to voice server
 * - Barge-in detection (tap to interrupt)
 * - Character/mode switching
 * - Volume control
 * - State visualization (idle, listening, thinking, speaking)
 */

// ── Configuration ───────────────────────────────────────────────────────────

const CONFIG = {
    SERVER_URL: "ws://" + location.host,
    DEVICE_ID: "pwa-" + Math.random().toString(36).substring(2, 8),
    API_KEY: "demo-key",
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
const transcriptEl = document.getElementById("transcript");
const debugLog = document.getElementById("debugLog");
const micSelect = document.getElementById("micSelect");
const volumeFill = document.getElementById("volumeFill");

let selectedDeviceId = "";
let analyser = null;

// ── Logging ─────────────────────────────────────────────────────────────────

function log(msg) {
    console.log("[Casa]", msg);
    if (!debugLog) return;
    const div = document.createElement("div");
    div.textContent = new Date().toLocaleTimeString() + " " + msg;
    debugLog.appendChild(div);
    debugLog.scrollTop = debugLog.scrollHeight;
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connect() {
    const url = CONFIG.SERVER_URL + "/ws/voice/" + CONFIG.DEVICE_ID + "?token=" + CONFIG.API_KEY;
    ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
        log("WebSocket connected");
        updateConnectionStatus(true);
    };

    ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
            const pcmData = new Int16Array(event.data);
            playAudio(pcmData);
        } else {
            const msg = JSON.parse(event.data);
            handleServerMessage(msg);
        }
    };

    ws.onclose = () => {
        log("WebSocket disconnected");
        updateConnectionStatus(false);
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
    } else if (msg.type === "wake_detected") {
        updateStatus("Wake: " + msg.phrase);
        updateAvatarState("wake_detected");
    } else if (msg.type === "interrupt_ack") {
        updateStatus("Interrupted!");
        stopPlayback();
    } else if (msg.type === "end_turn_ack") {
        updateStatus("Processing...");
    } else if (msg.type === "transcript") {
        if (transcriptEl) transcriptEl.textContent = msg.text;
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

}// ── Mic Device Enumeration & Volume Meter ──────────────────────────────────

async function enumerateDevices() {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        if (!micSelect) return;
        micSelect.innerHTML = '<option value="">Default microphone</option>';
        audioInputs.forEach((device, i) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || ('Mic ' + (i + 1));
            if (device.label.toLowerCase().includes('usb')) option.textContent += ' [USB]';
            micSelect.appendChild(option);
        });
        micSelect.addEventListener('change', (e) => {
            selectedDeviceId = e.target.value;
            log('Selected mic: ' + e.target.options[e.target.selectedIndex].textContent);
            if (isRecording) { stopRecording(); startRecording(); }
        });
        log('Found ' + audioInputs.length + ' mic(s)');
    } catch (err) {
        log('Device error: ' + err.message);
    }
}

function updateVolumeMeter() {
    if (!isRecording || !analyser || !volumeFill) return;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    volumeFill.style.width = (avg / 255 * 100) + '%';
    requestAnimationFrame(updateVolumeMeter);
}

// ── Audio Recording (16kHz PCM) ────────────────────────────────────────────

async function startRecording() {
    if (isRecording) return;
    try {
        audioContext = new AudioContext({ sampleRate: CONFIG.SAMPLE_RATE });
        await audioContext.resume();
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: CONFIG.SAMPLE_RATE,
            }
        };
        if (selectedDeviceId) constraints.audio.deviceId = { exact: selectedDeviceId };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        log('Using mic: ' + mediaStream.getAudioTracks()[0].label);
        const input = audioContext.createMediaStreamSource(mediaStream);
        processor = audioContext.createScriptProcessor(CONFIG.CHUNK_SIZE, 1, 1);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        processor.onaudioprocess = (e) => {
            const floatData = e.inputBuffer.getChannelData(0);
            const hasData = floatData.some(v => v !== 0);
            if (!hasData) return;
            const pcmData = new Int16Array(floatData.length);
            for (let i = 0; i < floatData.length; i++) {
                pcmData[i] = Math.max(-32768, Math.min(32767, floatData[i] * 0x7FFF));
            }
            sendAudio(pcmData);
        };
        input.connect(analyser);
        analyser.connect(processor);
        processor.connect(audioContext.destination);
        isRecording = true;
        if (talkBtn) talkBtn.classList.add('recording');
        updateStatus('Mic ON — say "Hello" or "Wake up"');
        updateAvatarState('listening');
        log('Recording started (context: ' + audioContext.state + ')');
        updateVolumeMeter();
    } catch (err) {
        log('Mic error: ' + err.name + ' — ' + err.message);
        alert('Please allow microphone access to talk to the companion.');
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
    if (analyser) {
        analyser = null;
    }
    if (volumeFill) {
        volumeFill.style.width = '0%';
    }

    isRecording = false;
    if (talkBtn) talkBtn.classList.remove("recording");
    updateStatus("Click 🎤 to start mic | Say 'Hello' to wake");
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
    if (avatar) avatar.className = "avatar " + state;

    const emojis = {
        orsetto: "🐻",
        coniglio: "🐰",
        drago: "🐉",
        liam: "🎧",
        jenny: "🎨",
    };
    if (avatar) avatar.textContent = emojis[currentCharacter] || "🐻";
}

function updateStatus(text) {
    if (statusText) statusText.textContent = text;
}

function updateCharacterAvatar() {
    const emojis = {
        orsetto: "🐻",
        coniglio: "🐰",
        drago: "🐉",
        liam: "🎧",
        jenny: "🎨",
    };
    if (avatar) avatar.textContent = emojis[currentCharacter] || "🐻";
}

function updateConnectionStatus(connected) {
    if (connStatus) {
        connStatus.textContent = connected ? "Online" : "Offline";
        connStatus.className = "connection-status " + (connected ? "connected" : "disconnected");
    }
}

function updateVolumeUI() {
    if (volumeSlider) volumeSlider.value = volume * 100;
    if (volumeValue) volumeValue.textContent = Math.round(volume * 100) + "%";
}

// ── Event Handlers ──────────────────────────────────────────────────────────

if (talkBtn) {
    talkBtn.addEventListener("click", () => {
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    });
}

// Keyboard shortcuts
// Space = toggle mic, R = reset
document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
        e.preventDefault();
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    }
    if (e.code === "KeyR") { sendMessage({ type: "command", command: "reset" }); }
});

// ── PWA Service Worker ──────────────────────────────────────────────────────

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/client/service-worker.js")
        .then(() => log("Service Worker registered"))
        .catch(err => log("SW registration failed: " + err));
}

// ── Init ────────────────────────────────────────────────────────────────────

enumerateDevices();
connect();
log("Casa PWA initialized. Device ID: " + CONFIG.DEVICE_ID);
