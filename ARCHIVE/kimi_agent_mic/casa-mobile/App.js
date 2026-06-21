/**
 * Casa Companion Mobile — Native Voice Portal
 *
 * A React Native app that uses native OS audio APIs (NOT browser
 * microphones) to stream voice to OpenAI's Realtime API.
 *
 * The kid opens the app, the mic is already live, and they just talk.
 * No buttons to press. No permissions after the first time.
 * The AI hears them, thinks, and responds with voice.
 *
 * Stack:
 *   - React Native + Expo
 *   - expo-av for native audio (mic + speaker)
 *   - OpenAI Realtime API (speech-to-speech in one pipe)
 *   - No WebSocket management needed — OpenAI handles it
 */
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { COLORS } from './src/constants/colors';
import { CHARACTERS } from './src/constants/characters';
import { useRealtimeVoice } from './src/hooks/useRealtimeVoice';
import { SESSION_STATE } from './src/services/openaiRealtime';
import VoiceOrb from './src/components/VoiceOrb';
import ChatBubble from './src/components/ChatBubble';
import CharacterPicker from './src/components/CharacterPicker';
import StatusPill from './src/components/StatusPill';

// ─── BACKEND RELAY CONFIG ─────────────────────────────────
// Set these in a .env file (never commit it). The mobile app never
// talks directly to OpenAI; the Casa backend relay holds the key.
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'wss://casa-voice-agent.fly.dev';
const MOBILE_API_KEY = process.env.EXPO_PUBLIC_MOBILE_API_KEY;
const DEVICE_ID = process.env.EXPO_PUBLIC_DEVICE_ID || 'mobile-001';
// ──────────────────────────────────────────────────────────

export default function App() {
  const {
    state,
    messages,
    character,
    isConnected,
    switchCharacter,
    interrupt,
    reset,
  } = useRealtimeVoice({
    backendUrl: BACKEND_URL,
    token: MOBILE_API_KEY,
    deviceId: DEVICE_ID,
  });

  const scrollViewRef = React.useRef(null);

  // Auto-scroll chat to bottom when new messages arrive
  React.useEffect(() => {
    if (scrollViewRef.current && messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* ── Header ─────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.title}>Casa</Text>
        <TouchableOpacity onPress={reset} style={styles.resetBtn}>
          <Text style={styles.resetText}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* ── Status ─────────────────────────────────── */}
      <StatusPill state={state} isConnected={isConnected} />

      {/* ── Voice Orb (tap to interrupt) ───────────── */}
      <TouchableOpacity
        onPress={interrupt}
        activeOpacity={0.8}
        style={styles.orbContainer}
      >
        <VoiceOrb state={state} />
        <Text style={styles.characterName}>{character.name}</Text>
      </TouchableOpacity>

      {/* ── Chat History ───────────────────────────── */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.chatContainer}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              Say "Hello {character.name}!"
            </Text>
            <Text style={styles.emptySub}>
              Your companion is listening...
            </Text>
          </View>
        )}
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
      </ScrollView>

      {/* ── Character Picker ───────────────────────── */}
      <CharacterPicker
        characters={CHARACTERS}
        activeKey={character.key}
        onSelect={switchCharacter}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    color: COLORS.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  resetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },
  resetText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  orbContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  characterName: {
    color: COLORS.textMuted,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
    letterSpacing: 0.5,
  },
  chatContainer: {
    flex: 1,
  },
  chatContent: {
    paddingVertical: 12,
    paddingBottom: 24,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySub: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
