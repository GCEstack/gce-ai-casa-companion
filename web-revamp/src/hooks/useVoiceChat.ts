import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { characterConfigs } from '@/lib/characterConfig';
import type { AiMode, ModeConfig, TurnState } from '@/types';
import { useWakeWord } from './useWakeWord';
import { useBargeIn } from './useBargeIn';
import { useUserName } from './useUserName';

const OPENAI_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;

function injectUserName(basePrompt: string, userName: string | null): string {
  if (!userName) return basePrompt;
  return `${basePrompt}\n\n[USER NAME] The user's name is "${userName}". Use their name naturally in conversation.`;
}
const OPENAI_BASE = 'https://api.openai.com/v1';

const FETCH_TIMEOUT = 25000;

async function fetchWithTimeout(url: string, options: RequestInit, timeout = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

function getMimeType(): string {
  const types = ['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

// Module-level singletons so only one mic/audio pipeline exists at a time.
let audioCtx: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let analyserNode: AnalyserNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let recordingChunks: Blob[] = [];
let animationFrameId: number | null = null;
let listenerRefCount = 0;
let animationRefCount = 0;
let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
let currentActiveAudio: HTMLAudioElement | null = null;
let vadSilenceStart: number | null = null;
let isStartingMic = false;

const MOBILE_AUDIO_CONSTRAINTS: MediaStreamConstraints['audio'] = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 44100,
  channelCount: 1,
};

interface WaveformApi {
  setData: (data: number[]) => void;
}
const waveformApiRef = { current: null as WaveformApi | null };
export function registerWaveform(api: WaveformApi) {
  waveformApiRef.current = api;
}
export function unregisterWaveform() {
  waveformApiRef.current = null;
}

const VAD_THRESHOLD = 0.03;
const VAD_SILENCE_TIMEOUT = 1500;

const MODE_TRIGGERS: Record<AiMode, string[]> = {
  default: ['normal mode', 'default mode', 'reset mode', 'regular mode'],
  story: ['story mode', 'tell me a story', 'story time', 'narrative mode'],
  math: ['math mode', 'mathematics mode', 'help me with math', 'solve this problem'],
  homework: ['homework mode', 'study mode', 'tutor mode', 'help me study'],
  teaching: ['teaching mode', 'explain mode', 'learn mode', 'teach me', 'explain like i\'m five'],
  calm: ['calm mode', 'relax mode', 'breathe mode', 'mindfulness mode', 'i need to relax', 'breathe with me'],
  creative: ['creative mode', 'brainstorm mode', 'make mode', 'create mode', 'let\'s make something'],
  debate: ['debate mode', 'argue mode', 'argument mode', 'devils advocate', 'devil\'s advocate'],
};

const MODE_ANNOUNCEMENTS: Record<AiMode, string> = {
  default: "Back to normal mode. What's on your mind?",
  story: 'Story mode activated! Once upon a time... or should we start with your idea?',
  math: 'Math mode on! Show me the problem and we\'ll solve it step by step.',
  homework: 'Homework helper ready! What subject are we tackling?',
  teaching: 'Teaching mode engaged. I\'m going to ask YOU a lot of questions. Ready?',
  calm: 'Calm mode. Let\'s breathe together. In... and out...',
  creative: 'Creative mode! No bad ideas, only building blocks. What are we making?',
  debate: 'Debate mode! Pick a topic, any topic. I\'ll argue the other side.',
};

const MODE_PROMPTS: Record<AiMode, string> = {
  default: '',
  story: `[STORY MODE ACTIVE] You are now in storytelling mode.
- Create immersive narratives with vivid descriptions
- Use character voices, sound effects (in text), and dramatic pauses (...)
- End chapters on cliffhangers when appropriate
- Ask "What happens next?" or "Which path do you choose?" for interactivity
- Keep stories age-appropriate for teens (adventure, mystery, fantasy, sci-fi)`,
  math: `[MATH MODE ACTIVE] You are now in mathematics tutoring mode.
- NEVER give the final answer immediately
- Show every step clearly, explain WHY each step is taken
- Check understanding: "Does that make sense?" before moving to next step
- Use analogies: "Think of x as a placeholder, like a mystery box"
- If wrong answer: "Let's trace back — which step feels off?"`,
  homework: `[HOMEWORK MODE ACTIVE] You are now in homework assistant mode.
- Help with ALL subjects: math, science, literature, history, languages
- For essays: outline structure, suggest thesis statements, give feedback on drafts
- NEVER write the assignment FOR them — guide them to the answer
- Ask: "What do you think the answer is?" before giving hints`,
  teaching: `[TEACHING MODE ACTIVE] You are now in guided teaching mode (Socratic method).
- Ask questions more than you give answers
- Use analogies from the student's world (games, social media, sports)
- Explain, then ask them to explain it back
- Always end with: "What questions do you have?"`,
  calm: `[CALM MODE ACTIVE] You are now in mindfulness/relaxation mode.
- Speak slowly and softly (use shorter sentences)
- Guide breathing exercises: "Breathe in for 4... hold for 4... out for 6"
- 5-4-3-2-1 grounding technique: "Name 5 things you see..."
- Gentle affirmations: "You are doing your best, and that is enough"
- Never rush. Pause often. Let silence be comfortable.`,
  creative: `[CREATIVE MODE ACTIVE] You are now in creative collaboration mode.
- Brainstorm wild ideas without judgment
- Use "Yes, and..." improv principle
- Suggest references: artists, writers, designers for inspiration
- Ask: "What if we tried...?" to push boundaries`,
  debate: `[DEBATE MODE ACTIVE] You are now in structured debate mode.
- State your position clearly and support with evidence
- Acknowledge valid points from the user: "That's a fair point, but..."
- Point out logical fallacies gently: "That might be a false dichotomy because..."
- Steel-man their argument before responding
- Keep it respectful — debate ideas, not people`,
};

function detectModeSwitch(transcript: string): AiMode | null {
  const lower = transcript.toLowerCase().trim();
  for (const [mode, triggers] of Object.entries(MODE_TRIGGERS)) {
    if (triggers.some((t) => lower.includes(t))) {
      return mode as AiMode;
    }
  }
  return null;
}

function isModeOnlyInput(transcript: string, mode: AiMode): boolean {
  const lower = transcript.toLowerCase().trim();
  return MODE_TRIGGERS[mode].some((t) => lower === t);
}

function buildSystemPrompt(basePrompt: string, mode: AiMode): string {
  const modeAppendix = MODE_PROMPTS[mode];
  return `${basePrompt}

${modeAppendix}

[CRITICAL TURN-TAKING RULES]
- You speak ONCE per user input. Never continue speaking after your response.
- Wait for the user to speak again before responding.
- If the user interrupts you, stop immediately and wait for them to finish.
- Never ask a question and then answer it yourself.
- After your response, end. The conversation continues only when the user speaks.

${mode !== 'default' ? `[MODE: ${mode.toUpperCase()}] The user can say "default mode" or "normal mode" to return to regular conversation.` : ''}`.trim();
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface UseVoiceChatReturn {
  isConnected: boolean;
  isRecording: boolean;
  isSpeaking: boolean;
  conversationMode: 'turn-based' | 'free-flow';
  turnState: TurnState;
  currentMode: AiMode;
  lastTranscript: string;
  lastResponse: string;
  messages: ChatMessage[];
  connect: () => Promise<void>;
  disconnect: () => void;
  startRecording: () => void;
  stopRecording: () => Promise<Blob | null>;
  toggleRecording: () => Promise<void>;
  requestMicPermission: () => Promise<boolean>;
  setConversationMode: (mode: 'turn-based' | 'free-flow') => void;
  speakResponse: () => void;
  stopSpeaking: () => void;
  sendText: (text: string) => Promise<void>;
}

function activeModeToFeaturePrompt(activeMode: ModeConfig | undefined): string {
  if (!activeMode || activeMode.category !== 'feature') return '';
  return `\n\nACTIVE SPECIAL MODE — ${activeMode.label}: ${activeMode.description} Stay fully in character while helping with this.`;
}

export function useVoiceChat(slug: string, activeMode?: ModeConfig): UseVoiceChatReturn {
  const config = characterConfigs[slug.toLowerCase()];

  const { userName } = useUserName();
  const userNameRef = useRef(userName);
  useEffect(() => {
    userNameRef.current = userName;
  }, [userName]);

  const activeModeRef = useRef(activeMode);
  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  const { state, dispatch } = useApp();

  const [lastTranscript, setLastTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationMode, setConversationModeState] = useState<'turn-based' | 'free-flow'>('turn-based');
  const [turnState, setTurnStateInternal] = useState<TurnState>('idle');
  const [currentMode, setCurrentModeInternal] = useState<AiMode>('default');

  const turnStateRef = useRef<TurnState>('idle');
  const currentModeRef = useRef<AiMode>('default');

  const setTurnState = useCallback((next: TurnState) => {
    turnStateRef.current = next;
    setTurnStateInternal(next);
  }, []);
  const setCurrentMode = useCallback((next: AiMode) => {
    currentModeRef.current = next;
    setCurrentModeInternal(next);
  }, []);

  useEffect(() => {
    turnStateRef.current = turnState;
  }, [turnState]);
  useEffect(() => {
    currentModeRef.current = currentMode;
  }, [currentMode]);

  const isConnected = state.connectionStatus === 'online';

  const setOnline = useCallback(
    (value: boolean) =>
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: value ? 'online' : 'offline' }),
    [dispatch]
  );
  const setRecording = useCallback(
    (value: boolean) => dispatch({ type: 'SET_RECORDING', payload: value }),
    [dispatch]
  );
  const setSpeaking = useCallback(
    (value: boolean) => dispatch({ type: 'SET_SPEAKING', payload: value }),
    [dispatch]
  );
  const setMicPermission = useCallback(
    (value: boolean) => dispatch({ type: 'SET_MIC_PERMISSION', payload: value }),
    [dispatch]
  );
  const setConversationMode = useCallback(
    (mode: 'turn-based' | 'free-flow') => setConversationModeState(mode),
    []
  );

  const stopSpeaking = useCallback(() => {
    if (currentActiveAudio) {
      currentActiveAudio.pause();
      currentActiveAudio = null;
    }
    setSpeaking(false);
    setTurnState('idle');
  }, [setSpeaking]);

  const requestMicPermission = useCallback(async () => {
    try {
      if (!mediaStream) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: MOBILE_AUDIO_CONSTRAINTS });
        mediaStream = stream;
      }

      if (!audioCtx) {
        audioCtx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      if (!analyserNode) {
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 256;
        analyserNode.smoothingTimeConstant = 0.7;

        sourceNode = audioCtx.createMediaStreamSource(mediaStream);
        sourceNode.connect(analyserNode);
      }

      setMicPermission(true);
      setOnline(true);
      return true;
    } catch (err) {
      console.error('Microphone permission denied:', err);
      setMicPermission(false);
      setOnline(false);
      return false;
    }
  }, [setMicPermission, setOnline]);

  const connect = useCallback(async () => {
    try {
      if (!mediaStream) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: MOBILE_AUDIO_CONSTRAINTS });
        mediaStream = stream;
      }

      if (!audioCtx) {
        audioCtx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      // Unlock mobile audio playback by producing a short silent sound during the user gesture.
      try {
        const oscillator = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        gain.gain.value = 0.001;
        oscillator.connect(gain);
        gain.connect(audioCtx.destination);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.01);
      } catch (e) {
        console.error('[voice] Audio unlock failed:', e);
      }

      if (!analyserNode) {
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 256;
        analyserNode.smoothingTimeConstant = 0.7;

        sourceNode = audioCtx.createMediaStreamSource(mediaStream);
        sourceNode.connect(analyserNode);
      }

      setMicPermission(true);
      setOnline(true);
    } catch (err) {
      console.error('Microphone permission denied:', err);
      setMicPermission(false);
      setOnline(false);
    }
  }, [setMicPermission, setOnline]);

  const startRecordingRef = useRef<() => void>(() => {});

  const playAudioResponse = useCallback(
    async (ttsBlob: Blob) => {
      const audioUrl = URL.createObjectURL(ttsBlob);
      const audio = new Audio(audioUrl);
      currentActiveAudio = audio;
      setTurnState('speaking');
      setSpeaking(true);

      audio.onended = () => {
        setSpeaking(false);
        setTurnState('idle');
        currentActiveAudio = null;
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = (e) => {
        console.error('[voice] Audio playback error:', e);
        setSpeaking(false);
        setTurnState('idle');
        currentActiveAudio = null;
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    },
    [setSpeaking]
  );

  const fetchLLMResponse = useCallback(
    async (userText: string, config: { prompt: string; voice: string }) => {
      const systemPrompt =
        buildSystemPrompt(
          injectUserName(config.prompt, userNameRef.current),
          currentModeRef.current
        ) + activeModeToFeaturePrompt(activeModeRef.current);
      const chatRes = await fetchWithTimeout(`${OPENAI_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText },
          ],
          max_tokens: 60,
        }),
      });
      if (!chatRes.ok) {
        const chatErr = await chatRes.text().catch(() => '');
        console.error('[voice] GPT-4o-mini HTTP error:', chatRes.status, chatErr);
        throw new Error(`GPT-4o-mini error ${chatRes.status}`);
      }
      const chatData = (await chatRes.json()) as {
        choices?: Array<{ message: { content: string } }>;
      };
      const responseText = chatData.choices?.[0]?.message?.content;
      if (!responseText) throw new Error('Empty response from GPT-4o-mini');
      return responseText;
    },
    []
  );

  const fetchTTS = useCallback(
    async (responseText: string, config: { prompt: string; voice: string }) => {
      const ttsRes = await fetchWithTimeout(`${OPENAI_BASE}/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          voice: config.voice,
          input: responseText,
        }),
      });
      if (!ttsRes.ok) {
        const ttsErr = await ttsRes.text().catch(() => '');
        console.error('[voice] TTS HTTP error:', ttsRes.status, ttsErr);
        throw new Error(`TTS error ${ttsRes.status}`);
      }
      return await ttsRes.blob();
    },
    []
  );

  const speakWithFallback = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  const runPipeline = useCallback(
    async (userText: string) => {
      if (!config) {
        console.error('No config for:', slug);
        setTurnState('idle');
        return;
      }
      if (!OPENAI_KEY) {
        console.error('OpenAI API key is missing. Add VITE_OPENAI_API_KEY to your .env file.');
        setTurnState('idle');
        return;
      }

      if (!userText.trim()) {
        setTurnState('idle');
        return;
      }

      setTurnState('processing');

      // Mode switch detection
      const detectedMode = detectModeSwitch(userText);
      if (detectedMode && detectedMode !== currentModeRef.current) {
        setCurrentMode(detectedMode);
        const announcement = MODE_ANNOUNCEMENTS[detectedMode];
        try {
          const ttsBlob = await fetchTTS(announcement, config);
          await playAudioResponse(ttsBlob);
        } catch (e) {
          console.error('[voice] Mode announcement failed:', e);
          setTurnState('idle');
        }
        if (isModeOnlyInput(userText, detectedMode)) {
          return;
        }
        // Continue processing the actual message in the new mode
      }

      try {
        const responseText = await fetchLLMResponse(userText, config);
        setLastResponse(responseText);
        setMessages((prev) => [...prev, { role: 'assistant', text: responseText }]);

        const ttsBlob = await fetchTTS(responseText, config);
        await playAudioResponse(ttsBlob);
      } catch (err) {
        console.error('[voice] Voice response failed:', err);
        setSpeaking(false);
        setTurnState('idle');
      }
    },
    [slug, config, fetchLLMResponse, fetchTTS, playAudioResponse]
  );

  const processUserText = useCallback(
    async (userText: string) => {
      await runPipeline(userText);
    },
    [runPipeline]
  );

  const handleVoiceResponse = useCallback(
    async (audioBlob: Blob) => {
      if (!config) {
        console.error('No config for:', slug);
        setTurnState('idle');
        return;
      }
      if (!OPENAI_KEY) {
        console.error('OpenAI API key is missing. Add VITE_OPENAI_API_KEY to your .env file.');
        setTurnState('idle');
        return;
      }
      // Anti-chatter guard: only accept recorded audio that was produced while listening
      if (turnStateRef.current !== 'processing') {
        console.log('[ANTI-CHATTER] Discarding stale audio blob, state:', turnStateRef.current);
        setTurnState('idle');
        return;
      }

      try {
        const sttRes = await fetchWithTimeout(
          'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
          {
            method: 'POST',
            headers: {
              Authorization: 'Token ' + import.meta.env.VITE_DEEPGRAM_API_KEY,
              'Content-Type': 'audio/webm',
            },
            body: audioBlob,
          }
        );
        if (!sttRes.ok) {
          const sttErr = await sttRes.text().catch(() => '');
          console.error('[voice] Deepgram HTTP error:', sttRes.status, sttErr);
          throw new Error(`Deepgram error ${sttRes.status}`);
        }
        const dgData = (await sttRes.json()) as {
          results?: { channels: { alternatives: { transcript: string }[] }[] };
        };
        const userText = dgData.results?.channels[0]?.alternatives[0]?.transcript || '';
        setLastTranscript(userText);
        setMessages((prev) => [...prev, { role: 'user', text: userText }]);

        await runPipeline(userText);
      } catch (err) {
        console.error('[voice] Voice response failed:', err);
        setSpeaking(false);
        setTurnState('idle');
      }
    },
    [slug, config, runPipeline]
  );

  const startRecording = useCallback(() => {
    if (!mediaStream) {
      return;
    }
    // Mobile race-condition guard: prevent double-start
    if (isStartingMic) {
      console.log('[MobileFix] Already starting mic, ignoring');
      return;
    }
    if (mediaRecorder && mediaRecorder.state === 'recording') return;
    // Turn-taking guard: only start recording from idle (explicit user action)
    if (turnStateRef.current !== 'idle') {
      console.log('[TURN] Cannot start recording, current state:', turnStateRef.current);
      return;
    }

    isStartingMic = true;

    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    recordingChunks = [];
    setTurnState('listening');

    // Haptic feedback on supported devices
    try {
      navigator.vibrate?.(50);
    } catch {
      // ignore
    }

    const mimeType = getMimeType();
    mediaRecorder = mimeType
      ? new MediaRecorder(mediaStream, { mimeType })
      : new MediaRecorder(mediaStream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordingChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      setRecording(false);
      isRecordingRef.current = false;
      isStartingMic = false;
      const blob =
        recordingChunks.length > 0
          ? new Blob(recordingChunks, { type: mediaRecorder!.mimeType || 'audio/webm' })
          : null;
      recordingChunks = [];
      if (blob) {
        setTurnState('processing');
        handleVoiceResponse(blob);
      } else {
        setTurnState('idle');
      }
    };

    mediaRecorder.onerror = (event) => {
      console.error('[MobileFix] MediaRecorder error:', event);
      setRecording(false);
      isRecordingRef.current = false;
      isStartingMic = false;
      setTurnState('idle');
      toast.error('Recording error. Please try again.');
    };

    try {
      mediaRecorder.start(100);
      setRecording(true);
      isRecordingRef.current = true;
    } catch (err) {
      console.error('[MobileFix] Failed to start MediaRecorder:', err);
      isStartingMic = false;
      setTurnState('idle');
      toast.error('Could not start microphone. Please try again.');
      return;
    }

    if (autoStopTimer) clearTimeout(autoStopTimer);
    autoStopTimer = setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
      }
    }, 10000);
  }, [setRecording, handleVoiceResponse]);

  startRecordingRef.current = startRecording;

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }

      mediaRecorder.onstop = () => {
        setRecording(false);
        isRecordingRef.current = false;
        isStartingMic = false;
        if (autoStopTimer) {
          clearTimeout(autoStopTimer);
          autoStopTimer = null;
        }
        const blob =
          recordingChunks.length > 0
            ? new Blob(recordingChunks, { type: mediaRecorder!.mimeType || 'audio/webm' })
            : null;
        recordingChunks = [];
        resolve(blob);
        if (blob) {
          setTurnState('processing');
          handleVoiceResponse(blob);
        } else {
          setTurnState('idle');
        }
      };

      mediaRecorder.stop();
    });
  }, [setRecording, handleVoiceResponse]);

  const toggleRecording = useCallback(async () => {
    if (state.isRecording || turnStateRef.current === 'listening') {
      await stopRecording();
      return;
    }
    try {
      if (!isConnected) {
        await connect();
      }
      if (mediaStream) {
        startRecording();
      } else {
        toast.error('Microphone not available. Please allow mic access.');
      }
    } catch (err: any) {
      console.error('[MobileFix] Toggle recording failed:', err);
      if (err?.name === 'NotAllowedError') {
        toast.error('Microphone permission denied. Please allow mic access in settings.');
      } else if (err?.name === 'NotFoundError') {
        toast.error('No microphone found. Please connect a mic.');
      } else if (err?.message?.includes('already started')) {
        isStartingMic = false;
        setTimeout(() => startRecording(), 300);
      } else {
        toast.error('Could not start microphone. Please try again.');
      }
    }
  }, [state.isRecording, isConnected, stopRecording, connect, startRecording]);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
      try {
        await processUserText(trimmed);
      } catch (err) {
        console.error('[voice] Text send failed, falling back to speechSynthesis:', err);
        speakWithFallback(trimmed);
      }
    },
    [processUserText, speakWithFallback]
  );

  const speakResponse = useCallback(() => {
    // In the OpenAI pipeline, the response is triggered automatically when
    // recording stops. This function remains for API compatibility.
  }, []);

  const disconnect = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      mediaRecorder = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }
    if (analyserNode) {
      analyserNode.disconnect();
      analyserNode = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
    if (autoStopTimer) {
      clearTimeout(autoStopTimer);
      autoStopTimer = null;
    }
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
      animationRefCount = 0;
    }
    if (currentActiveAudio) {
      currentActiveAudio.pause();
      currentActiveAudio = null;
    }
    vadSilenceStart = null;
    recordingChunks = [];
    setRecording(false);
    setSpeaking(false);
    setTurnState('idle');
    setOnline(false);
    setMicPermission(false);
    waveformApiRef.current?.setData([]);
  }, [setRecording, setSpeaking, setOnline, setMicPermission]);

  // Spacebar push-to-talk (ignore when typing in inputs/textareas).
  const isRecordingRef = useRef(state.isRecording);
  const isConnectedRef = useRef(isConnected);
  const isSpeakingRef = useRef(state.isSpeaking);
  const conversationModeRef = useRef(conversationMode);
  const stopRecordingRef = useRef(stopRecording);
  useEffect(() => {
    isRecordingRef.current = state.isRecording;
  }, [state.isRecording]);
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);
  useEffect(() => {
    isSpeakingRef.current = state.isSpeaking;
  }, [state.isSpeaking]);
  useEffect(() => {
    conversationModeRef.current = conversationMode;
  }, [conversationMode]);
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  useEffect(() => {
    if (!slug) return;

    listenerRefCount++;
    if (listenerRefCount > 1) return;

    const isTypingTarget = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isTypingTarget(e) && isConnectedRef.current) {
        e.preventDefault();
        if (!isRecordingRef.current) {
          startRecording();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e) && isRecordingRef.current) {
        e.preventDefault();
        stopRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      listenerRefCount--;
      if (listenerRefCount === 0) {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      }
    };
  }, [startRecording, stopRecording]);

  // Wake word + barge-in integration
  const getMediaStream = useCallback(() => mediaStream, []);
  const wakeWordLockRef = useRef(false);

  const wakeWord = useWakeWord({
    enabled: state.wakeWordEnabled,
    characterName: config?.name ?? slug,
    isPaused: state.isRecording || state.isSpeaking,
    getMediaStream,
    onWakeWord: () => {
      if (wakeWordLockRef.current || state.isRecording || state.isSpeaking) return;
      wakeWordLockRef.current = true;
      startRecording();
      setTimeout(() => {
        wakeWordLockRef.current = false;
      }, 1000);
    },
  });

  useEffect(() => {
    dispatch({ type: 'SET_WAKE_WORD_LISTENING', payload: wakeWord.isListening });
  }, [wakeWord.isListening, dispatch]);

  useBargeIn({
    enabled: state.bargeInEnabled,
    isCharacterSpeaking: state.isSpeaking,
    isPaused: state.isRecording,
    getMediaStream,
    onBargeIn: (text) => {
      stopSpeaking();
      processUserText(text).catch(() => {});
    },
  });

  useEffect(() => {
    const active = state.bargeInEnabled && state.isSpeaking && isConnected && !state.isRecording;
    dispatch({ type: 'SET_BARGE_IN_ACTIVE', payload: active });
  }, [state.bargeInEnabled, state.isSpeaking, isConnected, state.isRecording, dispatch]);

  // Live audio-level animation loop while connected.
  useEffect(() => {
    if (!slug) return;

    if (!isConnected) {
      waveformApiRef.current?.setData([]);
      return;
    }

    animationRefCount++;
    if (animationRefCount > 1) return;

    const bufferLength = analyserNode!.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const update = () => {
      if (!analyserNode || !isConnectedRef.current) {
        animationFrameId = null;
        animationRefCount = 0;
        waveformApiRef.current?.setData([]);
        return;
      }

      analyserNode.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const level = Math.min(1, Math.sqrt(sum / bufferLength) / 255);

      // VAD silence detection for free-flow mode: only stop recording on silence,
      // never auto-start recording. Turn-taking requires explicit user action.
      if (conversationModeRef.current === 'free-flow' && !isSpeakingRef.current) {
        const now = Date.now();
        if (level <= VAD_THRESHOLD) {
          if (isRecordingRef.current) {
            if (vadSilenceStart === null) {
              vadSilenceStart = now;
            } else if (now - vadSilenceStart > VAD_SILENCE_TIMEOUT) {
              vadSilenceStart = null;
              stopRecordingRef.current();
            }
          } else {
            vadSilenceStart = null;
          }
        } else {
          vadSilenceStart = null;
        }
      } else {
        vadSilenceStart = null;
      }

      const bars = 16;
      const step = Math.floor(bufferLength / bars);
      const averaged = Array.from({ length: bars }, (_, i) => {
        let barSum = 0;
        for (let j = 0; j < step; j++) {
          barSum += dataArray[i * step + j] || 0;
        }
        return Math.round(barSum / step);
      });
      waveformApiRef.current?.setData(averaged);

      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);

    return () => {
      animationRefCount--;
      if (animationRefCount === 0 && animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };
  }, [isConnected]);

  return {
    isConnected,
    isRecording: state.isRecording,
    isSpeaking: state.isSpeaking,
    conversationMode,
    turnState,
    currentMode,
    lastTranscript,
    lastResponse,
    messages,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    toggleRecording,
    requestMicPermission,
    setConversationMode,
    speakResponse,
    stopSpeaking,
    sendText,
  };
}
