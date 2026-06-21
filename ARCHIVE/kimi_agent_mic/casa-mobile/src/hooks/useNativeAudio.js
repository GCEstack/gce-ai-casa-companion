/**
 * Native Audio Hook — @speechmatics/expo-two-way-audio
 *
 * Streams raw PCM from the microphone and plays PCM responses using
 * native iOS/Android audio APIs (no browser audio).
 *
 * The Casa Voice V3 backend expects 16 kHz PCM16 LE, which matches the
 * native module's output, so no resampling is needed.
 */
import { useRef, useCallback, useEffect } from 'react';
import {
  initialize,
  requestMicrophonePermissionsAsync,
  toggleRecording,
  playPCMData,
  addExpoTwoWayAudioEventListener,
  tearDown,
} from '@speechmatics/expo-two-way-audio';

const PCM_RATE = 16000;

export function useNativeAudio() {
  const onAudioChunkRef = useRef(null);
  const isRecordingRef = useRef(false);
  const micSubRef = useRef(null);

  // Initialize native audio once on mount and listen for mic data.
  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        await initialize();
        const { status } = await requestMicrophonePermissionsAsync();
        if (status !== 'granted') {
          console.warn('[NativeAudio] Microphone permission not granted');
          return;
        }

        micSubRef.current = addExpoTwoWayAudioEventListener(
          'onMicrophoneData',
          (event) => {
            if (!isRecordingRef.current || !onAudioChunkRef.current) return;
            // event.data is already 16 kHz PCM16 LE, matching the V3 backend.
            onAudioChunkRef.current(event.data);
          }
        );
      } catch (err) {
        console.error('[NativeAudio] Setup error:', err);
      }
    };

    setup();

    return () => {
      mounted = false;
      micSubRef.current?.remove();
      tearDown().catch(() => {});
    };
  }, []);

  const startRecording = useCallback(async (onAudioChunk) => {
    onAudioChunkRef.current = onAudioChunk;
    isRecordingRef.current = true;
    toggleRecording(true);
  }, []);

  const stopRecording = useCallback(async () => {
    isRecordingRef.current = false;
    toggleRecording(false);
  }, []);

  const playAudio = useCallback(async (pcm16Data) => {
    // V3 backend sends 16 kHz PCM16 LE, matching the native module.
    playPCMData(pcm16Data);
  }, []);

  // The native module has no separate "stop playback" API; teardown would
  // also kill the mic. We rely on response.cancel from the Realtime client
  // to stop new audio arriving.
  const stopPlayback = useCallback(async () => {
    // no-op: managed by native AudioTrack queue + interrupt from OpenAI.
  }, []);

  return {
    startRecording,
    stopRecording,
    playAudio,
    stopPlayback,
  };
}
