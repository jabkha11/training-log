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

const DRAG_ROW_HEIGHT = 132;

function moveItem<T>(items: T[], from: number, to: number) {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function StructureDayCard({
  day,
  index,
  activeDragId,
  onSessionChange,
  onToggleRest,
  onOpenDrag,
  onMoveDrag,
  onEndDrag,
}: {
  day: ProgramDay;
  index: number;
  activeDragId: string | null;
  onSessionChange: (value: string) => void;
  onToggleRest: (value: boolean) => void;
  onOpenDrag: (id: string, index: number) => void;
  onMoveDrag: (id: string, index: number, dy: number) => void;
  onEndDrag: (id: string) => void;
}) {
  const panY = useRef(new Animated.Value(0)).current;
  const activationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragEnabledRef = useRef(false);
  const isDragging = activeDragId === day.id;

  const clearPendingActivation = () => {
    if (activationTimeoutRef.current) {
      clearTimeout(activationTimeoutRef.current);
      activationTimeoutRef.current = null;
    }
  };

  const activateDrag = () => {
    if (dragEnabledRef.current) return;
    dragEnabledRef.current = true;
    onOpenDrag(day.id, index);
    panY.setValue(0);
  };

  useEffect(() => () => clearPendingActivation(), []);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 2,
    onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dy) > 2,
    onPanResponderGrant: () => {
      panY.setValue(0);
      dragEnabledRef.current = false;
      clearPendingActivation();
      if (Platform.OS === 'web') {
        activationTimeoutRef.current = setTimeout(() => activateDrag(), 180);
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
      onMoveDrag(day.id, index, gesture.dy);
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
        onEndDrag(day.id);
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
        onEndDrag(day.id);
      }
    },
  }), [day.id, index, onEndDrag, onMoveDrag, onOpenDrag, panY]);

  return (
    <Animated.View
      style={[
        styles.dayCard,
        isDragging && styles.dayCardDragging,
        { transform: [{ translateY: panY }] },
      ]}
    >
      <View style={styles.dayCardHeader}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.weekday}>{getProgramWeekdayName(index)}</Text>
          <Text style={styles.dayType}>{day.rest ? 'Rest day' : 'Workout day'}</Text>
        </View>
        <View {...responder.panHandlers} style={styles.handle}>
          <Feather name="menu" size={16} color={Colors.text2} />
        </View>
      </View>

      <TextInput
        value={day.session}
        onChangeText={onSessionChange}
        editable={!day.rest}
        placeholder={day.rest ? 'Rest Day' : 'e.g. Push, Legs, Upper'}
        placeholderTextColor={Colors.text3}
        style={[styles.sessionInput, day.rest && styles.sessionInputDisabled]}
      />

      <View style={styles.dayRow}>
        <Text style={styles.dayRowText}>{day.rest ? 'Keep recovery where you want it in the week.' : 'Name this day in the way that makes sense to you.'}</Text>
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
    </Animated.View>
  );
}

export default function ProgramCreateStructureScreen() {
  const { isLoaded, draft, reorderDays, updateDay, toggleRestDay, trainingDays, setCurrentStep, discardDraft } = useProgramCreation();
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [dragOrder, setDragOrder] = useState<ProgramDay[]>([]);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const orderedDays = useMemo(() => (draft ? sortProgramDays(draft.program.days) : []), [draft]);

  useEffect(() => {
    setDragOrder(orderedDays);
  }, [orderedDays]);

  const handleClose = () => {
    router.replace('/builder');
  };

  const handleNext = () => {
    setCurrentStep('day', 0);
    router.push({ pathname: '/programs/create/day/[dayIndex]' as const, params: { dayIndex: '0' } });
  };

  const handleDragStart = (id: string) => {
    setActiveDragId(id);
    setScrollEnabled(false);
  };

  const handleDragMove = (id: string, startIndex: number, dy: number) => {
    const offset = Math.round(dy / DRAG_ROW_HEIGHT);
    const nextIndex = Math.max(0, Math.min(dragOrder.length - 1, startIndex + offset));
    if (nextIndex === startIndex) return;
    const currentIndex = dragOrder.findIndex(day => day.id === id);
    if (currentIndex === -1 || currentIndex === nextIndex) return;
    setDragOrder(current => {
      const fromIndex = current.findIndex(day => day.id === id);
      if (fromIndex === -1) return current;
      return moveItem(current, fromIndex, nextIndex);
    });
  };

  const handleDragEnd = () => {
    setActiveDragId(null);
    setScrollEnabled(true);
    reorderDays(dragOrder.map(day => day.id));
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
      title="Set up your week"
      subtitle="Drag days into the order you want, name your training days clearly, and keep rest days where recovery fits best."
      onBack={() => router.back()}
      onClose={handleClose}
      footer={
        <View style={styles.footerWrap}>
          <TouchableOpacity style={styles.ghostBtn} onPress={async () => { await discardDraft(); router.replace('/builder'); }} activeOpacity={0.85}>
            <Text style={styles.ghostBtnText}>Discard Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleNext} activeOpacity={0.9}>
            <Text style={styles.primaryBtnText}>Next: Build Training Days</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View testID="program-create-structure-screen" style={styles.helperCard}>
        <Feather name="move" size={16} color={Colors.accent} />
        <Text style={styles.helperCardText}>Drag the handle on any day card to reorder the week.</Text>
      </View>

      <View style={styles.weekStrip}>
        {dragOrder.map((day, index) => (
          <View key={day.id} style={[styles.weekStripItem, day.rest ? styles.weekStripItemRest : styles.weekStripItemLive]}>
            <Text style={[styles.weekStripDay, day.rest ? styles.weekStripDayRest : styles.weekStripDayLive]}>
              {getProgramWeekdayName(index).slice(0, 3)}
            </Text>
          </View>
        ))}
      </View>

      <ScrollView scrollEnabled={scrollEnabled} showsVerticalScrollIndicator={false}>
        <View style={styles.dayList}>
          {dragOrder.map((day, index) => (
            <StructureDayCard
              key={day.id}
              day={day}
              index={index}
              activeDragId={activeDragId}
              onSessionChange={value => updateDay(day.id, { session: value })}
              onToggleRest={value => toggleRestDay(day.id, value)}
              onOpenDrag={handleDragStart}
              onMoveDrag={handleDragMove}
              onEndDrag={handleDragEnd}
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Week at a glance</Text>
        <Text style={styles.summaryText}>{trainingDays.length} training day{trainingDays.length === 1 ? '' : 's'} and {7 - trainingDays.length} rest day{7 - trainingDays.length === 1 ? '' : 's'} will move into the guided setup.</Text>
      </View>
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
  helperCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#121924',
    borderWidth: 1,
    borderColor: '#243247',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  helperCardText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 19,
    color: Colors.text2,
  },
  dayList: {
    gap: 12,
  },
  dayCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 16,
    gap: 12,
  },
  dayCardDragging: {
    borderColor: Colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  dayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  weekday: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: Colors.text,
  },
  dayType: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
  },
  handle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
  },
  sessionInputDisabled: {
    color: Colors.text2,
  },
  dayRow: {
    gap: 12,
  },
  dayRowText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 18,
    color: Colors.text2,
  },
  dayModeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modePill: {
    flex: 1,
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
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
  weekStrip: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  weekStripItem: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekStripItemLive: {
    backgroundColor: '#191f0b',
    borderColor: '#4e5f11',
  },
  weekStripItemRest: {
    backgroundColor: Colors.surface2,
    borderColor: Colors.border,
  },
  weekStripDay: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  weekStripDayLive: {
    color: Colors.accent,
  },
  weekStripDayRest: {
    color: Colors.text2,
  },
  summaryCard: {
    marginTop: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    padding: 16,
    gap: 4,
  },
  summaryTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.text,
  },
  summaryText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 19,
    color: Colors.text2,
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
