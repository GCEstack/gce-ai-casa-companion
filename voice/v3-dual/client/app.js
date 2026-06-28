/* Casa Voice PWA — Dual Mode (Browser Audio + Dashboard)
 *
 * Modes:
 *   - Browser Audio: this browser is the audio device (mic + speaker).
 *   - External Device: this browser is a dashboard only; ESP32 handles audio.
 *
 * Browser Audio behavior:
 *   - Default is push-to-talk to avoid background noise (toggle to always-listen).
 *   - Hold the mic button to talk; release to send.
 *   - Wake phrase "Porcupine" triggers LISTENING when always-listen is on.
 *   - Click Wake to force one listening turn.
 *   - Space / avatar click / interrupt button = interrupt TTS.
 *   - R = reset session.
 *
 * Dashboard behavior:
 *   - No getUserMedia, no AudioContext.
 *   - Shows device connection status and real-time transcript.
 *   - Character/mode controls still work and update the shared session.
 *   - Interrupt button sends interrupt command to audio device.
 */

const CONFIG = {
    SERVER_URL: (location.protocol === "https:" ? "wss://" : "ws://") + location.host,
    SAMPLE_RATE: 16000,
    CHUNK_SIZE: 512,
};

// Application state
let ws = null;
let clientMode = "browser"; // "browser" | "dashboard"
let sessionId = null;
let deviceId = null;
let pingInterval = null;
let reconnectTimeout = null;
let reconnectDelayMs = 2000;
const RECONNECT_DELAY_MAX_MS = 30000;

// Browser-mode audio state
let audioContext = null;
let mediaStream = null;
let workletNode = null;
let scriptNode = null;
let isRecording = false;
let pushToTalkActive = false;
let autoListenEnabled = false; // default push-to-talk to avoid background noise
let playContext = null;
let nextPlayTime = 0;
let volume = 0.8;
let audioChunksSent = 0;

// Web Bluetooth state (Path 1)
const BT = {
    SERVICE_UUID: "0000casa-0000-1000-8000-00805f9b34fb",
    AUDIO_CHAR_UUID: "0000casa-0001-1000-8000-00805f9b34fb",
    CMD_CHAR_UUID: "0000casa-0002-1000-8000-00805f9b34fb",
    device: null,
    server: null,
    service: null,
    audioChar: null,
    cmdChar: null,
    connected: false,
};

// Buffer small AudioWorklet chunks into larger WebSocket frames
let sendBuffer = new Int16Array(0);
let sendBufferTimer = null;
const SEND_BUFFER_TARGET_MS = 80; // ~80ms of audio per WebSocket frame

// UI state
let playState = "idle";
let currentCharacter = "default";
let currentMode = "default";

// DOM refs
const avatar = document.getElementById("avatar");
const statusText = document.getElementById("status");
const deviceStatusText = document.getElementById("deviceStatus");
const talkBtn = document.getElementById("talkBtn");
const interruptBtn = document.getElementById("interruptBtn");
const connStatus = document.getElementById("connStatus");
const volumeControl = document.getElementById("volumeControl");
const volumeSlider = document.getElementById("volumeSlider");
const volumeValue = document.getElementById("volumeValue");
const micLevelContainer = document.getElementById("micLevelContainer");
const micLevelFill = document.getElementById("micLevelFill");
const micLevelValue = document.getElementById("micLevelValue");
const micSelectorContainer = document.getElementById("micSelectorContainer");
const micSelect = document.getElementById("micSelect");
const refreshMicsBtn = document.getElementById("refreshMicsBtn");
const btControls = document.getElementById("btControls");
const btConnectBtn = document.getElementById("btConnectBtn");
const btDisconnectBtn = document.getElementById("btDisconnectBtn");
const btStatus = document.getElementById("btStatus");
const debugLog = document.getElementById("debugLog");
const browserHint = document.getElementById("browserHint");
const dashboardHint = document.getElementById("dashboardHint");
const actionPanel = document.getElementById("actionPanel");
const autoListenRow = document.getElementById("autoListenRow");
const autoListenToggle = document.getElementById("autoListenToggle");
const lastActionText = document.getElementById("lastAction");
const conversationEl = document.getElementById("conversation");

function log(msg) {
    console.log("[Casa]", msg);
    if (!debugLog) return;
    const div = document.createElement("div");
    div.textContent = new Date().toLocaleTimeString() + " " + msg;
    debugLog.appendChild(div);
    debugLog.scrollTop = debugLog.scrollHeight;
}

// ── Mode switching ────────────────────────────────────────────────────────────

function setClientMode(mode) {
    clientMode = mode;
    log("Switched to mode: " + mode);

    document.querySelectorAll(".mode-option").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.clientMode === mode);
    });

    if (mode === "browser") {
        browserHint.style.display = "block";
        dashboardHint.style.display = "none";
        volumeControl.style.display = "flex";
        talkBtn.style.display = "flex";
        micSelectorContainer.classList.add("visible");
        autoListenRow.classList.add("visible");
        btControls.classList.remove("visible");
        interruptBtn.classList.remove("visible");
        actionPanel.classList.add("visible");
        deviceStatusText.textContent = "";
        updateBrowserStatus();
    } else if (mode === "bluetooth") {
        browserHint.style.display = "none";
        dashboardHint.style.display = "none";
        volumeControl.style.display = "flex";
        talkBtn.style.display = "none";
        micSelectorContainer.classList.remove("visible");
        btControls.classList.add("visible");
        interruptBtn.classList.remove("visible");
        deviceStatusText.textContent = "";
        statusText.textContent = "Connect a Bluetooth audio device";
        stopRecording();
    } else {
        browserHint.style.display = "none";
        dashboardHint.style.display = "block";
        volumeControl.style.display = "none";
        talkBtn.style.display = "none";
        micSelectorContainer.classList.remove("visible");
        btControls.classList.remove("visible");
        interruptBtn.classList.add("visible");
        actionPanel.classList.add("visible");
        deviceStatusText.textContent = "Waiting for device...";
        statusText.textContent = "Dashboard mode";
        stopRecording();
        stopPlayback();
    }

    connect();

    // If already connected and we just switched to browser mode, start recording only
    // when always-listening is enabled; otherwise push-to-talk controls it.
    if (mode === "browser" && ws && ws.readyState === WebSocket.OPEN && autoListenEnabled) {
        startRecording();
    }
}

document.querySelectorAll(".mode-option").forEach(btn => {
    btn.addEventListener("click", () => setClientMode(btn.dataset.clientMode));
});

// ── WebSocket ─────────────────────────────────────────────────────────────────

function buildWsUrl() {
    const params = new URLSearchParams();
    params.set("device_type", (clientMode === "browser" || clientMode === "bluetooth") ? "audio" : "dashboard");
    if (sessionId) params.set("session_id", sessionId);
    if (deviceId) params.set("device_id", deviceId);
    return CONFIG.SERVER_URL + "/ws/voice?" + params.toString();
}

function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }

    const url = buildWsUrl();
    log("Connecting: " + url);
    ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
        log("WebSocket connected");
        updateConnectionStatus(true);
        // Reset reconnect backoff on successful connection.
        reconnectDelayMs = 2000;
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
        }
        if (clientMode === "browser" && autoListenEnabled) {
            startRecording();
        }
        // Keep-alive ping every 20 seconds to prevent idle timeouts
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
            sendMessage({ type: "ping" });
        }, 20000);
    };

    ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
            if (clientMode !== "browser") return; // Dashboard does not receive audio
            const pcmData = new Int16Array(event.data);
            playAudio(pcmData);
        } else {
            const msg = JSON.parse(event.data);
            log("← " + JSON.stringify(msg));
            handleServerMessage(msg);
        }
    };

    ws.onclose = (event) => {
        log("WebSocket disconnected (code=" + event.code + ", reason=" + event.reason + ")");
        updateConnectionStatus(false);
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = null;
        }
        if (clientMode === "browser") {
            stopRecording();
        }
        // Exponential backoff reconnect: 2s, 4s, 8s ... capped at 30s.
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
            reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_DELAY_MAX_MS);
            connect();
        }, reconnectDelayMs);
    };

    ws.onerror = (err) => {
        log("WebSocket error: " + err);
    };
}

// Auto-restart recording in browser mode after a manual stop
let _recordingRestartTimer = null;

function scheduleRecordingRestart() {
    if (clientMode !== "browser") return;
    if (!autoListenEnabled) return;
    if (_recordingRestartTimer) clearTimeout(_recordingRestartTimer);
    _recordingRestartTimer = setTimeout(() => {
        if (ws && ws.readyState === WebSocket.OPEN && !isRecording) {
            startRecording(micSelect ? micSelect.value : undefined);
        }
    }, 500);
}

function handleServerMessage(msg) {
    if (msg.type === "state_change") {
        playState = msg.state;
        updateAvatarState(msg.state);
        updateStatusText(msg.state);
        // In push-to-talk mode, stop the mic when the server goes idle so we don't
        // keep streaming background noise while waiting for the next button press.
        if (msg.state === "idle" && clientMode === "browser" && !autoListenEnabled && !pushToTalkActive) {
            stopRecording();
        }
    } else if (msg.type === "config_change") {
        if (msg.character) currentCharacter = msg.character;
        if (msg.mode) currentMode = msg.mode;
        if (msg.volume !== undefined) {
            volume = msg.volume;
            updateVolumeUI();
        }
        updateCharacterButtons();
        updateModeButtons();
        updateCharacterAvatar();
    } else if (msg.type === "command") {
        if (msg.command === "interrupt") {
            stopPlayback();
        } else if (msg.command === "stop") {
            stopPlayback();
        } else if (msg.command === "louder") {
            if (clientMode === "browser") {
                volume = Math.min(1, volume + 0.1);
                updateVolumeUI();
            }
        } else if (msg.command === "softer") {
            if (clientMode === "browser") {
                volume = Math.max(0, volume - 0.1);
                updateVolumeUI();
            }
        }
    } else if (msg.type === "error") {
        log("Error: " + msg.code + " — " + msg.message);
    } else if (msg.type === "wake_detected") {
        updateStatusText("wake_detected");
        playTone(880, 0.15);
    } else if (msg.type === "interrupt_ack") {
        updateStatusText("interrupted");
        stopPlayback();
    } else if (msg.type === "transcript") {
        updateTranscript(msg.text);
        addConversationMessage("user", msg.text);
    } else if (msg.type === "assistant_text") {
        addConversationMessage("assistant", msg.text);
    } else if (msg.type === "device_connected") {
        if (clientMode === "dashboard") {
            deviceStatusText.textContent = "Device connected: " + msg.device_id;
            log("Device connected: " + msg.device_id + " (" + msg.device_type + ")");
        }
    } else if (msg.type === "device_disconnected") {
        if (clientMode === "dashboard") {
            deviceStatusText.textContent = "Waiting for device...";
            log("Device disconnected: " + msg.device_id);
        }
    } else if (msg.type === "pong") {
        // heartbeat ack
    }
}

function sendMessage(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
    }
}

function sendAudio(pcmData) {
    // Accumulate small chunks into ~80ms frames, then send.
    const combined = new Int16Array(sendBuffer.length + pcmData.length);
    combined.set(sendBuffer);
    combined.set(pcmData, sendBuffer.length);
    sendBuffer = combined;

    const frameSize = Math.round((CONFIG.SAMPLE_RATE * SEND_BUFFER_TARGET_MS) / 1000); // 1280 @ 16k
    while (sendBuffer.length >= frameSize) {
        const frame = sendBuffer.subarray(0, frameSize);
        if (ws && ws.readyState === WebSocket.OPEN) {
            audioChunksSent++;
            // Send ONLY the valid bytes, not the whole backing ArrayBuffer.
            ws.send(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength));
        }
        sendBuffer = sendBuffer.subarray(frameSize);
    }
}

function flushSendBuffer() {
    sendBufferTimer = null;
    if (sendBuffer.length === 0) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
        audioChunksSent++;
        ws.send(sendBuffer.buffer.slice(sendBuffer.byteOffset, sendBuffer.byteOffset + sendBuffer.byteLength));
    }
    sendBuffer = new Int16Array(0);
}

function updateStatusText(state) {
    const labels = {
        idle: autoListenEnabled
            ? "Say 'Porcupine' to wake, or hold 🎤"
            : "Hold 🎤 to talk, or click Wake",
        listening: "Listening... speak now",
        processing: "Thinking...",
        speaking: "Speaking... click avatar to interrupt",
        interrupted: "Interrupted!",
        wake_detected: "Wake phrase heard!",
    };
    if (statusText && clientMode === "browser") {
        statusText.textContent = labels[state] || state;
    }
}

function updateBrowserStatus() {
    if (clientMode !== "browser") return;
    if (autoListenToggle) autoListenToggle.checked = autoListenEnabled;
    browserHint.textContent = autoListenEnabled
        ? 'Say "Porcupine" to wake &nbsp;|&nbsp; Hold 🎤 to talk &nbsp;|&nbsp; Click Wake to bypass &nbsp;|&nbsp; Space / avatar = interrupt &nbsp;|&nbsp; R = reset'
        : 'Hold 🎤 to talk &nbsp;|&nbsp; Click Wake to listen once &nbsp;|&nbsp; Space / avatar = interrupt &nbsp;|&nbsp; R = reset';
    updateStatusText(playState);
}

function updateTranscript(text) {
    const el = document.getElementById("transcript");
    if (el) el.textContent = text;
}

function addConversationMessage(role, text) {
    if (!conversationEl) return;
    const msg = document.createElement("div");
    msg.className = "msg " + role;
    const meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.textContent = role === "user" ? "You" : "Casa";
    const body = document.createElement("div");
    body.textContent = text;
    msg.appendChild(meta);
    msg.appendChild(body);
    conversationEl.appendChild(msg);
    conversationEl.scrollTop = conversationEl.scrollHeight;

    // Keep the log from growing forever.
    while (conversationEl.children.length > 40) {
        conversationEl.removeChild(conversationEl.firstChild);
    }
}

// ── Browser Audio: AudioWorklet Recording ─────────────────────────────────────

function getAudioWorkletCode(processorName) {
    return `
class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.targetSampleRate = 16000;
        this.frameSize = 1280;                 // 80ms @ 16k
        this.resampled = new Float32Array(0);  // pending resampled float samples
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || input.length === 0 || input[0].length === 0) return true;
        const src = input[0];
        const srcRate = sampleRate;            // actual AudioContext rate in the worklet
        const dstRate = this.targetSampleRate;

        // --- Resample from srcRate to 16000 using linear interpolation ---
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

        // --- Emit fixed 80ms Int16 frames ---
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
registerProcessor("${processorName}", PCMProcessor);
`;
}

async function toggleRecording() {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

async function enumerateMics() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            log("mediaDevices.enumerateDevices not supported");
            return;
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === "audioinput");
        const current = micSelect.value;
        micSelect.innerHTML = "";
        mics.forEach((mic, idx) => {
            const opt = document.createElement("option");
            opt.value = mic.deviceId;
            opt.textContent = mic.label || `Microphone ${idx + 1}`;
            micSelect.appendChild(opt);
        });
        // Restore previous selection if still available
        if (current && Array.from(micSelect.options).some(o => o.value === current)) {
            micSelect.value = current;
        }
        log(`Found ${mics.length} microphone(s)`);
    } catch (err) {
        log("Failed to enumerate microphones: " + err);
    }
}

async function restartRecordingWithMic(deviceId) {
    if (!isRecording) return;
    log("Switching to mic: " + deviceId.slice(0, 8) + "...");
    stopRecording();
    await startRecording(deviceId);
}

// ── Web Bluetooth: ESP32 audio receiver (Path 1) ─────────────────────────────

function updateBtStatus(msg) {
    log("BT: " + msg);
    if (btStatus) btStatus.textContent = msg;
}

async function connectBluetooth() {
    if (!navigator.bluetooth) {
        updateBtStatus("Web Bluetooth not supported in this browser (use Chrome/Edge)");
        return;
    }
    if (BT.connected) {
        updateBtStatus("Already connected");
        return;
    }

    try {
        updateBtStatus("Scanning for Casa Bluetooth device...");
        BT.device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [BT.SERVICE_UUID] }],
            optionalServices: [BT.SERVICE_UUID]
        });

        updateBtStatus("Pairing with " + (BT.device.name || "device") + "...");
        BT.device.addEventListener("gattserverdisconnected", onBluetoothDisconnected);
        BT.server = await BT.device.gatt.connect();

        BT.service = await BT.server.getPrimaryService(BT.SERVICE_UUID);
        BT.audioChar = await BT.service.getCharacteristic(BT.AUDIO_CHAR_UUID);
        try {
            BT.cmdChar = await BT.service.getCharacteristic(BT.CMD_CHAR_UUID);
        } catch (e) {
            BT.cmdChar = null;
        }

        await BT.audioChar.startNotifications();
        BT.audioChar.addEventListener("characteristicvaluechanged", onBluetoothAudio);

        BT.connected = true;
        if (btConnectBtn) btConnectBtn.style.display = "none";
        if (btDisconnectBtn) btDisconnectBtn.style.display = "inline-block";
        updateBtStatus("Connected. Waiting for audio from device...");

        // Connect WebSocket as audio device
        connect();
    } catch (err) {
        updateBtStatus("Connection failed: " + err.message);
        console.error(err);
    }
}

async function disconnectBluetooth() {
    if (BT.audioChar) {
        try { await BT.audioChar.stopNotifications(); } catch (e) {}
        BT.audioChar = null;
    }
    if (BT.server && BT.server.connected) {
        try { BT.server.disconnect(); } catch (e) {}
    }
    BT.server = null;
    BT.service = null;
    BT.cmdChar = null;
    BT.device = null;
    BT.connected = false;
    if (btConnectBtn) btConnectBtn.style.display = "inline-block";
    if (btDisconnectBtn) btDisconnectBtn.style.display = "none";
    updateBtStatus("Disconnected");
}

function onBluetoothDisconnected(event) {
    log("BT: device disconnected");
    disconnectBluetooth();
}

function onBluetoothAudio(event) {
    const value = event.target.value;
    const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    const pcmData = new Int16Array(buffer);
    updateMicLevel(pcmData);
    sendAudio(pcmData);
}

async function sendBluetoothCommand(cmd) {
    if (!BT.connected || !BT.cmdChar) return;
    const encoder = new TextEncoder();
    try {
        await BT.cmdChar.writeValue(encoder.encode(JSON.stringify(cmd)));
    } catch (err) {
        log("BT command failed: " + err.message);
    }
}

async function startRecording(selectedDeviceId) {
    if (isRecording || clientMode !== "browser") return;
    audioChunksSent = 0;

    try {
        // Request mic at the hardware's native rate; we resample to 16k ourselves.
        const audioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
        };
        if (selectedDeviceId) {
            audioConstraints.deviceId = { exact: selectedDeviceId };
        }

        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

        audioContext = new AudioContext({ sampleRate: CONFIG.SAMPLE_RATE });
        await audioContext.resume();

        // Now that permission is granted, enumerate so labels are visible.
        await enumerateMics();

        const actualRate = audioContext.sampleRate;
        if (actualRate !== CONFIG.SAMPLE_RATE) {
            log(`AudioContext rate is ${actualRate} Hz; resampling to ${CONFIG.SAMPLE_RATE} Hz in worklet`);
        } else {
            log(`AudioContext rate is ${actualRate} Hz`);
        }

        const input = audioContext.createMediaStreamSource(mediaStream);

        // Try AudioWorklet first. Use a unique processor name every time to avoid
        // "already registered" errors when recording restarts in always-listening mode.
        if (audioContext.audioWorklet) {
            try {
                const processorName = "pcm-processor-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
                const blob = new Blob([getAudioWorkletCode(processorName)], { type: "application/javascript" });
                const workletUrl = URL.createObjectURL(blob);
                await audioContext.audioWorklet.addModule(workletUrl);

                workletNode = new AudioWorkletNode(audioContext, processorName);
                workletNode.onprocessorerror = (err) => {
                    log("AudioWorklet processor error: " + err);
                };
                workletNode.port.onmessage = (e) => {
                    const pcmData = new Int16Array(e.data.pcm);
                    updateMicLevel(pcmData);
                    sendAudio(pcmData);
                };

                input.connect(workletNode);
                // Do not connect workletNode to destination (prevents feedback)
                log("AudioWorklet recording started (" + processorName + ")");
            } catch (workletErr) {
                log("AudioWorklet failed, falling back to ScriptProcessorNode: " + workletErr);
                workletNode = null;
                setupScriptProcessor(input);
            }
        } else {
            log("AudioWorklet not supported; using ScriptProcessorNode fallback");
            setupScriptProcessor(input);
        }

        isRecording = true;
        if (talkBtn) {
            talkBtn.classList.add("recording");
            talkBtn.textContent = "🔴";
        }
        log("Recording started");

    } catch (err) {
        log("Microphone error: " + err);
        alert("Please allow microphone access.");
    }
}

function setupScriptProcessor(input) {
    const bufferSize = 4096;
    scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);

    const srcRate = audioContext.sampleRate;
    const dstRate = CONFIG.SAMPLE_RATE;
    const ratio = srcRate / dstRate;
    const frameSize = Math.round((dstRate * 80) / 1000); // 80ms @ 16k = 1280
    let resampled = new Float32Array(0);

    scriptNode.onaudioprocess = (e) => {
        const floatData = e.inputBuffer.getChannelData(0);

        // Resample from hardware rate to 16k
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

        // Emit 80ms frames
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
    log("ScriptProcessorNode fallback active (" + srcRate + " -> " + dstRate + ")");
}

function stopRecording() {
    if (!isRecording) return;

    // Flush any pending audio before tearing down
    if (sendBufferTimer) {
        clearTimeout(sendBufferTimer);
        sendBufferTimer = null;
    }
    flushSendBuffer();

    if (workletNode) {
        workletNode.disconnect();
        workletNode = null;
    }
    if (scriptNode) {
        scriptNode.disconnect();
        scriptNode = null;
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
    if (talkBtn) {
        talkBtn.classList.remove("recording");
        talkBtn.textContent = "🎤";
    }
    if (micLevelContainer) micLevelContainer.classList.remove("visible");
    log("Recording stopped. Chunks sent: " + audioChunksSent);
    // Only auto-restart if always-listening is enabled and we aren't in a push-to-talk hold.
    if (autoListenEnabled && !pushToTalkActive) {
        scheduleRecordingRestart();
    }
}

// ── Browser Audio: Playback ───────────────────────────────────────────────────

function playAudio(pcmData) {
    if (clientMode !== "browser") return;
    if (!playContext) {
        playContext = new AudioContext({ sampleRate: CONFIG.SAMPLE_RATE });
        nextPlayTime = playContext.currentTime;
    }

    const actualRate = playContext.sampleRate;
    const srcRate = CONFIG.SAMPLE_RATE;

    // Convert Int16 -> Float32
    const srcFloat = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
        srcFloat[i] = pcmData[i] / 0x7FFF;
    }

    // Resample server PCM (16k) to the actual playback context rate so it plays at correct speed
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

function playTone(freq, duration) {
    if (clientMode !== "browser") return;
    if (!playContext) {
        playContext = new AudioContext({ sampleRate: CONFIG.SAMPLE_RATE });
    }
    const osc = playContext.createOscillator();
    const gain = playContext.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(playContext.destination);
    gain.gain.setValueAtTime(0.1, playContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, playContext.currentTime + duration);
    osc.start();
    osc.stop(playContext.currentTime + duration);
}

// ── UI Updates ────────────────────────────────────────────────────────────────

function updateAvatarState(state) {
    if (avatar) avatar.className = "avatar " + state;
    updateCharacterAvatar();
}

function updateCharacterAvatar() {
    const emojis = {
        default: "🐻", drago: "🐉", liam: "🎧", jenny: "🎨"
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

function updateMicLevel(pcmData) {
    if (!micLevelFill || !micLevelValue) return;
    let max = 0;
    for (let i = 0; i < pcmData.length; i++) {
        max = Math.max(max, Math.abs(pcmData[i]));
    }
    const percent = Math.min(100, Math.round((max / 0x7FFF) * 100));
    micLevelFill.style.width = percent + "%";
    micLevelValue.textContent = percent + "%";
    if (micLevelContainer) micLevelContainer.classList.add("visible");
}

function updateCharacterButtons() {
    document.querySelectorAll(".char-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.character === currentCharacter);
    });
}

function updateModeButtons() {
    document.querySelectorAll(".mode-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mode === currentMode);
    });
}

// ── Event Handlers ────────────────────────────────────────────────────────────

if (talkBtn) {
    // Push-to-talk in browser mode: hold to speak, release to send.
    talkBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        pushToTalkActive = true;
        if (playState === "speaking") {
            triggerInterrupt();
        }
        sendMessage({ type: "command", command: "wake" });
        startRecording();
    });
    talkBtn.addEventListener("pointerup", (e) => {
        e.preventDefault();
        pushToTalkActive = false;
        stopRecording();
    });
    talkBtn.addEventListener("pointerleave", (e) => {
        e.preventDefault();
        if (isRecording) {
            pushToTalkActive = false;
            stopRecording();
        }
    });
}

if (autoListenToggle) {
    autoListenToggle.addEventListener("change", (e) => {
        autoListenEnabled = e.target.checked;
        updateBrowserStatus();
        if (clientMode === "browser") {
            if (autoListenEnabled) {
                startRecording();
            } else {
                stopRecording();
            }
        }
    });
}

if (micSelect) {
    micSelect.addEventListener("change", (e) => {
        restartRecordingWithMic(e.target.value);
    });
}

if (refreshMicsBtn) {
    refreshMicsBtn.addEventListener("click", () => {
        enumerateMics();
    });
}

if (btConnectBtn) {
    btConnectBtn.addEventListener("click", connectBluetooth);
}

if (btDisconnectBtn) {
    btDisconnectBtn.addEventListener("click", disconnectBluetooth);
}

document.querySelectorAll(".char-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        currentCharacter = btn.dataset.character;
        updateCharacterButtons();
        updateCharacterAvatar();
        sendMessage({ type: "config_change", character: currentCharacter, mode: currentMode });
    });
});

document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        currentMode = btn.dataset.mode;
        updateModeButtons();
        sendMessage({ type: "config_change", character: currentCharacter, mode: currentMode });
    });
});

if (volumeSlider) {
    volumeSlider.addEventListener("input", (e) => {
        volume = e.target.value / 100;
        if (volumeValue) volumeValue.textContent = e.target.value + "%";
    });
}

function triggerInterrupt() {
    sendMessage({ type: "command", command: "interrupt" });
    if (clientMode === "browser") {
        stopPlayback();
    }
    log("Interrupt triggered");
}

if (avatar) {
    avatar.addEventListener("click", triggerInterrupt);
}

if (interruptBtn) {
    interruptBtn.addEventListener("click", triggerInterrupt);
}

document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
        e.preventDefault();
        triggerInterrupt();
    }
    if (e.code === "KeyR") {
        sendMessage({ type: "command", command: "reset" });
        log("Reset triggered");
    }
});

// ── Dashboard action panel ────────────────────────────────────────────────────

if (actionPanel) {
    actionPanel.querySelectorAll(".action-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const action = btn.dataset.action;
            lastActionText.textContent = "Last action: " + action;
            if (action.startsWith("scene_")) {
                const scene = action.replace("scene_", "");
                sendMessage({ type: "command", command: "scene_" + scene });
            } else if (action === "interrupt" || action === "reset" || action === "wake" ||
                       action === "volume_up" || action === "volume_down") {
                sendMessage({ type: "command", command: action });
                // If the user clicks Wake in push-to-talk mode, start the mic so the
                // server can hear the command; otherwise nothing gets recorded.
                if (action === "wake" && clientMode === "browser" && !autoListenEnabled && !isRecording) {
                    startRecording();
                }
            }
            log("Dashboard action: " + action);
        });
    });
}

// ── PWA ───────────────────────────────────────────────────────────────────────

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/client/service-worker.js")
        .then(() => log("Service Worker registered"))
        .catch(err => log("SW registration failed: " + err));
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
    // Parse URL params for session sharing
    const urlParams = new URLSearchParams(location.search);
    const urlSession = urlParams.get("session_id");
    const urlDevice = urlParams.get("device_id");
    const urlMode = urlParams.get("mode");

    // Persist session/device IDs across reconnects
    if (urlSession) {
        sessionId = urlSession;
        sessionStorage.setItem("casa_session_id", sessionId);
    } else {
        sessionId = sessionStorage.getItem("casa_session_id");
    }
    if (urlDevice) {
        deviceId = urlDevice;
        sessionStorage.setItem("casa_device_id", deviceId);
    } else {
        deviceId = sessionStorage.getItem("casa_device_id");
    }

    if (urlMode === "dashboard" || urlMode === "browser" || urlMode === "bluetooth") {
        setClientMode(urlMode);
    } else {
        setClientMode("browser");
    }
    updateBrowserStatus();
}

init();
