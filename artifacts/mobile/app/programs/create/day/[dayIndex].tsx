import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
import { Image } from 'expo-image';
import { Colors } from '@/constants/colors';
import { ProgramCreationShell } from '@/components/ProgramCreationShell';
import { useCatalog } from '@/context/CatalogContext';
import { useProgramCreation } from '@/context/ProgramCreationContext';
import { getProgramWeekdayName } from '@/lib/program';

function exerciseMuscles(primary: string[], secondary: string[]) {
  const text = [...primary, ...secondary];
  return text.length > 0 ? text.join(', ') : 'Muscle map updates after exercise selection.';
}

export default function ProgramCreateDayScreen() {
  const { dayIndex } = useLocalSearchParams<{ dayIndex: string }>();
  const currentIndex = Number(dayIndex ?? '0');
  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [manualExerciseName, setManualExerciseName] = useState('');
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);
  const {
    isLoaded,
    draft,
    trainingDays,
    getDaySlots,
    setCurrentStep,
    updateDay,
    addSlot,
    updateSlot,
    removeSlot,
    moveSlot,
    assignCatalogExercise,
    clearCatalogAssignment,
    setManualExerciseName: setDraftManualExerciseName,
  } = useProgramCreation();
  const { searchCatalog } = useCatalog();

  const day = trainingDays[currentIndex];
  const slots = day ? getDaySlots(day.id) : [];
  const dayTitle = day?.session?.trim() || 'Training Day';
  const results = useMemo(
    () => searchCatalog({ query: pickerQuery, categoryIds: [], muscleIds: [], equipmentIds: [] }).slice(0, 40),
    [pickerQuery, searchCatalog],
  );

  useEffect(() => {
    if (!isLoaded || !draft) return;
    if (!trainingDays.length) {
      router.replace('/programs/create/review');
      return;
    }
    if (!day) {
      router.replace({
        pathname: '/programs/create/day/[dayIndex]' as const,
        params: { dayIndex: String(Math.max(0, trainingDays.length - 1)) },
      });
      return;
    }
    setCurrentStep('day', currentIndex);
  }, [currentIndex, day, draft, isLoaded, setCurrentStep, trainingDays]);

  useEffect(() => {
    setExpandedSlotId(current => {
      if (current && slots.some(slot => slot.id === current)) return current;
      return slots[0]?.id ?? null;
    });
  }, [slots]);

  const handleClose = () => {
    router.replace('/builder');
  };

  const openPickerForSlot = (slotId: string) => {
    setPickerSlotId(slotId);
    setPickerQuery('');
    setManualExerciseName('');
  };

  const handleAddExercise = () => {
    if (!day) return;
    const slotId = addSlot(day.id);
    openPickerForSlot(slotId);
  };

  const handleBack = () => {
    if (currentIndex <= 0) {
      router.back();
      return;
    }
    router.replace({
      pathname: '/programs/create/day/[dayIndex]' as const,
      params: { dayIndex: String(currentIndex - 1) },
    });
  };

  const handleNext = () => {
    if (currentIndex >= trainingDays.length - 1) {
      setCurrentStep('review');
      router.push('/programs/create/review');
      return;
    }
    router.replace({
      pathname: '/programs/create/day/[dayIndex]' as const,
      params: { dayIndex: String(currentIndex + 1) },
    });
  };

  if (!isLoaded || !draft || !day) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  return (
    <ProgramCreationShell
      step={3}
      title={`${getProgramWeekdayName(day.sortOrder)}: ${dayTitle}`}
      subtitle={`Training day ${currentIndex + 1} of ${trainingDays.length}. Start with the main exercises you want here, then add details only where they help.`}
      onBack={handleBack}
      onClose={handleClose}
      heroExtra={(
        <View style={styles.dayProgressWrap}>
          {trainingDays.map((trainingDay, index) => {
            const active = index === currentIndex;
            return (
              <View
                key={trainingDay.id}
                style={[
                  styles.dayProgressChip,
                  active && styles.dayProgressChipActive,
                ]}
              >
                <Text style={[styles.dayProgressWeekday, active && styles.dayProgressWeekdayActive]}>
                  {getProgramWeekdayName(trainingDay.sortOrder)}
                </Text>
                <Text style={[styles.dayProgressSession, active && styles.dayProgressSessionActive]} numberOfLines={1}>
                  {trainingDay.session?.trim() || `Day ${index + 1}`}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      footer={
        <View style={styles.footerWrap}>
          <TouchableOpacity style={styles.ghostBtn} onPress={handleAddExercise} activeOpacity={0.85}>
            <Feather name="plus" size={16} color={Colors.text} />
            <Text style={styles.ghostBtnText}>Add Exercise</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleNext} activeOpacity={0.9}>
            <Text style={styles.primaryBtnText}>{currentIndex >= trainingDays.length - 1 ? 'Next: Review' : 'Next Training Day'}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View testID="program-create-day-screen" style={styles.section}>
        <Text style={styles.label}>Session title</Text>
        <TextInput value={day.session} onChangeText={value => updateDay(day.id, { session: value })} style={styles.input} placeholder="e.g. Push, Legs, Upper" placeholderTextColor={Colors.text3} />
      </View>

      <View style={styles.row}>
        <View style={[styles.section, { flex: 1 }]}>
          <Text style={styles.label}>Tag</Text>
          <TextInput value={day.tag} onChangeText={value => updateDay(day.id, { tag: value })} style={styles.input} placeholder="Tag" placeholderTextColor={Colors.text3} />
        </View>
        <View style={[styles.section, { flex: 1 }]}>
          <Text style={styles.label}>Weekday</Text>
          <View style={styles.readonlyCard}>
            <Text style={styles.readonlyText}>{getProgramWeekdayName(day.sortOrder)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Protocol note</Text>
        <TextInput
          value={day.protocol ?? ''}
          onChangeText={value => updateDay(day.id, { protocol: value })}
          style={[styles.input, styles.multiline]}
          placeholder="Optional cues or intensity notes"
          placeholderTextColor={Colors.text3}
          multiline
        />
      </View>

      <View style={styles.exerciseList}>
        {slots.length === 0 ? (
          <View style={styles.emptyExerciseCard}>
            <View style={styles.emptyExerciseIcon}>
              <Feather name="plus-circle" size={18} color={Colors.accent} />
            </View>
            <Text style={styles.emptyExerciseTitle}>Start with your first exercise</Text>
            <Text style={styles.emptyExerciseBody}>Search the library or add a manual exercise to begin building this day.</Text>
          </View>
        ) : null}
        {slots.map((slot, index) => (
          <View key={slot.id} style={styles.exerciseCard}>
            <View style={styles.exerciseHeader}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.exerciseTitle}>{index + 1}. {slot.exerciseName}</Text>
                <Text style={styles.exerciseMeta}>
                  {slot.sets} sets • {slot.repRange[0]}-{slot.repRange[1]} reps • {slot.restSeconds}s rest
                </Text>
              </View>
              <View style={styles.exerciseHeaderActions}>
                <TouchableOpacity style={styles.smallIconBtn} onPress={() => openPickerForSlot(slot.id)} activeOpacity={0.85}>
                  <Feather name="search" size={15} color={Colors.text2} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.detailsBtn} onPress={() => setExpandedSlotId(current => current === slot.id ? null : slot.id)} activeOpacity={0.85}>
                  <Text style={styles.detailsBtnText}>{expandedSlotId === slot.id ? 'Hide' : 'Details'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {expandedSlotId === slot.id ? (
              <>
                <Text style={styles.exerciseSubtle}>{exerciseMuscles(slot.primaryMuscles, slot.secondaryMuscles)}</Text>

                <View style={styles.metricGrid}>
                  <View style={styles.metricInputWrap}>
                    <Text style={styles.metricLabel}>Sets</Text>
                    <TextInput
                      value={String(slot.sets)}
                      onChangeText={value => updateSlot(slot.id, { sets: Number(value || '0') })}
                      keyboardType="number-pad"
                      style={styles.metricInput}
                    />
                  </View>
                  <View style={styles.metricInputWrap}>
                    <Text style={styles.metricLabel}>Min reps</Text>
                    <TextInput
                      value={String(slot.repRange[0])}
                      onChangeText={value => updateSlot(slot.id, { repRange: [Number(value || '0'), slot.repRange[1]] })}
                      keyboardType="number-pad"
                      style={styles.metricInput}
                    />
                  </View>
                  <View style={styles.metricInputWrap}>
                    <Text style={styles.metricLabel}>Max reps</Text>
                    <TextInput
                      value={String(slot.repRange[1])}
                      onChangeText={value => updateSlot(slot.id, { repRange: [slot.repRange[0], Number(value || '0')] })}
                      keyboardType="number-pad"
                      style={styles.metricInput}
                    />
                  </View>
                  <View style={styles.metricInputWrap}>
                    <Text style={styles.metricLabel}>Rest</Text>
                    <TextInput
                      value={String(slot.restSeconds)}
                      onChangeText={value => updateSlot(slot.id, { restSeconds: Number(value || '0') })}
                      keyboardType="number-pad"
                      style={styles.metricInput}
                    />
                  </View>
                </View>

                <TextInput
                  value={slot.note}
                  onChangeText={value => updateSlot(slot.id, { note: value })}
                  placeholder="Optional coaching cue"
                  placeholderTextColor={Colors.text3}
                  style={[styles.input, styles.noteInput]}
                />

                <View style={styles.slotActionRow}>
                  <TouchableOpacity style={styles.slotAction} onPress={() => moveSlot(slot.id, 'up')} disabled={index === 0} activeOpacity={0.85}>
                    <Feather name="arrow-up" size={14} color={index === 0 ? Colors.text3 : Colors.text2} />
                    <Text style={[styles.slotActionText, index === 0 && styles.slotActionTextDisabled]}>Up</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.slotAction} onPress={() => moveSlot(slot.id, 'down')} disabled={index === slots.length - 1} activeOpacity={0.85}>
                    <Feather name="arrow-down" size={14} color={index === slots.length - 1 ? Colors.text3 : Colors.text2} />
                    <Text style={[styles.slotActionText, index === slots.length - 1 && styles.slotActionTextDisabled]}>Down</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.slotAction} onPress={() => clearCatalogAssignment(slot.id)} activeOpacity={0.85}>
                    <Feather name="edit-3" size={14} color={Colors.text2} />
                    <Text style={styles.slotActionText}>Manual</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.slotActionDanger} onPress={() => removeSlot(slot.id)} activeOpacity={0.85}>
                    <Feather name="trash-2" size={14} color={Colors.red} />
                    <Text style={styles.slotActionDangerText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>
        ))}
      </View>

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

            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {results.map(exercise => (
                <TouchableOpacity
                  key={exercise.wgerId}
                  style={styles.resultCard}
                  onPress={() => {
                    if (!pickerSlotId) return;
                    assignCatalogExercise(pickerSlotId, exercise);
                    setPickerSlotId(null);
                  }}
                  activeOpacity={0.9}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.resultTitle}>{exercise.name}</Text>
                    <Text style={styles.resultText}>{exercise.primaryMuscles.map(item => item.name).join(', ') || 'Exercise library match'}</Text>
                  </View>
                  {exercise.imageUrls[0] ? <Image source={{ uri: exercise.imageUrls[0] }} style={styles.resultImage} contentFit="cover" /> : null}
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
                style={styles.primaryBtn}
                onPress={() => {
                  if (!pickerSlotId || !manualExerciseName.trim()) return;
                  setDraftManualExerciseName(pickerSlotId, manualExerciseName.trim());
                  setPickerSlotId(null);
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryBtnText}>Use Manual Exercise</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  section: {
    gap: 8,
    marginBottom: 16,
  },
  dayProgressWrap: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  dayProgressChip: {
    flex: 1,
    minWidth: 0,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  dayProgressChipActive: {
    borderColor: Colors.successBorder,
    backgroundColor: Colors.successBg,
  },
  dayProgressWeekday: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: Colors.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dayProgressWeekdayActive: {
    color: Colors.green,
  },
  dayProgressSession: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.text2,
  },
  dayProgressSessionActive: {
    color: Colors.text,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
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
  readonlyCard: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  readonlyText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text2,
  },
  exerciseList: {
    gap: 14,
    marginTop: 4,
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
    alignItems: 'flex-start',
  },
  exerciseHeaderActions: {
    gap: 8,
    alignItems: 'center',
  },
  exerciseTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.text,
  },
  exerciseMeta: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
    lineHeight: 18,
  },
  exerciseSubtle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
    lineHeight: 18,
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
  detailsBtn: {
    minWidth: 62,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  detailsBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: Colors.text2,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricInputWrap: {
    width: '47%',
    gap: 4,
  },
  metricLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.text2,
  },
  metricInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.surface2,
    color: Colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteInput: {
    minHeight: 46,
  },
  slotActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  slotAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  slotActionDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#2a1718',
    borderWidth: 1,
    borderColor: '#4d2325',
  },
  slotActionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.text2,
  },
  slotActionTextDisabled: {
    color: Colors.text3,
  },
  slotActionDangerText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.red,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ghostBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#12161d',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,14,18,0.72)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '86%',
    backgroundColor: Colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 16,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.text,
  },
  modalList: {
    maxHeight: 300,
  },
  resultCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 12,
    marginBottom: 10,
  },
  resultTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: Colors.text,
  },
  resultText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 18,
    color: Colors.text2,
  },
  resultImage: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.surface2,
  },
  manualCard: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
  },
});
