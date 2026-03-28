import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';

export function ProgramCreationShell({
  step,
  title,
  subtitle,
  onBack,
  onClose,
  children,
  footer,
  heroExtra,
}: {
  step: number;
  title: string;
  subtitle: string;
  onBack?: () => void;
  onClose?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  heroExtra?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const progress = Math.min(1, Math.max(0.25, step / 4));
  const introAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    introAnim.setValue(0);
    Animated.timing(introAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [introAnim, step, title]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={onBack} disabled={!onBack} activeOpacity={0.85}>
          <Feather name="arrow-left" size={18} color={onBack ? Colors.text : Colors.text3} />
        </TouchableOpacity>
        <View style={styles.progressWrap}>
          <Text style={styles.progressText}>Step {step} of 4</Text>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
          </View>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={!onClose} activeOpacity={0.85}>
          <Text style={[styles.closeText, !onClose && styles.closeTextDisabled]}>Close</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomPad + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.hero,
            {
              opacity: introAnim,
              transform: [
                {
                  translateY: introAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.eyebrow}>Create Program</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {heroExtra}
        </Animated.View>
        <Animated.View
          style={{
            opacity: introAnim,
            transform: [
              {
                translateY: introAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, 0],
                }),
              },
            ],
          }}
        >
          {children}
        </Animated.View>
      </ScrollView>

      {footer ? <View style={[styles.footer, { paddingBottom: bottomPad + 12 }]}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  closeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.text2,
  },
  closeTextDisabled: {
    color: Colors.text3,
  },
  progressWrap: {
    flex: 1,
    gap: 6,
  },
  progressText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.text2,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: Colors.surface3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.accent,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  hero: {
    gap: 6,
    marginBottom: 18,
  },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: Colors.accent,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    lineHeight: 34,
    color: Colors.text,
  },
  subtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 21,
    color: Colors.text2,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bg,
  },
});
