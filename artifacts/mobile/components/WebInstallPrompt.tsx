import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/colors';

const STORAGE_KEY = 'tl_web_install_prompt_dismissed_v1';

type PromptContent = {
  badge: string;
  title: string;
  body: string;
  steps: string[];
  icon: keyof typeof Feather.glyphMap;
};

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getPromptContent(): PromptContent | null {
  if (typeof window === 'undefined') return null;

  const ua = navigator.userAgent;
  const maxTouchPoints = navigator.maxTouchPoints ?? 0;
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isChrome = /Chrome|CriOS/i.test(ua) && !/Edg|OPR|SamsungBrowser/i.test(ua);
  const isSafari = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);

  if (isStandaloneMode()) return null;

  if (isSafari) {
    return {
      badge: 'Safari Tip',
      title: 'Add this app to your Home Screen',
      body: 'Keep Training Log one tap away and open it in a cleaner full-screen app view.',
      steps: [
        'Tap the Share button in Safari.',
        'Choose Add to Home Screen.',
        'Tap Add in the top-right corner.',
      ],
      icon: 'share',
    };
  }

  if (isChrome && (isIOS || isAndroid)) {
    return {
      badge: 'Chrome Tip',
      title: 'Install this app from Chrome',
      body: 'Put Training Log on your Home Screen so it feels faster and easier to open like a real app.',
      steps: isAndroid
        ? [
            'Tap the menu button in Chrome.',
            'Choose Add to Home screen or Install app.',
            'Tap Add or Install.',
          ]
        : [
            'Open the menu or share button in Chrome.',
            'Choose Add to Home Screen.',
            'Tap Add to save it to your Home Screen.',
          ],
      icon: 'smartphone',
    };
  }

  return null;
}

export function WebInstallPrompt() {
  const [visible, setVisible] = useState(false);
  const content = useMemo(() => (Platform.OS === 'web' ? getPromptContent() : null), []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !content || typeof window === 'undefined') return;
    if (window.localStorage.getItem(STORAGE_KEY)) return;

    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [content]);

  const dismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, 'dismissed');
    }
    setVisible(false);
  };

  if (Platform.OS !== 'web' || !content) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{content.badge}</Text>
            </View>
            <Pressable onPress={dismiss} style={styles.closeButton}>
              <Feather name="x" size={16} color={Colors.text2} />
            </Pressable>
          </View>

          <View style={styles.heroRow}>
            <View style={styles.heroIcon}>
              <Feather name={content.icon} size={18} color={Colors.accent} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.title}>{content.title}</Text>
              <Text style={styles.body}>{content.body}</Text>
            </View>
          </View>

          <View style={styles.steps}>
            {content.steps.map((step, index) => (
              <View key={step} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>

          <Pressable onPress={dismiss} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 5, 10, 0.78)',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: Colors.border2,
    padding: 18,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.accentDim,
    backgroundColor: Colors.accentBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    color: Colors.accent,
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  heroRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentBg,
    borderWidth: 1,
    borderColor: Colors.accentDim,
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: Colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    lineHeight: 28,
  },
  body: {
    color: Colors.text2,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 20,
  },
  steps: {
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border2,
  },
  stepNumberText: {
    color: Colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  stepText: {
    flex: 1,
    color: Colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
  },
  primaryButtonText: {
    color: '#13171d',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
});
