/**
 * StatusPill — Shows connection state and current voice activity
 *
 * States: Connecting → Idle → Listening → Thinking → Speaking
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';
import { SESSION_STATE } from '../services/openaiRealtime';

const LABELS = {
  [SESSION_STATE.CONNECTING]: 'Connecting...',
  [SESSION_STATE.IDLE]: 'Say "Hello"',
  [SESSION_STATE.LISTENING]: 'Listening...',
  [SESSION_STATE.THINKING]: 'Thinking...',
  [SESSION_STATE.SPEAKING]: 'Speaking...',
  [SESSION_STATE.ERROR]: 'Error',
  [SESSION_STATE.DISCONNECTED]: 'Offline',
};

const COLORS_MAP = {
  [SESSION_STATE.CONNECTING]: COLORS.textMuted,
  [SESSION_STATE.IDLE]: COLORS.textMuted,
  [SESSION_STATE.LISTENING]: COLORS.listening,
  [SESSION_STATE.THINKING]: COLORS.thinking,
  [SESSION_STATE.SPEAKING]: COLORS.speaking,
  [SESSION_STATE.ERROR]: COLORS.error,
  [SESSION_STATE.DISCONNECTED]: COLORS.error,
};

export default function StatusPill({ state, isConnected }) {
  const label = LABELS[state] || '...';
  const dotColor = COLORS_MAP[state] || COLORS.textMuted;

  return (
    <View style={styles.container}>
      {/* Connection dot */}
      <View style={[styles.connDot, { backgroundColor: isConnected ? COLORS.success : COLORS.error }]} />
      {/* State label */}
      <View style={styles.pill}>
        <View style={[styles.stateDot, { backgroundColor: dotColor }]} />
        <Text style={styles.text}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  connDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  text: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '500',
  },
});
