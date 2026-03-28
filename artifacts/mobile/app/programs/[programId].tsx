import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useProgram } from '@/context/ProgramContext';
import { confirmAlert } from '@/lib/alerts';
import { getProgramWeekdayName, MAX_PROGRAM_DAYS } from '@/lib/program';

const DRAG_ROW_HEIGHT = 152;

function formatProgramDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function moveItem<T>(items: T[], from: number, to: number) {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function DayRow({
  day,
  index,
  preview,
  activeDragId,
  canDelete,
  onOpen,
  onDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  day: {
    id: string;
    session: string;
    tag: string;
    rest: boolean;
    slotCount: number;
    preview: string[];
    weekday: string;
  };
  index: number;
  preview: string[];
  activeDragId: string | null;
  canDelete: boolean;
  onOpen: () => void;
  onDelete: () => void;
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
      }
    },
    onShouldBlockNativeResponder: () => true,
  }), [day.id, index, onDragEnd, onDragMove, onDragStart, panY]);

  return (
    <Animated.View
      style={[
        styles.dayCard,
        isDragging && styles.dayCardDragging,
        { transform: [{ translateY: isDragging ? panY : 0 }] },
      ]}
    >
      <TouchableOpacity style={styles.dayContent} onPress={onOpen} activeOpacity={0.9}>
        <View style={styles.dayHeader}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.dayTitleRow}>
              <Text style={styles.dayLabel}>{day.weekday}</Text>
              <View style={[styles.dayStatePill, day.rest ? styles.dayStateRest : styles.dayStateLive]}>
                <Text style={[styles.dayStateText, day.rest ? styles.dayStateTextRest : styles.dayStateTextLive]}>
                  {day.rest ? 'Rest' : 'Workout'}
                </Text>
              </View>
            </View>
            <Text style={styles.daySession}>{day.session}</Text>
            <Text style={styles.dayMeta}>{day.tag}</Text>
          </View>

          <View style={styles.dayControls}>
            <TouchableOpacity
              style={[styles.deleteDayButton, !canDelete && styles.deleteDayButtonDisabled]}
              onPress={onDelete}
              disabled={!canDelete}
              activeOpacity={0.85}
            >
              <Feather name="x" size={16} color={canDelete ? Colors.red : Colors.text3} />
            </TouchableOpacity>
            <View style={styles.dragHandle} {...responder.panHandlers}>
              <Feather name="menu" size={18} color={Colors.text2} />
            </View>
          </View>
        </View>

        <View style={styles.dayMetaRow}>
          <Text style={styles.dayMetaChip}>{day.slotCount} exercises</Text>
          <Text style={styles.dayMetaChip}>{day.rest ? 'Recovery block' : 'Tap to edit'}</Text>
        </View>

        {preview.length > 0 ? (
          <View style={styles.previewRow}>
            {preview.slice(0, 2).map(name => (
              <View key={`${day.id}-${name}`} style={styles.previewChip}>
                <Text style={styles.previewChipText} numberOfLines={1}>{name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyDayText}>{day.rest ? 'Rest day ready.' : 'No exercises yet. Tap to build this session.'}</Text>
        )}

        <View style={styles.editHintRow}>
          <Feather name="edit-3" size={13} color={Colors.text3} />
          <Text style={styles.editHintText}>Tap card to edit this day</Text>
          <Feather name="chevron-right" size={15} color={Colors.text3} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ProgramDetailScreen() {
  const { programId } = useLocalSearchParams<{ programId: string }>();
  const insets = useSafeAreaInsets();
  const {
    programs,
    getProgram,
    getProgramDays,
    getProgramDaySlots,
    activeProgramId,
    setActiveProgram,
    updateProgramMeta,
    duplicateProgram,
    deleteProgram,
    addWorkoutDayToProgram,
    addRestDayToProgram,
    removeProgramDay,
    reorderProgramDays,
  } = useProgram();

  const [editingField, setEditingField] = useState<'name' | 'description' | null>(null);
  const [fieldDraft, setFieldDraft] = useState('');
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [activeDrag, setActiveDrag] = useState<{ id: string; startIndex: number } | null>(null);

  const program = programId ? getProgram(programId) : null;
  const days = useMemo(() => (programId ? getProgramDays(programId) : []), [getProgramDays, programId]);
  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 14) : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  useEffect(() => {
    if (!activeDrag) {
      setDragOrder(null);
    }
  }, [activeDrag]);

  const orderedDays = useMemo(() => {
    const ids = dragOrder ?? days.map(day => day.id);
    const dayMap = new Map(days.map(day => [day.id, day]));
    return ids.map(id => dayMap.get(id)).filter((day): day is (typeof days)[number] => !!day);
  }, [days, dragOrder]);

  const summary = useMemo(() => {
    if (!program) {
      return { dayCount: 0, exerciseCount: 0, restDays: 0 };
    }
    const restDays = orderedDays.filter(day => day.rest).length;
    return {
      dayCount: orderedDays.length,
      exerciseCount: program.program.slots.length,
      restDays,
    };
  }, [orderedDays, program]);

  if (!program || !programId) {
    return (
      <View style={[styles.container, styles.center, { paddingTop: topPad }]}>
        <View style={styles.notFoundCard}>
          <Text style={styles.notFoundTitle}>Program not found</Text>
          <Text style={styles.notFoundText}>This saved program no longer exists.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/builder' as any)} activeOpacity={0.9}>
            <Text style={styles.primaryButtonText}>Back to Programs</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isActive = program.id === activeProgramId;
  const isAtDayLimit = orderedDays.length >= MAX_PROGRAM_DAYS;

  const openFieldEditor = (field: 'name' | 'description') => {
    setEditingField(field);
    setFieldDraft(field === 'name' ? program.name : program.description);
  };

  const saveFieldEdit = () => {
    if (!editingField) return;
    updateProgramMeta(program.id, {
      [editingField]: fieldDraft,
    });
    setEditingField(null);
  };

  const handleDuplicate = () => {
    const duplicatedId = duplicateProgram(program.id);
    if (!duplicatedId) return;
    router.push({ pathname: '/programs/[programId]' as any, params: { programId: duplicatedId } });
  };

  const handleDelete = async () => {
    const confirmed = await confirmAlert({
      title: 'Delete Program',
      message: `Delete ${program.name}? This will not change your workout history.`,
      cancelText: 'Cancel',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    deleteProgram(program.id);
    router.replace('/builder' as any);
  };

  const handleDeleteDay = async (dayId: string, weekday: string) => {
    const confirmed = await confirmAlert({
      title: 'Delete Day',
      message: `Remove ${weekday} from this program?`,
      cancelText: 'Cancel',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    removeProgramDay(program.id, dayId);
  };

  const handleAddWorkoutDay = () => {
    const newDayId = addWorkoutDayToProgram(program.id);
    if (!newDayId) return;
    router.push({ pathname: '/programs/[programId]/days/[dayId]' as any, params: { programId: program.id, dayId: newDayId } });
  };

  const handleAddRestDay = () => {
    addRestDayToProgram(program.id);
  };

  const handleDragStart = (id: string, startIndex: number) => {
    setActiveDrag({ id, startIndex });
    setDragOrder(current => current ?? orderedDays.map(day => day.id));
  };

  const handleDragMove = (id: string, startIndex: number, dy: number) => {
    setDragOrder(current => {
      const base = current ?? orderedDays.map(day => day.id);
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
      reorderProgramDays(program.id, finalOrder);
    }
    setActiveDrag(null);
  };

  return (
    <View testID="program-detail-screen" style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
          <Feather name="arrow-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>Program</Text>
          <View style={styles.editableRow}>
            <Text style={styles.headerTitle}>{program.name}</Text>
            <TouchableOpacity style={styles.inlineEditButton} onPress={() => openFieldEditor('name')} activeOpacity={0.85}>
              <Feather name="edit-3" size={14} color={Colors.text2} />
            </TouchableOpacity>
          </View>
          <View style={styles.editableRow}>
            <Text style={styles.headerSubtitle}>{program.description}</Text>
            <TouchableOpacity style={styles.inlineEditButton} onPress={() => openFieldEditor('description')} activeOpacity={0.85}>
              <Feather name="edit-3" size={13} color={Colors.text3} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomPad + 120 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!activeDrag}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View style={[styles.statePill, isActive ? styles.statePillActive : styles.statePillIdle]}>
              <Text style={[styles.statePillText, isActive ? styles.statePillTextActive : styles.statePillTextIdle]}>
                {isActive ? 'Active Program' : 'Saved Program'}
              </Text>
            </View>
            <Text style={styles.updatedText}>Updated {formatProgramDate(program.updatedAt || program.createdAt)}</Text>
          </View>

          <View style={styles.heroActionRow}>
            {!isActive ? (
              <TouchableOpacity style={styles.primaryButton} onPress={() => setActiveProgram(program.id)} activeOpacity={0.9}>
                <Feather name="zap" size={15} color="#12161d" />
                <Text style={styles.primaryButtonText}>Make Active</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.activeNowRow}>
                <Feather name="check-circle" size={16} color={Colors.green} />
                <Text style={styles.activeNowText}>This is your current active program.</Text>
              </View>
            )}

            <View style={styles.utilityRow}>
              <TouchableOpacity style={styles.utilityButton} onPress={handleDuplicate} activeOpacity={0.85}>
                <Feather name="copy" size={14} color={Colors.text2} />
                <Text style={styles.utilityButtonText}>Duplicate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.utilityButton, styles.utilityButtonDanger, programs.length <= 1 && styles.utilityButtonDisabled]}
                onPress={handleDelete}
                disabled={programs.length <= 1}
                activeOpacity={0.85}
              >
                <Feather name="trash-2" size={14} color={Colors.red} />
                <Text style={[styles.utilityButtonText, styles.utilityButtonDangerText]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.dayCount}</Text>
              <Text style={styles.summaryLabel}>Days</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.exerciseCount}</Text>
              <Text style={styles.summaryLabel}>Exercises</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{summary.restDays}</Text>
              <Text style={styles.summaryLabel}>Rest Days</Text>
            </View>
          </View>
        </View>

        <View style={styles.daysCard}>
          <View style={styles.sectionHeader}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.sectionEyebrow}>Weekly Layout</Text>
              <Text style={styles.sectionTitle}>Drag to reorder your week</Text>
              <Text style={styles.sectionSubtitle}>Each day follows Monday through Sunday based on where it sits in the list.</Text>
            </View>
          </View>

          <View style={styles.addRow}>
            <TouchableOpacity
              style={[styles.addDayButton, isAtDayLimit && styles.addDayButtonDisabled]}
              onPress={handleAddWorkoutDay}
              disabled={isAtDayLimit}
              activeOpacity={0.88}
            >
              <Feather name="plus" size={14} color="#12161d" />
              <Text style={styles.addDayButtonText}>Add Workout Day</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addDayButtonSecondary, isAtDayLimit && styles.addDayButtonDisabled]}
              onPress={handleAddRestDay}
              disabled={isAtDayLimit}
              activeOpacity={0.88}
            >
              <Feather name="moon" size={14} color={Colors.text2} />
              <Text style={styles.addDayButtonSecondaryText}>Add Rest Day</Text>
            </TouchableOpacity>
          </View>
          {isAtDayLimit ? <Text style={styles.capText}>Programs are capped at 7 days.</Text> : null}

          <View style={styles.dayList}>
            {orderedDays.map((day, index) => {
              const daySlots = getProgramDaySlots(program.id, day.id);
              return (
                <DayRow
                  key={day.id}
                  day={{
                    id: day.id,
                    session: day.session,
                    tag: day.tag,
                    rest: day.rest,
                    slotCount: daySlots.length,
                    preview: daySlots.slice(0, 2).map(slot => slot.exerciseName),
                    weekday: getProgramWeekdayName(index),
                  }}
                  index={index}
                  preview={daySlots.slice(0, 2).map(slot => slot.exerciseName)}
                  activeDragId={activeDrag?.id ?? null}
                  canDelete={orderedDays.length > 1}
                  onOpen={() => router.push({ pathname: '/programs/[programId]/days/[dayId]' as any, params: { programId: program.id, dayId: day.id } })}
                  onDelete={() => handleDeleteDay(day.id, getProgramWeekdayName(index))}
                  onDragStart={handleDragStart}
                  onDragMove={handleDragMove}
                  onDragEnd={handleDragEnd}
                />
              );
            })}
          </View>
        </View>
      </ScrollView>

      <Modal visible={!!editingField} transparent animationType="fade" onRequestClose={() => setEditingField(null)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingField === 'name' ? 'Rename Program' : 'Edit Description'}</Text>
            <Text style={styles.modalSubtitle}>
              {editingField === 'name' ? 'Give this program a clear name.' : 'Add a short description so the split is easy to recognize later.'}
            </Text>

            <Text style={styles.fieldLabel}>{editingField === 'name' ? 'Program Name' : 'Description'}</Text>
            <TextInput
              style={[styles.input, editingField === 'description' && styles.textarea]}
              value={fieldDraft}
              onChangeText={setFieldDraft}
              placeholder={editingField === 'name' ? 'Program name' : 'What kind of split is this?'}
              placeholderTextColor={Colors.text3}
              multiline={editingField === 'description'}
              textAlignVertical={editingField === 'description' ? 'top' : 'center'}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalSecondary} onPress={() => setEditingField(null)} activeOpacity={0.85}>
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={saveFieldEdit} activeOpacity={0.9}>
                <Text style={styles.primaryButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  notFoundCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 24,
    padding: 24,
    gap: 10,
    alignItems: 'center',
  },
  notFoundTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.text },
  notFoundText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.text2, textAlign: 'center', lineHeight: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14 },
  backButton: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCopy: { flex: 1, gap: 4 },
  headerEyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: Colors.text3, letterSpacing: 2, textTransform: 'uppercase' },
  editableRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineEditButton: {
    width: 28, height: 28, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  headerTitle: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 26, color: Colors.text },
  headerSubtitle: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text2, lineHeight: 20 },
  scroll: { flex: 1, paddingHorizontal: 16 },
  heroCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border2, borderRadius: 26,
    padding: 18, gap: 16, marginBottom: 14,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  statePill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  statePillActive: { backgroundColor: Colors.successBg, borderColor: Colors.successBorder },
  statePillIdle: { backgroundColor: Colors.surface2, borderColor: Colors.border },
  statePillText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  statePillTextActive: { color: Colors.green },
  statePillTextIdle: { color: Colors.text2 },
  updatedText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.text3 },
  heroActionRow: { gap: 10 },
  primaryButton: {
    minHeight: 46, borderRadius: 16, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8, paddingHorizontal: 16,
  },
  primaryButtonText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#12161d' },
  activeNowRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.successBg, borderWidth: 1,
    borderColor: Colors.successBorder, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14,
  },
  activeNowText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.green },
  utilityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  utilityButton: {
    minHeight: 40, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2,
    paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
  },
  utilityButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.text2 },
  utilityButtonDanger: { borderColor: Colors.dangerBorder, backgroundColor: Colors.dangerBg },
  utilityButtonDisabled: { opacity: 0.45 },
  utilityButtonDangerText: { color: Colors.red },
  summaryRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  summaryCard: {
    flex: 1, minWidth: 96, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border, borderRadius: 18,
    paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', gap: 4,
  },
  summaryValue: { fontFamily: 'Inter_700Bold', fontSize: 18, color: Colors.text },
  summaryLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, color: Colors.text3, letterSpacing: 1, textTransform: 'uppercase' },
  daysCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border2, borderRadius: 24,
    padding: 18, gap: 16,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  sectionEyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: Colors.text3, letterSpacing: 1.8, textTransform: 'uppercase' },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.text, lineHeight: 28 },
  sectionSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text2, lineHeight: 19 },
  addRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  addDayButton: {
    flex: 1, minWidth: 150, minHeight: 42, borderRadius: 14, backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 14,
  },
  addDayButtonSecondary: {
    flex: 1, minWidth: 150, minHeight: 42, borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 14,
  },
  addDayButtonDisabled: { opacity: 0.45 },
  addDayButtonText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#12161d' },
  addDayButtonSecondaryText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: Colors.text2 },
  capText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.text3 },
  dayList: { gap: 12 },
  dayCard: {
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border, borderRadius: 20,
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
  dayContent: { padding: 16, gap: 12 },
  dayHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dayControls: { gap: 8, alignItems: 'center' },
  dayTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dayLabel: { fontFamily: 'Inter_700Bold', fontSize: 12, color: Colors.text3, letterSpacing: 1.4, textTransform: 'uppercase' },
  daySession: { fontFamily: 'Inter_700Bold', fontSize: 18, color: Colors.text },
  dayMeta: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.text2, lineHeight: 18 },
  dragHandle: {
    width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface3, alignItems: 'center', justifyContent: 'center',
  },
  deleteDayButton: {
    width: 32, height: 32, borderRadius: 12, borderWidth: 1, borderColor: Colors.dangerBorder,
    backgroundColor: Colors.dangerBg, alignItems: 'center', justifyContent: 'center',
  },
  deleteDayButtonDisabled: { opacity: 0.45 },
  dayStatePill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  dayStateLive: { backgroundColor: Colors.infoBg, borderColor: Colors.infoBorder },
  dayStateRest: { backgroundColor: Colors.warningBg, borderColor: Colors.warningBorder },
  dayStateText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  dayStateTextLive: { color: Colors.blue },
  dayStateTextRest: { color: Colors.orange },
  dayMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayMetaChip: {
    fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.text2, backgroundColor: Colors.surface3,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
  },
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  previewChip: {
    borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface3,
    paddingHorizontal: 10, paddingVertical: 7, maxWidth: '100%',
  },
  previewChipText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.text2 },
  emptyDayText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.text2, lineHeight: 18 },
  editHintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editHintText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.text3 },
  modalScrim: { flex: 1, backgroundColor: 'rgba(7,10,14,0.74)', justifyContent: 'center', padding: 18 },
  modalCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border2, borderRadius: 24,
    padding: 18, gap: 12,
  },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.text },
  modalSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text2, lineHeight: 19 },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.text2, letterSpacing: 1.2, textTransform: 'uppercase' },
  input: {
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 13, fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.text,
  },
  textarea: { minHeight: 96, paddingTop: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalSecondary: {
    flex: 1, minHeight: 46, borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center',
  },
  modalSecondaryText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.text2 },
});
