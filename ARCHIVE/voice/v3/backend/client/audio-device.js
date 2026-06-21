/* Casa Voice — Phone Audio Device
 *
 * Turns a phone/tablet into the audio endpoint for a Casa Voice session.
 * Connects as device_type=audio, streams mic PCM, plays TTS PCM.
 * Pair with a dashboard at /client/index.html?mode=dashboard&session_id=<same>.
 */

const urlParams = new URLSearchParams(location.search);
const serverHost = urlParams.get("server") || location.host;
const CONFIG = {
    SERVER_URL: "ws://" + serverHost,
    SAMPLE_RATE: 16000,
};

const sessionId = urlParams.get("session_id") || "phone-" + Math.random().toString(36).slice(2, 8);
const deviceId = urlParams.get("device_id") || "phone-audio-" + Math.random().toString(36).slice(2, 6);

let ws = null;
let pingInterval = null;

let audioContext = null;
let mediaStream = null;
let workletNode = null;
let scriptNode = null;
let isRecording = false;

let playContext = null;
let nextPlayTime = 0;
let volume = 1.0;

let sendBuffer = new Int16Array(0);
const SEND_BUFFER_TARGET_MS = 80;

let currentCharacter = "default";

const avatar = document.getElementById("avatar");
const statusText = document.getElementById("status");
const connStatus = document.getElementById("connStatus");
const micLevelFill = document.getElementById("micLevelFill");
const interruptBtn = document.getElementById("interruptBtn");
const sessionInfo = document.getElementById("sessionInfo");

function log(msg) {
    console.log("[Casa Audio Device]", msg);
}

function updateStatus(state) {
    const labels = {
        idle: "Say 'Hello' or 'Wake up'",
        listening: "Listening...",
        processing: "Thinking...",
        speaking: "Speaking...",
        interrupted: "Interrupted!",
        wake_detected: "Wake phrase heard!",
    };
    statusText.textContent = labels[state] || state;
    if (avatar) avatar.className = "avatar " + state;
}

function updateCharacterAvatar() {
    const emojis = { default: "🐻", drago: "🐉", liam: "🎧", jenny: "🎨" };
    if (avatar) avatar.textContent = emojis[currentCharacter] || "🐻";
}

function updateConnectionStatus(connected) {
    if (connStatus) {
        connStatus.textContent = connected ? "Online" : "Offline";
        connStatus.className = connected ? "connected" : "disconnected";
    }
}

function updateMicLevel(pcmData) {
    if (!micLevelFill) return;
    let max = 0;
    for (let i = 0; i < pcmData.length; i++) {
        max = Math.max(max, Math.abs(pcmData[i]));
    }
    const percent = Math.min(100, Math.round((max / 0x7FFF) * 100));
    micLevelFill.style.width = percent + "%";
}

function sendMessage(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

function sendAudio(pcmData) {
    const combined = new Int16Array(sendBuffer.length + pcmData.length);
    combined.set(sendBuffer);
    combined.set(pcmData, sendBuffer.length);
    sendBuffer = combined;

    const frameSize = Math.round((CONFIG.SAMPLE_RATE * SEND_BUFFER_TARGET_MS) / 1000);
    while (sendBuffer.length >= frameSize) {
        const frame = sendBuffer.subarray(0, frameSize);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength));
        }
        sendBuffer = sendBuffer.subarray(frameSize);
    }
}

function flushSendBuffer() {
    if (sendBuffer.length === 0) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(sendBuffer.buffer.slice(sendBuffer.byteOffset, sendBuffer.byteOffset + sendBuffer.byteLength));
    }
    sendBuffer = new Int16Array(0);
}

function handleServerMessage(msg) {
    if (msg.type === "state_change") {
        updateStatus(msg.state);
    } else if (msg.type === "config_change") {
        if (msg.character) {
            currentCharacter = msg.character;
            updateCharacterAvatar();
        }
        if (msg.volume !== undefined) {
            volume = msg.volume;
            if (playContext && playContext.destination) {
                // future: update gain of currently queued nodes
            }
        }
    } else if (msg.type === "interrupt_ack") {
        updateStatus("interrupted");
        stopPlayback();
    } else if (msg.type === "command") {
        if (msg.command === "interrupt" || msg.command === "stop") {
            stopPlayback();
        }
    } else if (msg.type === "pong") {
        // heartbeat
    }
}

function connect() {
    const params = new URLSearchParams(location.search);
    const token = params.get("token") || "dev-token";
    const query = new URLSearchParams();
    query.set("device_type", "audio");
    query.set("device_id", deviceId);
    query.set("session_id", sessionId);
    query.set("token", token);
    const url = CONFIG.SERVER_URL + "/ws/voice-v3/" + encodeURIComponent(deviceId) + "?" + query.toString();

    log("Connecting: " + url);
    ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
        log("WebSocket connected");
        updateConnectionStatus(true);
        startRecording();
        pingInterval = setInterval(() => sendMessage({ type: "ping" }), 20000);
    };

    ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
            playAudio(new Int16Array(event.data));
        } else {
            const msg = JSON.parse(event.data);
            log("← " + JSON.stringify(msg));
            handleServerMessage(msg);
        }
    };

    ws.onclose = (event) => {
        log("WebSocket disconnected (code=" + event.code + ")");
        updateConnectionStatus(false);
        stopRecording();
        stopPlayback();
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }
        setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
        log("WebSocket error: " + err);
    };
}

function getAudioWorkletCode(processorName) {
    return `
class ${processorName} extends AudioWorkletProcessor {
    constructor() {
        super();
        this.targetSampleRate = 16000;
        this.frameSize = 1280;
        this.resampled = new Float32Array(0);
    }
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || input.length === 0 || input[0].length === 0) return true;
        const src = input[0];
        const srcRate = sampleRate;
        const dstRate = this.targetSampleRate;
        const ratio = srcRate / dstRate;
        const outLen = Math.max(0, Math.floor(src.length / ratio));
        if (outLen === 0) return true;

        const newBuf = new Float32Array(this.resampled.length + outLen);
        newBuf.set(this.resampled);
        let writeIdx = this.resampled.length;
        for (let i = 0; i < outLen; i++) {
            const srcIdx = i * ratio;
            const idx0 = Math.floor(srcIdx);
            const idx1 = Math.min(idx0 + 1, src.length - 1);
            const frac = srcIdx - idx0;
            newBuf[writeIdx++] = src[idx0] * (1 - frac) + src[idx1] * frac;
        }
        this.resampled = newBuf;

        while (this.resampled.length >= this.frameSize) {
            const chunk = this.resampled.subarray(0, this.frameSize);
            const pcmData = new Int16Array(this.frameSize);
            let maxVal = 0;
            for (let i = 0; i < this.frameSize; i++) {
                const val = Math.max(-1, Math.min(1, chunk[i]));
                pcmData[i] = Math.round(val * 0x7FFF);
                if (Math.abs(val) > maxVal) maxVal = Math.abs(val);
            }
            this.port.postMessage({ pcm: pcmData.buffer, max: maxVal }, [pcmData.buffer]);
            this.resampled = this.resampled.subarray(this.frameSize);
        }
        return true;
    }
}
registerProcessor("${processorName}", ${processorName});
`;
}

async function startRecording() {
    if (isRecording) return;
    try {
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            }
        };
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        audioContext = new AudioContext({ sampleRate: CONFIG.SAMPLE_RATE });
        await audioContext.resume();

        const input = audioContext.createMediaStreamSource(mediaStream);

        if (audioContext.audioWorklet) {
            try {
                const processorName = "pcm-processor-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
                const blob = new Blob([getAudioWorkletCode(processorName)], { type: "application/javascript" });
                const workletUrl = URL.createObjectURL(blob);
                await audioContext.audioWorklet.addModule(workletUrl);
                workletNode = new AudioWorkletNode(audioContext, processorName);
                workletNode.port.onmessage = (e) => {
                    const pcmData = new Int16Array(e.data.pcm);
                    updateMicLevel(pcmData);
                    sendAudio(pcmData);
                };
                input.connect(workletNode);
                log("AudioWorklet recording started");
            } catch (err) {
                log("AudioWorklet failed, falling back: " + err);
                setupScriptProcessor(input);
            }
        } else {
            setupScriptProcessor(input);
        }
        isRecording = true;
    } catch (err) {
        log("Microphone error: " + err);
        alert("Please allow microphone access on this device.");
    }
}

function setupScriptProcessor(input) {
    const bufferSize = 4096;
    scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
    const srcRate = audioContext.sampleRate;
    const dstRate = CONFIG.SAMPLE_RATE;
    const ratio = srcRate / dstRate;
    const frameSize = Math.round((dstRate * 80) / 1000);
    let resampled = new Float32Array(0);

    scriptNode.onaudioprocess = (e) => {
        const floatData = e.inputBuffer.getChannelData(0);
        const outLen = Math.max(0, Math.floor(floatData.length / ratio));
        if (outLen === 0) return;

        const newBuf = new Float32Array(resampled.length + outLen);
        newBuf.set(resampled);
        let writeIdx = resampled.length;
        for (let i = 0; i < outLen; i++) {
            const srcIdx = i * ratio;
            const idx0 = Math.floor(srcIdx);
            const idx1 = Math.min(idx0 + 1, floatData.length - 1);
            const frac = srcIdx - idx0;
            newBuf[writeIdx++] = floatData[idx0] * (1 - frac) + floatData[idx1] * frac;
        }
        resampled = newBuf;

        while (resampled.length >= frameSize) {
            const chunk = resampled.subarray(0, frameSize);
            const pcmData = new Int16Array(frameSize);
            let maxVal = 0;
            for (let i = 0; i < frameSize; i++) {
                const val = Math.max(-1, Math.min(1, chunk[i]));
                pcmData[i] = Math.round(val * 0x7FFF);
                if (Math.abs(val) > maxVal) maxVal = Math.abs(val);
            }
            updateMicLevel(pcmData);
            sendAudio(pcmData);
            resampled = resampled.subarray(frameSize);
        }
    };

    input.connect(scriptNode);
    scriptNode.connect(audioContext.destination);
    log("ScriptProcessorNode fallback active");
}

function stopRecording() {
    if (!isRecording) return;
    flushSendBuffer();
    if (workletNode) { workletNode.disconnect(); workletNode = null; }
    if (scriptNode) { scriptNode.disconnect(); scriptNode = null; }
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    if (audioContext) { audioContext.close(); audioContext = null; }
    isRecording = false;
}

function playAudio(pcmData) {
    if (!playContext) {
        playContext = new AudioContext({ sampleRate: CONFIG.SAMPLE_RATE });
        nextPlayTime = playContext.currentTime;
    }
    const actualRate = playContext.sampleRate;
    const srcRate = CONFIG.SAMPLE_RATE;

    const srcFloat = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
        srcFloat[i] = pcmData[i] / 0x7FFF;
    }

    let floatData;
    if (actualRate === srcRate) {
        floatData = srcFloat;
    } else {
        const ratio = srcRate / actualRate;
        const outLen = Math.floor(srcFloat.length / ratio);
        floatData = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) {
            const srcIdx = i * ratio;
            const idx0 = Math.floor(srcIdx);
            const idx1 = Math.min(idx0 + 1, srcFloat.length - 1);
            const frac = srcIdx - idx0;
            floatData[i] = srcFloat[idx0] * (1 - frac) + srcFloat[idx1] * frac;
        }
    }

    const buffer = playContext.createBuffer(1, floatData.length, actualRate);
    buffer.getChannelData(0).set(floatData);

    const source = playContext.createBufferSource();
    source.buffer = buffer;
    const gainNode = playContext.createGain();
    gainNode.gain.value = volume;
    source.connect(gainNode);
    gainNode.connect(playContext.destination);

    const duration = buffer.length / actualRate;
    const startTime = Math.max(nextPlayTime, playContext.currentTime);
    source.start(startTime);
    nextPlayTime = startTime + duration;
}

function stopPlayback() {
    if (playContext) {
        playContext.close();
        playContext = null;
    }
    nextPlayTime = 0;
}

function triggerInterrupt() {
    sendMessage({ type: "command", command: "interrupt" });
    stopPlayback();
}

if (interruptBtn) {
    interruptBtn.addEventListener("click", triggerInterrupt);
}

if (avatar) {
    avatar.addEventListener("click", triggerInterrupt);
}

// ── Physical input handlers ───────────────────────────────────────────────────

function cycleCharacter(direction) {
    const chars = ["default", "drago", "liam", "jenny"];
    const idx = chars.indexOf(currentCharacter);
    const next = chars[(idx + direction + chars.length) % chars.length];
    sendMessage({ type: "config_change", character: next });
}

function sendCommand(command) {
    sendMessage({ type: "command", command: command });
}

// Keyboard fallback for testing without NFC/BT hardware
document.addEventListener("keydown", (e) => {
    switch (e.code) {
        case "Space":
            e.preventDefault();
            triggerInterrupt();
            break;
        case "ArrowRight":
            e.preventDefault();
            cycleCharacter(1);
            break;
        case "ArrowLeft":
            e.preventDefault();
            cycleCharacter(-1);
            break;
        case "ArrowUp":
            e.preventDefault();
            sendCommand("volume_up");
            break;
        case "ArrowDown":
            e.preventDefault();
            sendCommand("volume_down");
            break;
        case "KeyR":
            e.preventDefault();
            sendCommand("reset");
            break;
        case "KeyW":
            e.preventDefault();
            sendCommand("wake");
            break;
    }
});

// Media Session API: handles Bluetooth media buttons on phones
function setupMediaSession() {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", () => {
        log("MediaSession: play -> wake");
        sendCommand("wake");
    });
    navigator.mediaSession.setActionHandler("pause", () => {
        log("MediaSession: pause -> interrupt");
        triggerInterrupt();
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => {
        log("MediaSession: nexttrack -> next character");
        cycleCharacter(1);
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => {
        log("MediaSession: previoustrack -> previous character");
        cycleCharacter(-1);
    });
    navigator.mediaSession.setActionHandler("seekforward", () => {
        log("MediaSession: seekforward -> volume_up");
        sendCommand("volume_up");
    });
    navigator.mediaSession.setActionHandler("seekbackward", () => {
        log("MediaSession: seekbackward -> volume_down");
        sendCommand("volume_down");
    });

    navigator.mediaSession.metadata = new MediaMetadata({
        title: "Casa Voice",
        artist: "Audio Device",
        artwork: []
    });
    log("MediaSession handlers registered");
}

// ── Screen wake lock: keeps the phone awake while acting as the audio device ──

let wakeLock = null;

async function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
        wakeLock = await navigator.wakeLock.request("screen");
        log("Screen wake lock active");
        wakeLock.addEventListener("release", () => {
            log("Screen wake lock released");
        });
    } catch (err) {
        log("Wake lock request failed: " + err);
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
}

// Resume audio contexts when the tab becomes visible again.
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        releaseWakeLock();
    } else {
        requestWakeLock();
        if (audioContext && audioContext.state === "suspended") {
            audioContext.resume().catch(() => {});
        }
        if (playContext && playContext.state === "suspended") {
            playContext.resume().catch(() => {});
        }
    }
});

// Web NFC API: read URLs from NFC tags (Android Chrome)
async function setupNFC() {
    if (!("NDEFReader" in window)) {
        log("Web NFC not available on this device");
        return;
    }
    try {
        const ndef = new NDEFReader();
        await ndef.scan();
        log("NFC scan started");

        ndef.addEventListener("reading", (event) => {
            log("NFC tag read: " + JSON.stringify(event.message));
            for (const record of event.message.records) {
                if (record.recordType === "url" || record.recordType === "text") {
                    const text = record.data ? new TextDecoder().decode(record.data) : "";
                    handleTagUrl(text);
                }
            }
        });
    } catch (err) {
        log("NFC setup failed: " + err);
    }
}

function handleTagUrl(text) {
    log("NFC URL/text: " + text);
    try {
        const url = new URL(text);
        const params = url.searchParams;
        const action = params.get("action");
        const tagSession = params.get("session_id");

        // Only react if tag targets this session or no session specified
        if (tagSession && tagSession !== sessionId) {
            log("NFC tag for different session: " + tagSession);
            return;
        }

        if (!action) {
            log("NFC tag missing action");
            return;
        }

        if (action === "character") {
            const character = params.get("character") || "default";
            sendMessage({ type: "config_change", character: character });
        } else if (action === "mode") {
            const mode = params.get("mode") || "default";
            sendMessage({ type: "config_change", mode: mode });
        } else if (action === "interrupt") {
            triggerInterrupt();
        } else if (action === "reset") {
            sendCommand("reset");
        } else if (action === "volume_up") {
            sendCommand("volume_up");
        } else if (action === "volume_down") {
            sendCommand("volume_down");
        } else if (action === "scene") {
            const scene = params.get("scene") || "greeting";
            sendCommand("scene_" + scene);
        } else if (action === "wake") {
            sendCommand("wake");
        }
    } catch (e) {
        log("Failed to parse NFC tag: " + e);
    }
}

const startOverlay = document.getElementById("startOverlay");
const startBtn = document.getElementById("startBtn");
const startSessionId = document.getElementById("startSessionId");

function init() {
    sessionInfo.textContent = "Session: " + sessionId;
    if (startSessionId) startSessionId.textContent = sessionId;
    updateCharacterAvatar();
    setupMediaSession();
    setupNFC();

    if (startBtn) {
        startBtn.addEventListener("click", async () => {
            if (startOverlay) startOverlay.classList.add("hidden");
            await requestWakeLock();
            connect();
        });
    } else {
        // Fallback: auto-connect if no overlay (older browsers / tests).
        connect();
    }
}

init();
