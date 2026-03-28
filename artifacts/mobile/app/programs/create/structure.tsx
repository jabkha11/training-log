import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { ProgramCreationShell } from '@/components/ProgramCreationShell';
import { useProgramCreation } from '@/context/ProgramCreationContext';
import { getProgramWeekdayName, sortProgramDays, type ProgramDay } from '@/lib/program';

const DRAG_ROW_HEIGHT = 152;

function moveItem<T>(items: T[], from: number, to: number) {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function DayRow({
  day,
  index,
  activeDragId,
  onSessionChange,
  onToggleRest,
  onGestureLock,
  onGestureRelease,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  day: ProgramDay;
  index: number;
  activeDragId: string | null;
  onSessionChange: (value: string) => void;
  onToggleRest: (value: boolean) => void;
  onGestureLock: () => void;
  onGestureRelease: () => void;
  onDragStart: (id: string, index: number) => void;
  onDragMove: (id: string, startIndex: number, dy: number) => void;
  onDragEnd: (id: string) => void;
}) {
  const panY = useRef(new Animated.Value(0)).current;
  const activationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragEnabledRef = useRef(false);
  const isDragging = activeDragId === day.id;

  const activateDrag = () => {
    if (dragEnabledRef.current) return;
    dragEnabledRef.current = true;
    onDragStart(day.id, index);
    panY.setValue(0);
  };

  const clearPendingActivation = () => {
    if (activationTimeoutRef.current) {
      clearTimeout(activationTimeoutRef.current);
      activationTimeoutRef.current = null;
    }
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 2,
        onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dy) > 2,
        onPanResponderGrant: () => {
          onGestureLock();
          panY.setValue(0);
          dragEnabledRef.current = false;
          clearPendingActivation();
          if (Platform.OS === 'web') {
            activationTimeoutRef.current = setTimeout(() => {
              activateDrag();
            }, 180);
          } else {
            activateDrag();
          }
        },
        onPanResponderMove: (_event, gesture) => {
          if (!dragEnabledRef.current) {
            if (Platform.OS === 'web' && Math.abs(gesture.dy) > 10) {
              clearPendingActivation();
            }
            return;
          }
          panY.setValue(gesture.dy);
          onDragMove(day.id, index, gesture.dy);
        },
        onPanResponderRelease: () => {
          clearPendingActivation();
          const wasDragging = dragEnabledRef.current;
          dragEnabledRef.current = false;
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 80,
          }).start();
          if (wasDragging) {
            onDragEnd(day.id);
          } else {
            onGestureRelease();
          }
        },
        onPanResponderTerminate: () => {
          clearPendingActivation();
          const wasDragging = dragEnabledRef.current;
          dragEnabledRef.current = false;
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 80,
          }).start();
          if (wasDragging) {
            onDragEnd(day.id);
          } else {
            onGestureRelease();
          }
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      }),
    [day.id, index, onDragEnd, onDragMove, onDragStart, onGestureLock, onGestureRelease, panY],
  );

  return (
    <Animated.View
      style={[
        styles.dayCard,
        isDragging && styles.dayCardDragging,
        { transform: [{ translateY: isDragging ? panY : 0 }] },
      ]}
    >
      <View style={styles.dayContent}>
        <View style={styles.dayHeader}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.dayTitleRow}>
              <Text style={styles.dayLabel}>{getProgramWeekdayName(index)}</Text>
              <View style={[styles.dayStatePill, day.rest ? styles.dayStateRest : styles.dayStateLive]}>
                <Text style={[styles.dayStateText, day.rest ? styles.dayStateTextRest : styles.dayStateTextLive]}>
                  {day.rest ? 'Rest' : 'Workout'}
                </Text>
              </View>
            </View>
            <TextInput
              value={day.session}
              onChangeText={onSessionChange}
              editable={!day.rest}
              placeholder={day.rest ? 'Rest Day' : 'e.g. Pull A'}
              placeholderTextColor={Colors.text3}
              style={[styles.sessionInput, day.rest && styles.sessionInputDisabled]}
            />
          </View>

          <View
            style={[styles.dragHandle, Platform.OS === 'web' ? ({ touchAction: 'none' } as any) : null]}
            onTouchStart={Platform.OS === 'web' ? onGestureLock : undefined}
            onTouchEnd={Platform.OS === 'web' ? onGestureRelease : undefined}
            onTouchCancel={Platform.OS === 'web' ? onGestureRelease : undefined}
            {...responder.panHandlers}
          >
            <Feather name="menu" size={18} color={Colors.text2} />
          </View>
        </View>

        <View style={styles.dayModeRow}>
          <TouchableOpacity
            style={[styles.modePill, !day.rest && styles.modePillActive]}
            onPress={() => onToggleRest(false)}
            activeOpacity={0.85}
          >
            <Text style={[styles.modePillText, !day.rest && styles.modePillTextActive]}>Workout Day</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modePill, day.rest && styles.modePillRestActive]}
            onPress={() => onToggleRest(true)}
            activeOpacity={0.85}
          >
            <Text style={[styles.modePillText, day.rest && styles.modePillTextRestActive]}>Rest Day</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

export default function ProgramCreateStructureScreen() {
  const { isLoaded, draft, reorderDays, updateDay, toggleRestDay, setCurrentStep, discardDraft } =
    useProgramCreation();
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [activeDrag, setActiveDrag] = useState<{ id: string; startIndex: number } | null>(null);
  const [scrollLocked, setScrollLocked] = useState(false);

  const days = useMemo(() => (draft ? sortProgramDays(draft.program.days) : []), [draft]);

  useEffect(() => {
    if (!activeDrag) {
      setDragOrder(null);
    }
  }, [activeDrag]);

  const orderedDays = useMemo(() => {
    const ids = dragOrder ?? days.map(day => day.id);
    const dayMap = new Map(days.map(day => [day.id, day]));
    return ids.map(id => dayMap.get(id)).filter((day): day is ProgramDay => !!day);
  }, [days, dragOrder]);

  const handleClose = () => {
    router.replace('/builder');
  };

  const handleNext = () => {
    setCurrentStep('day', 0);
    router.push({ pathname: '/programs/create/day/[dayIndex]' as const, params: { dayIndex: '0' } });
  };

  const handleDragStart = (id: string, startIndex: number) => {
    setActiveDrag({ id, startIndex });
    setScrollLocked(true);
    setDragOrder(current => current ?? days.map(day => day.id));
  };

  const handleDragMove = (id: string, startIndex: number, dy: number) => {
    setDragOrder(current => {
      const base = current ?? days.map(day => day.id);
      const currentIndex = base.indexOf(id);
      if (currentIndex === -1) return base;
      const targetIndex = Math.max(0, Math.min(base.length - 1, Math.round((startIndex * DRAG_ROW_HEIGHT + dy) / DRAG_ROW_HEIGHT)));
      if (targetIndex === currentIndex) return base;
      return moveItem(base, currentIndex, targetIndex);
    });
  };

  const handleDragEnd = (id: string) => {
    const finalOrder = dragOrder ?? orderedDays.map(day => day.id);
    if (finalOrder.includes(id)) {
      reorderDays(finalOrder);
    }
    setActiveDrag(null);
    setScrollLocked(false);
  };

  if (!isLoaded || !draft) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  return (
    <ProgramCreationShell
      step={2}
      title="Arrange your week"
      subtitle="Drag workouts into the weekday slots you want."
      onBack={() => router.back()}
      onClose={handleClose}
      footer={
        <View style={styles.footerWrap}>
          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={async () => {
              await discardDraft();
              router.replace('/builder');
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.ghostBtnText}>Discard Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleNext} activeOpacity={0.9}>
            <Text style={styles.primaryBtnText}>Next: Build Training Days</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <ScrollView
        testID="program-create-structure-screen"
        showsVerticalScrollIndicator={false}
        scrollEnabled={!activeDrag && !scrollLocked}
      >
        <View style={styles.dayList}>
          {orderedDays.map((day, index) => (
            <DayRow
              key={day.id}
              day={day}
              index={index}
              activeDragId={activeDrag?.id ?? null}
              onSessionChange={value => updateDay(day.id, { session: value })}
              onToggleRest={value => toggleRestDay(day.id, value)}
              onGestureLock={() => setScrollLocked(true)}
              onGestureRelease={() => setScrollLocked(false)}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
            />
          ))}
        </View>
      </ScrollView>
    </ProgramCreationShell>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayList: {
    gap: 12,
  },
  dayCard: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
  },
  dayCardDragging: {
    borderColor: Colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    zIndex: 3,
  },
  dayContent: {
    padding: 16,
    gap: 10,
  },
  dayHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  dayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  dayLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: Colors.text3,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  daySession: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.text,
  },
  dragHandle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayStatePill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dayStateLive: {
    backgroundColor: Colors.infoBg,
    borderColor: Colors.infoBorder,
  },
  dayStateRest: {
    backgroundColor: Colors.warningBg,
    borderColor: Colors.warningBorder,
  },
  dayStateText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  dayStateTextLive: {
    color: Colors.blue,
  },
  dayStateTextRest: {
    color: Colors.orange,
  },
  sessionInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface3,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
  },
  sessionInputDisabled: {
    color: Colors.text2,
  },
  dayModeRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  modePill: {
    flex: 1,
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modePillActive: {
    borderColor: '#4e5f11',
    backgroundColor: '#191f0b',
  },
  modePillRestActive: {
    borderColor: '#5f6776',
    backgroundColor: '#222936',
  },
  modePillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: Colors.text2,
  },
  modePillTextActive: {
    color: Colors.accent,
  },
  modePillTextRestActive: {
    color: '#cfd6e3',
  },
  footerWrap: {
    gap: 10,
  },
  ghostBtn: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text2,
  },
  primaryBtn: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#12161d',
  },
});
