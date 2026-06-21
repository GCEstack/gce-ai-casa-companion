/**
 * CharacterPicker — Swipeable cards to switch voice personas
 *
 * Shows Drago, Liam, Stella as tappable cards.
 * Changing character updates the AI voice in real-time.
 */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';

export default function CharacterPicker({ characters, activeKey, onSelect }) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Voice</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {Object.values(characters).map((char) => {
          const isActive = char.key === activeKey;
          return (
            <TouchableOpacity
              key={char.key}
              onPress={() => onSelect(char.key)}
              style={[
                styles.card,
                isActive && { borderColor: char.color, borderWidth: 2 },
              ]}
              activeOpacity={0.7}
            >
              {/* Color dot */}
              <View style={[styles.dot, { backgroundColor: char.color }]} />
              <Text style={[styles.name, isActive && { color: char.color }]}>
                {char.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: {
    color: COLORS.textMuted,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  scroll: {
    paddingRight: 16,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 10,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  name: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
