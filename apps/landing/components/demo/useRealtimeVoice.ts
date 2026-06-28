"use client";

import { useCallback, useRef, useState } from "react";
import { COPYRIGHT_GUARD } from "@casa/characters";
import { getCharacter } from "@/lib/characters";
import { getMode } from "@/lib/modes";

export type VoiceStatus = "idle" | "connecting" | "connected" | "error";

export function useRealtimeVoice() {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string>("");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    dcRef.current?.close();
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    dcRef.current = null;
    pcRef.current = null;
    audioRef.current = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async (characterKey: string, modeKey?: string) => {
    setStatus("connecting");
    setError("");

    try {
      const character = getCharacter(characterKey);
      if (!character) throw new Error("Character not found");

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audio = document.createElement("audio");
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0];
      };

      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      pc.addTrack(ms.getTracks()[0]);

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        const mode = getMode(modeKey);
        let instructions = character.prompt + COPYRIGHT_GUARD;
        if (mode) instructions += mode.prompt;
        dc.send(
          JSON.stringify({
            type: "session.update",
            session: { instructions },
          })
        );
        setStatus("connected");
      };

      dc.onmessage = (e) => {
        const event = JSON.parse(e.data);
        if (event.type === "error") {
          setError(event.error?.message || "Realtime error");
          setStatus("error");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(`/api/voice/calls?character=${characterKey}`, {
        method: "POST",
        body: offer.sdp,
        headers: { "Content-Type": "application/sdp" },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Realtime SDP exchange failed: ${res.status} ${text}`);
      }

      const answerSdp = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus("error");
      stop();
    }
  }, [stop]);

  return { status, error, start, stop };
}
