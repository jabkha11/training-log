import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Colors } from '@/constants/colors';
import { useCatalog } from '@/context/CatalogContext';
import { useProgram } from '@/context/ProgramContext';
import { confirmAlert } from '@/lib/alerts';
import { getProgramWeekdayName } from '@/lib/program';

function exerciseMuscles(primary: string[], secondary: string[], fallback: string[]) {
  const text = primary.length || secondary.length ? [...primary, ...secondary] : fallback;
  return text.length > 0 ? text.join(', ') : 'Muscle map updates after exercise selection.';
}

export default function ProgramScopedDayEditorScreen() {
  const { programId, dayId } = useLocalSearchParams<{ programId: string; dayId: string }>();
  const insets = useSafeAreaInsets();
  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [manualExerciseName, setManualExerciseName] = useState('');
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'session' | 'tag' | 'protocol' | null>(null);
  const [fieldDraft, setFieldDraft] = useState('');
  const { catalogState, refreshCatalog, searchCatalog } = useCatalog();
  const {
    getProgram,
    getProgramDays,
    getProgramDaySlots,
    updateProgramDay,
    addProgramSlot,
    updateProgramSlot,
    removeProgramSlot,
    duplicateProgramSlot,
    moveProgramSlot,
    assignProgramCatalogExercise,
    clearProgramCatalogAssignment,
  } = useProgram();

  const program = programId ? getProgram(programId) : null;
  const days = useMemo(() => (programId ? getProgramDays(programId) : []), [getProgramDays, programId]);
  const day = days.find(entry => entry.id === dayId);
  const slots = day && programId ? getProgramDaySlots(programId, day.id) : [];
  const weekdayName = day ? getProgramWeekdayName(day.sortOrder) : '';
  const results = useMemo(
    () => searchCatalog({ query: pickerQuery, categoryIds: [], muscleIds: [], equipmentIds: [] }).slice(0, 40),
    [pickerQuery, searchCatalog],
  );
  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 14) : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  useEffect(() => {
    setExpandedSlotId(current => {
      if (current && slots.some(slot => slot.id === current)) return current;
      return null;
    });
  }, [slots]);

  const openPickerForSlot = (slotId: string) => {
    setPickerSlotId(slotId);
    setPickerQuery('');
    setManualExerciseName('');
  };

  if (!program || !programId || !day) {
    return (
      <View testID="program-day-editor-screen" style={[styles.container, styles.center]}>
        <View style={styles.notFoundCard}>
          <Text style={styles.notFoundTitle}>Day not found</Text>
          <Text style={styles.notFoundText}>This saved program day no longer exists.</Text>
        </View>
      </View>
    );
  }

  const openFieldEditor = (field: 'session' | 'tag' | 'protocol') => {
    setEditingField(field);
    setFieldDraft(field === 'session' ? day.session : field === 'tag' ? day.tag : day.protocol ?? '');
  };

  const saveFieldEditor = () => {
    if (!editingField) return;
    if (editingField === 'session') {
      updateProgramDay(program.id, day.id, { session: fieldDraft });
    } else if (editingField === 'tag') {
      updateProgramDay(program.id, day.id, { tag: fieldDraft });
    } else {
      updateProgramDay(program.id, day.id, { protocol: fieldDraft });
    }
    setEditingField(null);
  };

  const handleAddExercise = () => {
    const slotId = addProgramSlot(program.id, day.id);
    openPickerForSlot(slotId);
    setExpandedSlotId(slotId);
  };

  const handleDeleteSlot = async (slotId: string, exerciseName: string) => {
    const confirmed = await confirmAlert({
      title: 'Delete Exercise',
      message: `Remove ${exerciseName} from this day?`,
      cancelText: 'Cancel',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    removeProgramSlot(program.id, slotId);
    if (expandedSlotId === slotId) setExpandedSlotId(null);
  };

  const handleDuplicateSlot = (slotId: string) => {
    const duplicatedId = duplicateProgramSlot(program.id, slotId);
    if (!duplicatedId) return;
    setExpandedSlotId(duplicatedId);
  };

  return (
    <View testID="program-day-editor-screen" style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Feather name="arrow-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>Edit Program Day</Text>
          <Text style={styles.headerTitle}>{day.session?.trim() || weekdayName}</Text>
          <Text style={styles.headerSubtitle}>
            {program.name} - {weekdayName}
          </Text>
        </View>
        <View style={[styles.dayBadge, day.rest ? styles.dayBadgeRest : styles.dayBadgeLive]}>
          <Text style={[styles.dayBadgeText, day.rest ? styles.dayBadgeTextRest : styles.dayBadgeTextLive]}>
            {day.rest ? 'Rest Day' : 'Workout Day'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomPad + 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.infoList}>
          <View style={styles.infoRow}>
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>Session title</Text>
              <Text style={styles.infoValue}>{day.session?.trim() || 'Add a session title'}</Text>
            </View>
            <TouchableOpacity style={styles.inlineIconBtn} onPress={() => openFieldEditor('session')} activeOpacity={0.85}>
              <Feather name="edit-2" size={14} color={Colors.text2} />
            </TouchableOpacity>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>Tag</Text>
              <Text style={styles.infoValue}>{day.tag?.trim() || 'Add a tag'}</Text>
            </View>
            <TouchableOpacity style={styles.inlineIconBtn} onPress={() => openFieldEditor('tag')} activeOpacity={0.85}>
              <Feather name="edit-2" size={14} color={Colors.text2} />
            </TouchableOpacity>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>Weekday</Text>
              <Text style={styles.infoValue}>{weekdayName}</Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          <View style={[styles.infoRow, styles.infoRowTop]}>
            <View style={styles.infoCopy}>
              <Text style={styles.infoLabel}>Protocol note</Text>
              <Text style={[styles.infoValue, styles.infoNoteValue]}>
                {day.protocol?.trim() || 'Add a note for this day'}
              </Text>
            </View>
            <TouchableOpacity style={styles.inlineIconBtn} onPress={() => openFieldEditor('protocol')} activeOpacity={0.85}>
              <Feather name="edit-2" size={14} color={Colors.text2} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.toggleCard}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.toggleTitle}>Rest day</Text>
            <Text style={styles.toggleText}>Keep this day in the weekly schedule, but treat it as recovery instead of a workout.</Text>
          </View>
          <Switch
            value={day.rest}
            onValueChange={rest => updateProgramDay(program.id, day.id, { rest })}
            trackColor={{ false: Colors.border2, true: Colors.orange }}
            thumbColor="#fff"
          />
        </View>

        {!day.rest ? (
          <View style={styles.exerciseList}>
            <View style={styles.exerciseListHeader}>
              <Text style={styles.exerciseListTitle}>Exercises</Text>
              <TouchableOpacity style={styles.primaryAction} onPress={handleAddExercise} activeOpacity={0.9}>
                <Feather name="plus" size={16} color="#12161d" />
                <Text style={styles.primaryActionText}>Add Exercise</Text>
              </TouchableOpacity>
            </View>

            {slots.length === 0 ? (
              <TouchableOpacity style={styles.emptyExerciseCard} onPress={handleAddExercise} activeOpacity={0.85}>
                <View style={styles.emptyExerciseIcon}>
                  <Feather name="plus-circle" size={18} color={Colors.accent} />
                </View>
                <Text style={styles.emptyExerciseTitle}>Start with your first exercise</Text>
                <Text style={styles.emptyExerciseBody}>Search the library or add a manual exercise to begin building this day.</Text>
              </TouchableOpacity>
            ) : null}

            {slots.map((slot, index) => {
              const isExpanded = expandedSlotId === slot.id;
              const isWger = slot.exerciseSource === 'wger';
              const muscleSummary = exerciseMuscles(slot.primaryMuscles, slot.secondaryMuscles, slot.muscleGroups);

              return (
                <View key={slot.id} style={styles.exerciseCard}>
                  <View style={styles.exerciseHeader}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.exerciseTitle}>
                        {index + 1}. {slot.exerciseName}
                      </Text>
                      <Text style={styles.exerciseMeta}>
                        {slot.sets} sets - {slot.repRange[0]}-{slot.repRange[1]} reps - {slot.restSeconds}s rest
                      </Text>
                    </View>
                    <View style={styles.exerciseHeaderActions}>
                      <TouchableOpacity style={styles.smallIconBtn} onPress={() => openPickerForSlot(slot.id)} activeOpacity={0.85}>
                        <Feather name="search" size={15} color={Colors.text2} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.expandBtn}
                        onPress={() => setExpandedSlotId(current => (current === slot.id ? null : slot.id))}
                        activeOpacity={0.85}
                      >
                        <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.text2} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {isExpanded ? (
                    <>
                      <Text style={styles.exerciseSubtle}>{muscleSummary}</Text>

                      {slot.exerciseImageUrl ? (
                        <View style={styles.assignmentCard}>
                          <Image source={{ uri: slot.exerciseImageUrl }} style={styles.resultImage} contentFit="cover" />
                          <View style={{ flex: 1, gap: 3 }}>
                            <Text style={styles.assignmentTitle}>{slot.exerciseName}</Text>
                            <Text style={styles.assignmentBody}>
                              {slot.exerciseCategoryName ?? (isWger ? 'Library exercise' : 'Manual exercise')}
                            </Text>
                          </View>
                        </View>
                      ) : null}

                      <View style={styles.metricGrid}>
                        <View style={styles.metricInputWrap}>
                          <Text style={styles.metricLabel}>Sets</Text>
                          <TextInput
                            value={String(slot.sets)}
                            onChangeText={value => updateProgramSlot(program.id, slot.id, { sets: Math.max(1, Number(value || '1')) })}
                            keyboardType="number-pad"
                            style={styles.metricInput}
                          />
                        </View>
                        <View style={styles.metricInputWrap}>
                          <Text style={styles.metricLabel}>Min reps</Text>
                          <TextInput
                            value={String(slot.repRange[0])}
                            onChangeText={value => updateProgramSlot(program.id, slot.id, { repRange: [Math.max(1, Number(value || '1')), slot.repRange[1]] })}
                            keyboardType="number-pad"
                            style={styles.metricInput}
                          />
                        </View>
                        <View style={styles.metricInputWrap}>
                          <Text style={styles.metricLabel}>Max reps</Text>
                          <TextInput
                            value={String(slot.repRange[1])}
                            onChangeText={value => updateProgramSlot(program.id, slot.id, { repRange: [slot.repRange[0], Math.max(slot.repRange[0], Number(value || String(slot.repRange[0])))] })}
                            keyboardType="number-pad"
                            style={styles.metricInput}
                          />
                        </View>
                        <View style={styles.metricInputWrap}>
                          <Text style={styles.metricLabel}>Rest</Text>
                          <TextInput
                            value={String(slot.restSeconds)}
                            onChangeText={value => updateProgramSlot(program.id, slot.id, { restSeconds: Math.max(0, Number(value || '0')) })}
                            keyboardType="number-pad"
                            style={styles.metricInput}
                          />
                        </View>
                      </View>

                      <TextInput
                        value={slot.note}
                        onChangeText={note => updateProgramSlot(program.id, slot.id, { note })}
                        placeholder="Optional coaching cue"
                        placeholderTextColor={Colors.text3}
                        style={[styles.input, styles.noteInput]}
                      />

                      <View style={styles.slotActionRow}>
                        <TouchableOpacity
                          style={styles.slotAction}
                          onPress={() => moveProgramSlot(program.id, slot.id, 'up')}
                          disabled={index === 0}
                          activeOpacity={0.85}
                        >
                          <Feather name="arrow-up" size={14} color={index === 0 ? Colors.text3 : Colors.text2} />
                          <Text style={[styles.slotActionText, index === 0 && styles.slotActionTextDisabled]}>Up</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.slotAction}
                          onPress={() => moveProgramSlot(program.id, slot.id, 'down')}
                          disabled={index === slots.length - 1}
                          activeOpacity={0.85}
                        >
                          <Feather name="arrow-down" size={14} color={index === slots.length - 1 ? Colors.text3 : Colors.text2} />
                          <Text style={[styles.slotActionText, index === slots.length - 1 && styles.slotActionTextDisabled]}>Down</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.slotAction} onPress={() => handleDuplicateSlot(slot.id)} activeOpacity={0.85}>
                          <Feather name="copy" size={14} color={Colors.text2} />
                          <Text style={styles.slotActionText}>Duplicate</Text>
                        </TouchableOpacity>
                        {isWger ? (
                          <TouchableOpacity
                            style={styles.slotAction}
                            onPress={() => clearProgramCatalogAssignment(program.id, slot.id)}
                            activeOpacity={0.85}
                          >
                            <Feather name="edit-3" size={14} color={Colors.text2} />
                            <Text style={styles.slotActionText}>Manual</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity style={styles.slotActionDanger} onPress={() => handleDeleteSlot(slot.id, slot.exerciseName)} activeOpacity={0.85}>
                          <Feather name="trash-2" size={14} color={Colors.red} />
                          <Text style={styles.slotActionDangerText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.restCard}>
            <View style={styles.restIcon}>
              <Feather name="moon" size={18} color={Colors.orange} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.restTitle}>This day is set as recovery.</Text>
              <Text style={styles.restBody}>
                {slots.length > 0
                  ? `${slots.length} saved exercise${slots.length === 1 ? '' : 's'} are still here and will come back when you turn workout mode on.`
                  : 'Workout editing is hidden while this day is marked as rest.'}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <Modal visible={!!pickerSlotId} animationType="slide" transparent onRequestClose={() => setPickerSlotId(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pick an exercise</Text>
              <TouchableOpacity onPress={() => setPickerSlotId(null)} activeOpacity={0.85}>
                <Feather name="x" size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              value={pickerQuery}
              onChangeText={setPickerQuery}
              placeholder="Search exercise library"
              placeholderTextColor={Colors.text3}
              style={styles.input}
            />

            {!catalogState.sync.lastSuccessfulSyncAt ? (
              <TouchableOpacity style={styles.refreshHint} onPress={() => refreshCatalog({ force: true })} activeOpacity={0.85}>
                <Feather name="refresh-cw" size={14} color={Colors.text2} />
                <Text style={styles.refreshHintText}>
                  {catalogState.sync.status === 'syncing' ? 'Refreshing exercise library...' : 'Refresh the exercise library if search looks empty.'}
                </Text>
              </TouchableOpacity>
            ) : null}

            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {results.map(exercise => (
                <TouchableOpacity
                  key={exercise.wgerId}
                  style={styles.resultCard}
                  onPress={() => {
                    if (!pickerSlotId) return;
                    assignProgramCatalogExercise(program.id, pickerSlotId, exercise);
                    setPickerSlotId(null);
                  }}
                  activeOpacity={0.9}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.resultTitle}>{exercise.name}</Text>
                    <Text style={styles.resultText}>
                      {exercise.primaryMuscles.map(item => item.name).join(', ') || 'Exercise library match'}
                    </Text>
                  </View>
                  {exercise.imageUrls[0] ? (
                    <Image source={{ uri: exercise.imageUrls[0] }} style={styles.resultImage} contentFit="cover" />
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.manualCard}>
              <Text style={styles.label}>Manual exercise</Text>
              <TextInput
                value={manualExerciseName}
                onChangeText={setManualExerciseName}
                placeholder="Type your own exercise name"
                placeholderTextColor={Colors.text3}
                style={styles.input}
              />
              <TouchableOpacity
                style={styles.primaryAction}
                onPress={() => {
                  if (!pickerSlotId || !manualExerciseName.trim()) return;
                  clearProgramCatalogAssignment(program.id, pickerSlotId);
                  updateProgramSlot(program.id, pickerSlotId, {
                    exerciseName: manualExerciseName.trim(),
                    exerciseSource: 'manual',
                    exerciseImageUrl: null,
                    exerciseCategoryName: null,
                    primaryMuscles: [],
                    secondaryMuscles: [],
                  });
                  setPickerSlotId(null);
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryActionText}>Use Manual Exercise</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!editingField} animationType="fade" transparent onRequestClose={() => setEditingField(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.fieldModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingField === 'session' ? 'Edit session title' : editingField === 'tag' ? 'Edit tag' : 'Edit note'}
              </Text>
              <TouchableOpacity onPress={() => setEditingField(null)} activeOpacity={0.85}>
                <Feather name="x" size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={fieldDraft}
              onChangeText={setFieldDraft}
              placeholder={
                editingField === 'session'
                  ? 'e.g. Pull A'
                  : editingField === 'tag'
                    ? 'Short label'
                    : 'Add a note for this day'
              }
              placeholderTextColor={Colors.text3}
              style={[styles.input, editingField === 'protocol' && styles.multiline]}
              multiline={editingField === 'protocol'}
              textAlignVertical={editingField === 'protocol' ? 'top' : 'center'}
              autoFocus
            />
            <TouchableOpacity style={styles.primaryAction} onPress={saveFieldEditor} activeOpacity={0.9}>
              <Text style={styles.primaryActionText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  notFoundCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 24,
    gap: 8,
  },
  notFoundTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.text,
  },
  notFoundText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: Colors.text2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 14,
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
  headerCopy: {
    flex: 1,
    gap: 3,
  },
  headerEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
    color: Colors.accent,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    lineHeight: 30,
    color: Colors.text,
  },
  headerSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
  },
  dayBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  dayBadgeLive: {
    backgroundColor: Colors.successBg,
    borderColor: Colors.successBorder,
  },
  dayBadgeRest: {
    backgroundColor: Colors.warningBg,
    borderColor: Colors.warningBorder,
  },
  dayBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  dayBadgeTextLive: {
    color: Colors.green,
  },
  dayBadgeTextRest: {
    color: Colors.orange,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  section: {
    gap: 8,
    marginBottom: 16,
  },
  infoList: {
    marginBottom: 18,
  },
  inlineIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  infoRowTop: {
    alignItems: 'flex-start',
  },
  infoCopy: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  infoLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  infoValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    lineHeight: 22,
    color: Colors.text,
  },
  infoNoteValue: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    lineHeight: 22,
    color: Colors.text2,
  },
  infoDivider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  multiline: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 16,
    marginBottom: 18,
  },
  toggleTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.text,
  },
  toggleText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: Colors.text2,
  },
  exerciseList: {
    gap: 14,
  },
  exerciseListHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  exerciseListTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.text,
  },
  primaryAction: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  primaryActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: '#12161d',
  },
  emptyExerciseCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 18,
    gap: 8,
  },
  emptyExerciseIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyExerciseTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.text,
  },
  emptyExerciseBody: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 19,
    color: Colors.text2,
  },
  exerciseCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 14,
    gap: 12,
  },
  exerciseHeader: {
    flexDirection: 'row',
    gap: 10,
  },
  exerciseHeaderActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  exerciseTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.text,
  },
  exerciseMeta: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
  },
  smallIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseSubtle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: Colors.text2,
  },
  assignmentCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.surface2,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    alignItems: 'center',
  },
  assignmentTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: Colors.text,
  },
  assignmentBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
    color: Colors.text2,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricInputWrap: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: 6,
  },
  metricLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: Colors.text3,
  },
  metricInput: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    color: Colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteInput: {
    minHeight: 52,
  },
  slotActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotAction: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  slotActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.text2,
  },
  slotActionTextDisabled: {
    color: Colors.text3,
  },
  slotActionDanger: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    backgroundColor: Colors.dangerBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  slotActionDangerText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.red,
  },
  restCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    backgroundColor: Colors.warningBg,
    padding: 18,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  restIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,159,82,0.18)',
  },
  restTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.text,
  },
  restBody: {
    marginTop: 4,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: Colors.text2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: Colors.bg,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 12,
  },
  fieldModal: {
    marginHorizontal: 16,
    marginVertical: 'auto',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bg,
    padding: 16,
    gap: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.text,
  },
  refreshHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  refreshHintText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 18,
    color: Colors.text2,
  },
  modalList: {
    maxHeight: 300,
  },
  resultCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
  },
  resultTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: Colors.text,
  },
  resultText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.text2,
    lineHeight: 18,
  },
  resultImage: {
    width: 62,
    height: 62,
    borderRadius: 14,
    backgroundColor: Colors.surface3,
  },
  manualCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 14,
    gap: 10,
  },
});
