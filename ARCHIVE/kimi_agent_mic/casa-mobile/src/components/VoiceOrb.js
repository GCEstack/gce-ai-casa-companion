/**
 * VoiceOrb — Animated pulsing orb showing the current voice state
 *
 * States:
 *   idle       — Slow gentle pulse, dim color
 *   listening  — Bright cyan, faster pulse (kid is talking)
 *   thinking   — Amber, rapid pulse (AI processing)
 *   speaking   — Purple, wave animation (AI talking)
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';
import { SESSION_STATE } from '../services/openaiRealtime';

const { IDLE, LISTENING, THINKING, SPEAKING } = SESSION_STATE;

export default function VoiceOrb({ state }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Colors per state
  const getColors = () => {
    switch (state) {
      case LISTENING: return { core: COLORS.listening, glow: 'rgba(78,205,196,0.4)' };
      case THINKING:  return { core: COLORS.thinking,  glow: 'rgba(243,156,18,0.4)' };
      case SPEAKING:  return { core: COLORS.speaking,  glow: 'rgba(155,89,182,0.4)' };
      default:        return { core: COLORS.idle,      glow: 'rgba(44,62,80,0.3)' };
    }
  };

  const colors = getColors();

  useEffect(() => {
    // Stop any running animations
    pulseAnim.stopAnimation();
    glowAnim.stopAnimation();
    scaleAnim.stopAnimation();

    if (state === IDLE) {
      // Slow gentle breathing
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        ])
      ).start();
      Animated.timing(glowAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }).start();

    } else if (state === LISTENING) {
      // Faster, brighter pulse
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
      Animated.timing(glowAnim, { toValue: 0.8, duration: 300, useNativeDriver: true }).start();

    } else if (state === THINKING) {
      // Rapid pulsing
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.1, duration: 300, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 0.95, duration: 300, useNativeDriver: true }),
        ])
      ).start();
      Animated.timing(glowAnim, { toValue: 0.6, duration: 200, useNativeDriver: true }).start();

    } else if (state === SPEAKING) {
      // Smooth wave-like expansion
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ])
      ).start();
      Animated.timing(glowAnim, { toValue: 0.9, duration: 200, useNativeDriver: true }).start();
    }
  }, [state]);

  return (
    <View style={styles.container}>
      {/* Outer glow ring */}
      <Animated.View
        style={[
          styles.glowRing,
          {
            backgroundColor: colors.glow,
            opacity: glowAnim,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      />
      {/* Core orb */}
      <Animated.View
        style={[
          styles.coreOrb,
          {
            backgroundColor: colors.core,
            transform: [{ scale: scaleAnim }],
            shadowColor: colors.core,
            shadowOpacity: 0.8,
            shadowRadius: 30,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 200,
    height: 200,
  },
  glowRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  coreOrb: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.accent,
  },
});
