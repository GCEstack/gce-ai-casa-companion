"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mp3Encoder } from "@breezystack/lamejs";
import { CostData } from "./CostPanel";
import { Message } from "./Transcript";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "speaking"
  | "interrupted"
  | "error";

export type ConversationMode = "turn" | "continuous";

interface AgentConfig {
  systemPrompt?: string;
  characterName?: string;
  voiceId?: string | null;
}

interface UseVoiceAgentOptions {
  initialConfig?: AgentConfig;
  mode?: ConversationMode;
  onStatusChange?: (status: ConnectionStatus) => void;
  onCostUpdate?: (cost: CostData) => void;
  onTranscript?: (msg: Message) => void;
  onTextFallback?: (text: string) => void;
}

interface UseVoiceAgentReturn {
  status: ConnectionStatus;
  voiceId: string | null;
  isUploading: boolean;
  uploadError: string | null;
  mode: ConversationMode;
  setMode: (mode: ConversationMode) => void;
  connect: () => void;
  disconnect: () => void;
  toggleMic: () => void;
  isMicActive: boolean;
  uploadSample: (file: File) => Promise<void>;
  configure: (config: AgentConfig) => void;
}

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || "wss://localhost:8000";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://localhost:8000";

export function useVoiceAgent({
  initialConfig,
  mode: initialMode = "turn",
  onStatusChange,
  onCostUpdate,
  onTranscript,
  onTextFallback,
}: UseVoiceAgentOptions = {}): UseVoiceAgentReturn {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isMicActive, setIsMicActive] = useState(false);
  const [mode, setModeState] = useState<ConversationMode>(initialMode);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingStatusRef = useRef<ConnectionStatus>("idle");
  const pendingConfigRef = useRef<AgentConfig | undefined>(initialConfig);
  const isMicActiveRef = useRef(false);
  const autoListenRef = useRef(true);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vadRef = useRef<{
    start: () => void;
    pause: () => void;
    destroy?: () => void;
  } | null>(null);
  const vadLoadingRef = useRef(false);

  const updateStatus = useCallback(
    (next: ConnectionStatus) => {
      pendingStatusRef.current = next;
      setStatus(next);
      onStatusChange?.(next);
    },
    [onStatusChange]
  );

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioCtx =
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext || AudioContext;
      audioContextRef.current = new AudioCtx();
    }
    return audioContextRef.current;
  }, []);

  const stopPlayback = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {
        // ignore if already stopped
      }
      currentSourceRef.current = null;
    }
    playbackQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  const sendMessage = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const uint8ToBase64 = useCallback((bytes: Uint8Array) => {
    let binary = "";
    const len = bytes.length;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }, []);

  const float32ToMp3 = useCallback((samples: Float32Array, sampleRate = 16000) => {
    const encoder = new Mp3Encoder(1, sampleRate, 128);
    const blockSize = 11520;
    const mp3Chunks: Int8Array[] = [];
    for (let i = 0; i < samples.length; i += blockSize) {
      const block = samples.subarray(i, i + blockSize);
      const int16 = new Int16Array(block.length);
      for (let j = 0; j < block.length; j++) {
        const s = Math.max(-1, Math.min(1, block[j]));
        int16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const encoded = encoder.encodeBuffer(int16);
      if (encoded.length > 0) mp3Chunks.push(encoded);
    }
    const flushed = encoder.flush();
    if (flushed.length > 0) mp3Chunks.push(flushed);

    let total = 0;
    for (const c of mp3Chunks) total += c.length;
    const out = new Uint8Array(total);
    let pos = 0;
    for (const c of mp3Chunks) {
      out.set(new Uint8Array(c.buffer, c.byteOffset, c.length), pos);
      pos += c.length;
    }
    return out;
  }, []);

  const startPing = useCallback(() => {
    if (pingIntervalRef.current) return;
    pingIntervalRef.current = setInterval(() => {
      sendMessage({ type: "ping" });
    }, 20000);
  }, [sendMessage]);

  const stopPing = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsMicActive(false);
    isMicActiveRef.current = false;
  }, []);

  const startMediaRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          sendMessage({ type: "audio", data: base64, mime_type: mimeType });
        };
        reader.readAsDataURL(event.data);
      };

      recorder.onstart = () => {
        setIsMicActive(true);
        isMicActiveRef.current = true;
        updateStatus("listening");
      };

      recorder.onstop = () => {
        setIsMicActive(false);
        isMicActiveRef.current = false;
      };

      recorder.onerror = () => {
        setIsMicActive(false);
        updateStatus("error");
      };

      recorder.start(200);
    } catch (err) {
      console.error("Microphone access error:", err);
      updateStatus("error");
    }
  }, [sendMessage, updateStatus]);

  const startVad = useCallback(async () => {
    if (vadRef.current || vadLoadingRef.current) return;
    vadLoadingRef.current = true;
    try {
      const ort = (window as unknown as { ort?: { env?: { wasm?: { wasmPaths?: string } } } }).ort;
      if (ort?.env?.wasm) {
        ort.env.wasm.wasmPaths = "/ort-wasm/";
      }
      const { MicVAD } = await import("@ricky0123/vad-web");
      const vad = await MicVAD.new({
        baseAssetPath: "/vad/",
        onnxWASMBasePath: "/ort-wasm/",
        model: "v5",
        positiveSpeechThreshold: 0.8,
        negativeSpeechThreshold: 0.65,
        redemptionMs: 700,
        minSpeechMs: 350,
        preSpeechPadMs: 200,
        submitUserSpeechOnPause: false,
        onSpeechStart: () => {
          if (pendingStatusRef.current !== "speaking") {
            updateStatus("listening");
          }
        },
        onSpeechEnd: (audio) => {
          if (pendingStatusRef.current === "speaking") return;
          if (!audio || audio.length < 1600) {
            console.warn("VAD segment too short, skipping", audio?.length);
            return;
          }
          const mp3 = float32ToMp3(audio, 16000);
          const base64 = uint8ToBase64(mp3);
          console.log("sending VAD segment", audio.length, "samples", mp3.length, "bytes");
          sendMessage({ type: "audio", data: base64, mime_type: "audio/mpeg" });
        },
      });
      vad.start();
      vadRef.current = vad;
      setIsMicActive(true);
      isMicActiveRef.current = true;
      updateStatus("ready");
    } catch (err) {
      console.error("VAD failed to start:", err);
      updateStatus("error");
    } finally {
      vadLoadingRef.current = false;
    }
  }, [float32ToMp3, sendMessage, updateStatus]);

  const stopVad = useCallback(() => {
    try {
      vadRef.current?.pause?.();
      vadRef.current?.destroy?.();
    } catch {
      // ignore
    }
    vadRef.current = null;
    setIsMicActive(false);
    isMicActiveRef.current = false;
  }, []);

  const playNextInQueue = useCallback(() => {
    if (isPlayingRef.current || playbackQueueRef.current.length === 0) {
      if (playbackQueueRef.current.length === 0) {
        if (pendingStatusRef.current === "speaking") {
          const wasSpeaking = pendingStatusRef.current;
          updateStatus(isMicActiveRef.current ? "listening" : "ready");
          if (wasSpeaking === "speaking" && autoListenRef.current) {
            setTimeout(() => {
              if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
              if (mode === "turn") {
                if (!isMicActiveRef.current) startMediaRecorder();
              } else {
                vadRef.current?.start?.();
                setIsMicActive(true);
                isMicActiveRef.current = true;
                updateStatus("ready");
              }
            }, 400);
          }
        }
      }
      return;
    }

    const ctx = getAudioContext();
    const buffer = playbackQueueRef.current.shift();
    if (!buffer) return;

    isPlayingRef.current = true;
    updateStatus("speaking");
    vadRef.current?.pause?.();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    currentSourceRef.current = source;

    source.onended = () => {
      isPlayingRef.current = false;
      currentSourceRef.current = null;
      playNextInQueue();
    };

    source.start();
  }, [getAudioContext, mode, startMediaRecorder, updateStatus]);

  const handleAudioChunk = useCallback(
    async (base64: string) => {
      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const ctx = getAudioContext();
        const buffer = await ctx.decodeAudioData(bytes.buffer);
        playbackQueueRef.current.push(buffer);
        playNextInQueue();
      } catch (err) {
        console.error("Failed to decode audio chunk:", err);
      }
    },
    [getAudioContext, playNextInQueue]
  );

  const disconnect = useCallback(() => {
    stopPlayback();
    stopMediaRecorder();
    stopVad();
    stopPing();
    wsRef.current?.close();
    wsRef.current = null;
    updateStatus("idle");
  }, [stopPlayback, stopMediaRecorder, stopVad, stopPing, updateStatus]);

  const toggleMic = useCallback(() => {
    if (mode === "continuous") {
      if (isMicActiveRef.current) {
        autoListenRef.current = false;
        stopVad();
      } else {
        autoListenRef.current = true;
        startVad();
      }
      return;
    }

    if (isMicActiveRef.current) {
      sendMessage({ type: "interrupt" });
      stopPlayback();
      stopMediaRecorder();
      autoListenRef.current = false;
      updateStatus("ready");
    } else {
      autoListenRef.current = true;
      stopPlayback();
      startMediaRecorder();
    }
  }, [mode, sendMessage, stopPlayback, stopMediaRecorder, stopVad, startVad, startMediaRecorder, updateStatus]);

  const handleWsMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (!msg || typeof msg !== "object") return;

        switch (msg.type) {
          case "audio":
            if (pendingStatusRef.current !== "interrupted") {
              handleAudioChunk(String(msg.data));
            }
            break;
          case "text":
            onTextFallback?.(String(msg.text));
            onTranscript?.({
              id: `${Date.now()}-text`,
              role: "assistant",
              text: String(msg.text),
              timestamp: Date.now(),
            });
            break;
          case "transcript":
            onTranscript?.({
              id: `${Date.now()}-transcript-${msg.role}`,
              role: msg.role === "user" ? "user" : "assistant",
              text: String(msg.text),
              timestamp: Date.now(),
            });
            break;
          case "cost":
            onCostUpdate?.(msg.cost as CostData);
            break;
          case "status":
            if (
              msg.status === "listening" ||
              msg.status === "speaking" ||
              msg.status === "interrupted"
            ) {
              updateStatus(msg.status);
            }
            break;
          case "error":
            updateStatus("error");
            console.error("Backend error:", msg.message);
            break;
          default:
            break;
        }
      } catch (err) {
        console.error("WebSocket message parse error:", err);
      }
    },
    [handleAudioChunk, onCostUpdate, onTextFallback, onTranscript, updateStatus]
  );

  const sendConfig = useCallback((config: AgentConfig) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "config",
          system_prompt: config.systemPrompt,
          character_name: config.characterName,
          voice_id: config.voiceId,
        })
      );
    }
  }, []);

  const configure = useCallback(
    (config: AgentConfig) => {
      pendingConfigRef.current = {
        ...pendingConfigRef.current,
        ...config,
      };
      sendConfig(pendingConfigRef.current);
    },
    [sendConfig]
  );

  const connect = useCallback(() => {
    if (wsRef.current) return;

    updateStatus("connecting");
    const sessionId = crypto.randomUUID();
    const wsUrl = `${WS_URL.replace(/\/$/, "")}/ws/${sessionId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (pendingConfigRef.current) {
        sendConfig(pendingConfigRef.current);
      }
      startPing();
      if (mode === "continuous") {
        startVad();
      } else {
        updateStatus("ready");
      }
    };

    ws.onmessage = handleWsMessage;

    ws.onclose = () => {
      wsRef.current = null;
      stopMediaRecorder();
      stopVad();
      stopPlayback();
      stopPing();
      if (pendingStatusRef.current !== "idle") {
        updateStatus("idle");
      }
    };

    ws.onerror = () => {
      updateStatus("error");
    };
  }, [handleWsMessage, mode, sendConfig, startMediaRecorder, startPing, startVad, stopPlayback, stopMediaRecorder, stopPing, stopVad, updateStatus]);

  const uploadSample = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("audio", file);

      const res = await fetch(`${API_URL}/clone`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed (${res.status})`);
      }

      const data = (await res.json()) as { voice_id?: string };
      const id = data.voice_id;
      if (!id) throw new Error("No voice_id returned from backend");
      setVoiceId(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown upload error";
      setUploadError(message);
      console.error("Voice clone upload error:", err);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const setMode = useCallback((next: ConversationMode) => {
    setModeState(next);
    if (pendingStatusRef.current === "idle" || pendingStatusRef.current === "error") return;
    if (next === "continuous") {
      stopMediaRecorder();
      startVad();
    } else {
      stopVad();
      updateStatus("ready");
    }
  }, [startVad, stopMediaRecorder, stopVad, updateStatus]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        sendMessage({ type: "interrupt" });
        stopPlayback();
        if (mode === "turn") {
          stopMediaRecorder();
          updateStatus("interrupted");
          setTimeout(() => {
            if (pendingStatusRef.current === "interrupted" && autoListenRef.current) {
              startMediaRecorder();
            }
          }, 150);
        } else {
          stopVad();
          updateStatus("interrupted");
          setTimeout(() => {
            if (pendingStatusRef.current === "interrupted" && autoListenRef.current) {
              startVad();
            }
          }, 150);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, sendMessage, startMediaRecorder, startVad, stopMediaRecorder, stopPlayback, stopVad, updateStatus]);

  useEffect(() => {
    return () => {
      disconnect();
      audioContextRef.current?.close();
    };
  }, [disconnect]);

  return {
    status,
    voiceId,
    isUploading,
    uploadError,
    mode,
    setMode,
    connect,
    disconnect,
    toggleMic,
    isMicActive,
    uploadSample,
    configure,
  };
}
