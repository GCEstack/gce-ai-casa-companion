/**
 * ChatBubble — Displays a single message from kid or AI
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';

export default function ChatBubble({ message }) {
  const isKid = message.sender === 'kid';
  const isSystem = message.sender === 'system';

  if (isSystem) {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.text}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.row, isKid ? styles.kidRow : styles.aiRow]}>
      <View style={[styles.bubble, isKid ? styles.kidBubble : styles.aiBubble]}>
        <Text style={[styles.text, isKid ? styles.kidText : styles.aiText]}>
          {message.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginVertical: 4,
    paddingHorizontal: 16,
  },
  kidRow: {
    justifyContent: 'flex-end',
  },
  aiRow: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  kidBubble: {
    backgroundColor: COLORS.accent,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: COLORS.surfaceLight,
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 22,
  },
  kidText: {
    color: '#0a0a1a',
    fontWeight: '500',
  },
  aiText: {
    color: COLORS.text,
  },
  systemRow: {
    alignItems: 'center',
    marginVertical: 8,
  },
  systemText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
});
