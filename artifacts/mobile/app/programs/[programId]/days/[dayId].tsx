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
import { STRENGTH_LIFT_CONFIG, STRENGTH_LIFT_ORDER, type StrengthLiftKey } from '@/constants/heatmap';
import { useCatalog } from '@/context/CatalogContext';
import { useProgram } from '@/context/ProgramContext';
import { confirmAlert } from '@/lib/alerts';
import type { CatalogExercise } from '@/lib/catalog';
import { getProgramWeekdayName } from '@/lib/program';

const COLOR_OPTIONS = ['#e8ff47', '#52b8ff', '#4cff91', '#ff9f52', '#ff5252', '#c084fc', '#f0ede8'];

function SectionHeader({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!detail && <Text style={styles.sectionDetail}>{detail}</Text>}
      </View>
      {action}
    </View>
  );
}

function LargeStepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: string | number;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <View style={styles.stepperCard}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <TouchableOpacity style={styles.stepperButton} onPress={onDec} activeOpacity={0.85}>
          <Feather name="minus" size={16} color={Colors.text2} />
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{value}</Text>
        <TouchableOpacity style={styles.stepperButton} onPress={onInc} activeOpacity={0.85}>
          <Feather name="plus" size={16} color={Colors.text2} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ToneBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'neutral' | 'live' | 'rest' | 'accent';
}) {
  return (
    <View
      style={[
        styles.pill,
        tone === 'live' && styles.pillLive,
        tone === 'rest' && styles.pillRest,
        tone === 'accent' && styles.pillAccent,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          tone === 'live' && styles.pillTextLive,
          tone === 'rest' && styles.pillTextRest,
          tone === 'accent' && styles.pillTextAccent,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function exerciseMuscles(exercise: CatalogExercise) {
  const primary = exercise.primaryMuscles.map(item => item.name).join(', ');
  const secondary = exercise.secondaryMuscles.map(item => item.name).join(', ');
  return secondary ? `${primary} | Assist: ${secondary}` : primary;
}

function summarizeMuscles(primary: string[], secondary: string[], fallback: string[]) {
  const values = primary.length || secondary.length ? [...primary, ...secondary] : fallback;
  return values.length > 0 ? values.join(', ') : 'No muscle mapping yet';
}

export default function ProgramScopedDayEditorScreen() {
  const { programId, dayId } = useLocalSearchParams<{ programId: string; dayId: string }>();
  const insets = useSafeAreaInsets();
  const [pickerSlotId, setPickerSlotId] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [expandedSettings, setExpandedSettings] = useState(false);
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);
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
  const activeSlot = slots.find(slot => slot.id === pickerSlotId) ?? null;
  const results = useMemo(
    () => searchCatalog({ query: pickerQuery, categoryIds: [], muscleIds: [], equipmentIds: [] }).slice(0, 80),
    [pickerQuery, searchCatalog],
  );
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  useEffect(() => {
    if (!day) return;
    const hasEstablishedValues = Boolean(day.tag && day.session);
    setExpandedSettings(!hasEstablishedValues);
    setExpandedSlotId(null);
    setPickerSlotId(null);
    setPickerQuery('');
  }, [day?.id]);

  useEffect(() => {
    if (!expandedSlotId) return;
    if (!slots.some(slot => slot.id === expandedSlotId)) {
      setExpandedSlotId(null);
    }
  }, [expandedSlotId, slots]);

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

  const handleDeleteSlot = async (slotId: string, exerciseName: string) => {
    const confirmed = await confirmAlert({
      title: 'Delete Exercise',
      message: `Remove ${exerciseName} from this day?`,
      cancelText: 'Cancel',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    if (expandedSlotId === slotId) {
      setExpandedSlotId(null);
    }
    removeProgramSlot(program.id, slotId);
  };

  const handleAddSlot = () => {
    const slotId = addProgramSlot(program.id, day.id);
    setExpandedSlotId(slotId);
  };

  const handleDuplicateSlot = (slotId: string) => {
    const duplicatedId = duplicateProgramSlot(program.id, slotId);
    if (duplicatedId) {
      setExpandedSlotId(duplicatedId);
    }
  };

  const toggleSlot = (slotId: string) => {
    setExpandedSlotId(current => (current === slotId ? null : slotId));
  };

  const updateMuscles = (slotId: string, text: string) => {
    updateProgramSlot(program.id, slotId, {
      muscleGroups: text
        .split(',')
        .map(group => group.trim())
        .filter(Boolean),
    });
  };

  return (
    <View testID="program-day-editor-screen" style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Feather name="arrow-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <View style={styles.headerEyebrowRow}>
            <Text style={styles.headerEyebrow}>Saved Program Day</Text>
            <ToneBadge label={day.rest ? 'Rest Day' : 'Training Day'} tone={day.rest ? 'rest' : 'live'} />
          </View>
          <Text style={styles.headerTitle}>{day.session}</Text>
          <Text style={styles.headerSubtitle}>{program.name} | {weekdayName}</Text>
        </View>
        {!day.rest && (
          <TouchableOpacity style={styles.headerAccentBtn} onPress={handleAddSlot} activeOpacity={0.85}>
            <Feather name="plus" size={16} color="#12161d" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomPad + 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.summaryCard}>
          <SectionHeader
            eyebrow="Saved Program"
            title={day.session}
            detail={`${weekdayName} | ${day.tag}`}
            action={
              <TouchableOpacity
                style={styles.sectionToggle}
                onPress={() => setExpandedSettings(current => !current)}
                activeOpacity={0.85}
              >
                <Text style={styles.sectionToggleText}>{expandedSettings ? 'Collapse' : 'Edit'}</Text>
                <Feather name={expandedSettings ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.text2} />
              </TouchableOpacity>
            }
          />

          <View style={styles.summaryMetaRow}>
            <View style={styles.summaryMetaCard}>
              <Text style={styles.summaryMetaLabel}>Day Type</Text>
              <ToneBadge label={day.rest ? 'Recovery' : 'Live'} tone={day.rest ? 'rest' : 'live'} />
            </View>
            <View style={styles.summaryMetaCard}>
              <Text style={styles.summaryMetaLabel}>Color</Text>
              <View style={styles.colorPreviewRow}>
                <View style={[styles.colorPreview, { backgroundColor: day.color }]} />
                <Text style={styles.summaryMetaValue}>{day.color}</Text>
              </View>
            </View>
          </View>

          {!!day.protocol && (
            <View style={styles.protocolSummary}>
              <Feather name="clipboard" size={14} color={Colors.text3} />
              <Text style={styles.protocolSummaryText} numberOfLines={2}>
                {day.protocol}
              </Text>
            </View>
          )}

          {expandedSettings && (
            <View style={styles.settingsPanel}>
              <View style={styles.readOnlyCard}>
                <Text style={styles.readOnlyText}>This day is currently placed on {weekdayName}. Reorder it from the program screen if you want it on a different weekday.</Text>
              </View>
              <Text style={styles.fieldLabel}>Tag</Text>
              <TextInput style={styles.input} value={day.tag} onChangeText={tag => updateProgramDay(program.id, day.id, { tag })} placeholder="Tag line" placeholderTextColor={Colors.text3} />
              <Text style={styles.fieldLabel}>Session Title</Text>
              <TextInput style={styles.input} value={day.session} onChangeText={session => updateProgramDay(program.id, day.id, { session })} placeholder="Session title" placeholderTextColor={Colors.text3} />
              <Text style={styles.fieldLabel}>Protocol Notes</Text>
              <TextInput style={[styles.input, styles.textarea]} value={day.protocol ?? ''} onChangeText={protocol => updateProgramDay(program.id, day.id, { protocol })} placeholder="Add coaching notes for this day" placeholderTextColor={Colors.text3} multiline textAlignVertical="top" />
              <View style={styles.toggleCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Rest Day</Text>
                  <Text style={styles.toggleText}>Keep the day in the split but treat it as recovery.</Text>
                </View>
                <Switch value={day.rest} onValueChange={rest => updateProgramDay(program.id, day.id, { rest })} trackColor={{ false: Colors.border2, true: Colors.orange }} thumbColor="#fff" />
              </View>
              <Text style={styles.fieldLabel}>Accent Color</Text>
              <View style={styles.colorRow}>
                {COLOR_OPTIONS.map(color => (
                  <TouchableOpacity key={color} style={[styles.swatch, { backgroundColor: color }, day.color === color && styles.swatchActive]} onPress={() => updateProgramDay(program.id, day.id, { color })} activeOpacity={0.85}>
                    {day.color === color && <Feather name="check" size={14} color="#12161d" />}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={styles.catalogCard}>
          <SectionHeader
            eyebrow="Exercise Catalog"
            title={catalogState.sync.lastSuccessfulSyncAt ? 'Catalog synced and ready' : 'Catalog needs a refresh'}
            detail={
              catalogState.sync.lastSuccessfulSyncAt
                ? `Ready with ${catalogState.exercises.length} exercises`
                : 'Refresh WGER to unlock search and assignment'
            }
            action={
              <TouchableOpacity
                style={styles.inlineAction}
                onPress={() => refreshCatalog({ force: true })}
                disabled={catalogState.sync.status === 'syncing'}
                activeOpacity={0.85}
              >
                <Feather name="refresh-cw" size={14} color={catalogState.sync.status === 'syncing' ? Colors.text3 : Colors.text2} />
                <Text style={[styles.inlineActionText, catalogState.sync.status === 'syncing' && styles.inlineActionTextDisabled]}>
                  {catalogState.sync.status === 'syncing' ? 'Syncing' : 'Refresh'}
                </Text>
              </TouchableOpacity>
            }
          />
          {!!catalogState.sync.error && <Text style={styles.warningText}>{catalogState.sync.error}</Text>}
        </View>

        <View style={styles.slotsCard}>
          <SectionHeader
            eyebrow="Day Exercises"
            title={day.rest ? 'Recovery day' : `${slots.length} exercise${slots.length === 1 ? '' : 's'} ready to edit`}
            detail={day.rest ? 'Turn rest mode off to edit exercise details again.' : 'Tap an exercise to expand its full editor.'}
            action={
              !day.rest ? (
                <TouchableOpacity style={styles.primaryInlineAction} onPress={handleAddSlot} activeOpacity={0.85}>
                  <Feather name="plus" size={14} color="#12161d" />
                  <Text style={styles.primaryInlineActionText}>Add Exercise</Text>
                </TouchableOpacity>
              ) : undefined
            }
          />

          {day.rest ? (
            <View style={styles.recoveryPanel}>
              <View style={styles.recoveryIcon}>
                <Feather name="moon" size={18} color={Colors.orange} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.recoveryTitle}>This day is currently a recovery day.</Text>
                <Text style={styles.recoveryText}>
                  {slots.length > 0
                    ? `${slots.length} saved exercise${slots.length === 1 ? '' : 's'} are preserved and will reappear when you turn rest mode off.`
                    : 'No exercise actions are shown while recovery mode is on.'}
                </Text>
              </View>
            </View>
          ) : slots.length === 0 ? (
            <TouchableOpacity style={styles.emptyState} onPress={handleAddSlot} activeOpacity={0.85}>
              <View style={styles.emptyStateIcon}>
                <Feather name="plus" size={18} color="#12161d" />
              </View>
              <Text style={styles.emptyStateTitle}>Add your first exercise</Text>
              <Text style={styles.emptyStateText}>Create an exercise and tune its prescription without the old wall of controls.</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.slotList}>
              {slots.map((slot, index) => {
                const isExpanded = expandedSlotId === slot.id;
                const isWger = slot.exerciseSource === 'wger';
                const isFirst = index === 0;
                const isLast = index === slots.length - 1;
                const muscleSummary = summarizeMuscles(slot.primaryMuscles, slot.secondaryMuscles, slot.muscleGroups);

                return (
                  <View key={slot.id} style={styles.slotCard}>
                    <TouchableOpacity style={styles.slotSummary} onPress={() => toggleSlot(slot.id)} activeOpacity={0.88}>
                      <View style={styles.slotSummaryHeader}>
                        <View style={styles.slotSummaryMain}>
                          <Text style={styles.slotNumber}>Exercise {index + 1}</Text>
                          <Text style={styles.slotName}>{slot.exerciseName}</Text>
                          <Text style={styles.slotSupport} numberOfLines={1}>
                            {isWger ? slot.exerciseCategoryName ?? 'WGER exercise' : muscleSummary}
                          </Text>
                        </View>

                        <View style={styles.slotSummaryActions}>
                          <View style={styles.reorderStack}>
                            <TouchableOpacity style={[styles.reorderButton, isFirst && styles.reorderButtonDisabled]} onPress={() => moveProgramSlot(program.id, slot.id, 'up')} disabled={isFirst} activeOpacity={0.85}>
                              <Feather name="arrow-up" size={14} color={isFirst ? Colors.text3 : Colors.text2} />
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.reorderButton, isLast && styles.reorderButtonDisabled]} onPress={() => moveProgramSlot(program.id, slot.id, 'down')} disabled={isLast} activeOpacity={0.85}>
                              <Feather name="arrow-down" size={14} color={isLast ? Colors.text3 : Colors.text2} />
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity style={styles.expandButton} onPress={() => toggleSlot(slot.id)} activeOpacity={0.85}>
                            <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.text2} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={styles.slotMetaRow}>
                        <ToneBadge label={isWger ? 'WGER' : 'Manual'} tone={isWger ? 'live' : 'neutral'} />
                        <ToneBadge label={`${slot.sets} sets`} tone="neutral" />
                        <ToneBadge label={`${slot.repRange[0]}-${slot.repRange[1]} reps`} tone="neutral" />
                        <ToneBadge label={`${slot.restSeconds}s rest`} tone="neutral" />
                      </View>

                      <View style={styles.slotMetaRow}>
                        <ToneBadge label={slot.failure ? 'To Failure' : '1-2 RIR'} tone="accent" />
                        {slot.strengthSignalKey ? <ToneBadge label={STRENGTH_LIFT_CONFIG[slot.strengthSignalKey].label} tone="neutral" /> : null}
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.slotExpanded}>
                        <View style={styles.editorSection}>
                          <Text style={styles.editorSectionTitle}>Assignment</Text>
                          <View style={styles.assignmentCard}>
                            {slot.exerciseImageUrl ? (
                              <Image source={{ uri: slot.exerciseImageUrl }} style={styles.thumb} contentFit="cover" />
                            ) : (
                              <View style={styles.thumbFallback}>
                                <Feather name="activity" size={18} color={Colors.text3} />
                              </View>
                            )}
                            <View style={{ flex: 1 }}>
                              <Text style={styles.assignmentName}>{slot.exerciseName}</Text>
                              <Text style={styles.assignmentMeta}>{slot.exerciseCategoryName ?? (isWger ? 'WGER exercise' : 'Manual exercise')}</Text>
                              <Text style={styles.assignmentMeta}>{muscleSummary}</Text>
                            </View>
                          </View>

                          <View style={styles.twoCol}>
                            <TouchableOpacity
                              style={styles.primarySplitAction}
                              onPress={() => {
                                setPickerSlotId(slot.id);
                                setPickerQuery('');
                              }}
                              activeOpacity={0.85}
                            >
                              <Feather name="search" size={14} color="#12161d" />
                              <Text style={styles.primarySplitActionText}>Change Exercise</Text>
                            </TouchableOpacity>
                            {isWger ? (
                              <TouchableOpacity style={styles.secondarySplitAction} onPress={() => clearProgramCatalogAssignment(program.id, slot.id)} activeOpacity={0.85}>
                                <Feather name="edit-3" size={14} color={Colors.text2} />
                                <Text style={styles.secondarySplitActionText}>Use Manual</Text>
                              </TouchableOpacity>
                            ) : (
                              <View style={{ flex: 1 }} />
                            )}
                          </View>

                          {!isWger && (
                            <>
                              <Text style={styles.fieldLabel}>Manual Exercise Name</Text>
                              <TextInput style={styles.input} value={slot.exerciseName} onChangeText={exerciseName => updateProgramSlot(program.id, slot.id, { exerciseName })} placeholder="Exercise name" placeholderTextColor={Colors.text3} />
                            </>
                          )}
                        </View>

                        <View style={styles.editorSection}>
                          <Text style={styles.editorSectionTitle}>Prescription</Text>
                          <View style={styles.stepperGrid}>
                            <LargeStepper label="Sets" value={slot.sets} onDec={() => updateProgramSlot(program.id, slot.id, { sets: Math.max(1, slot.sets - 1) })} onInc={() => updateProgramSlot(program.id, slot.id, { sets: slot.sets + 1 })} />
                            <LargeStepper label="Rest" value={`${slot.restSeconds}s`} onDec={() => updateProgramSlot(program.id, slot.id, { restSeconds: Math.max(0, slot.restSeconds - 15) })} onInc={() => updateProgramSlot(program.id, slot.id, { restSeconds: slot.restSeconds + 15 })} />
                            <LargeStepper label="Rep Min" value={slot.repRange[0]} onDec={() => updateProgramSlot(program.id, slot.id, { repRange: [Math.max(1, slot.repRange[0] - 1), slot.repRange[1]] })} onInc={() => updateProgramSlot(program.id, slot.id, { repRange: [slot.repRange[0] + 1, Math.max(slot.repRange[1], slot.repRange[0] + 1)] })} />
                            <LargeStepper label="Rep Max" value={slot.repRange[1]} onDec={() => updateProgramSlot(program.id, slot.id, { repRange: [slot.repRange[0], Math.max(slot.repRange[0], slot.repRange[1] - 1)] })} onInc={() => updateProgramSlot(program.id, slot.id, { repRange: [slot.repRange[0], slot.repRange[1] + 1] })} />
                          </View>
                        </View>

                        <View style={styles.editorSection}>
                          <Text style={styles.editorSectionTitle}>Progression</Text>
                          <View style={styles.readOnlyCard}>
                            <Text style={styles.readOnlyText}>Double progression. Build reps inside the range, then add weight when you own the top end.</Text>
                          </View>
                          <View style={styles.stepperGrid}>
                            <LargeStepper label="Load Step" value={`${slot.loadStep} lbs`} onDec={() => updateProgramSlot(program.id, slot.id, { loadStep: Math.max(1, slot.loadStep - 1) })} onInc={() => updateProgramSlot(program.id, slot.id, { loadStep: slot.loadStep + 1 })} />
                            <LargeStepper label="Stall After" value={`${slot.stallThreshold}x`} onDec={() => updateProgramSlot(program.id, slot.id, { stallThreshold: Math.max(2, slot.stallThreshold - 1) })} onInc={() => updateProgramSlot(program.id, slot.id, { stallThreshold: slot.stallThreshold + 1 })} />
                            <LargeStepper label="Min Sessions" value={slot.minSessionsBeforeStall} onDec={() => updateProgramSlot(program.id, slot.id, { minSessionsBeforeStall: Math.max(2, slot.minSessionsBeforeStall - 1) })} onInc={() => updateProgramSlot(program.id, slot.id, { minSessionsBeforeStall: slot.minSessionsBeforeStall + 1 })} />
                            <LargeStepper label="Deload %" value={`${Math.round(slot.deloadFactor * 100)}%`} onDec={() => updateProgramSlot(program.id, slot.id, { deloadFactor: Math.max(0.7, Math.round((slot.deloadFactor - 0.05) * 100) / 100) })} onInc={() => updateProgramSlot(program.id, slot.id, { deloadFactor: Math.min(0.95, Math.round((slot.deloadFactor + 0.05) * 100) / 100) })} />
                          </View>
                        </View>

                        <View style={styles.editorSection}>
                          <Text style={styles.editorSectionTitle}>Training Style</Text>
                          <Text style={styles.fieldLabel}>Effort Target</Text>
                          <View style={styles.segmentedControl}>
                            <TouchableOpacity style={[styles.segment, !slot.failure && styles.segmentActive]} onPress={() => updateProgramSlot(program.id, slot.id, { failure: false })} activeOpacity={0.85}>
                              <Text style={[styles.segmentText, !slot.failure && styles.segmentTextActive]}>1-2 RIR</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.segment, slot.failure && styles.segmentActive]} onPress={() => updateProgramSlot(program.id, slot.id, { failure: true })} activeOpacity={0.85}>
                              <Text style={[styles.segmentText, slot.failure && styles.segmentTextActive]}>To Failure</Text>
                            </TouchableOpacity>
                          </View>

                          <Text style={styles.fieldLabel}>Muscle Groups</Text>
                          {isWger ? (
                            <View style={styles.readOnlyCard}>
                              <Text style={styles.readOnlyText}>{muscleSummary}</Text>
                            </View>
                          ) : (
                            <TextInput style={styles.input} value={slot.muscleGroups.join(', ')} onChangeText={text => updateMuscles(slot.id, text)} placeholder="Shoulders, Upper Chest" placeholderTextColor={Colors.text3} />
                          )}

                          <Text style={styles.fieldLabel}>Strength Signal</Text>
                          <View style={styles.wrap}>
                            <TouchableOpacity style={[styles.chip, slot.strengthSignalKey === null && styles.chipActive]} onPress={() => updateProgramSlot(program.id, slot.id, { strengthSignalKey: null })} activeOpacity={0.85}>
                              <Text style={[styles.chipText, slot.strengthSignalKey === null && styles.chipTextActive]}>None</Text>
                            </TouchableOpacity>
                            {STRENGTH_LIFT_ORDER.map(signalKey => (
                              <TouchableOpacity key={signalKey} style={[styles.chip, slot.strengthSignalKey === signalKey && styles.chipActive]} onPress={() => updateProgramSlot(program.id, slot.id, { strengthSignalKey: signalKey as StrengthLiftKey })} activeOpacity={0.85}>
                                <Text style={[styles.chipText, slot.strengthSignalKey === signalKey && styles.chipTextActive]}>{STRENGTH_LIFT_CONFIG[signalKey].label}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>

                        <View style={styles.editorSection}>
                          <Text style={styles.editorSectionTitle}>Notes and Actions</Text>
                          <Text style={styles.fieldLabel}>Notes</Text>
                          <TextInput style={[styles.input, styles.textarea]} value={slot.note} onChangeText={note => updateProgramSlot(program.id, slot.id, { note })} placeholder="Programming notes for this exercise" placeholderTextColor={Colors.text3} multiline textAlignVertical="top" />

                          <View style={styles.twoCol}>
                            <TouchableOpacity style={styles.secondarySplitAction} onPress={() => handleDuplicateSlot(slot.id)} activeOpacity={0.85}>
                              <Feather name="copy" size={14} color={Colors.text2} />
                              <Text style={styles.secondarySplitActionText}>Duplicate</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.dangerSplitAction} onPress={() => handleDeleteSlot(slot.id, slot.exerciseName)} activeOpacity={0.85}>
                              <Feather name="trash-2" size={14} color={Colors.red} />
                              <Text style={styles.dangerSplitActionText}>Delete</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={!!activeSlot} animationType="slide" onRequestClose={() => setPickerSlotId(null)}>
        <View style={[styles.container, { paddingTop: topPad }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setPickerSlotId(null)} activeOpacity={0.85}>
              <Feather name="arrow-left" size={18} color={Colors.text} />
            </TouchableOpacity>
            <View style={styles.headerCopy}>
              <Text style={styles.headerEyebrow}>Exercise Picker</Text>
              <Text style={styles.headerTitle}>{activeSlot?.exerciseName ?? 'Choose Exercise'}</Text>
              <Text style={styles.headerSubtitle}>Search by name, alias, muscle, or equipment.</Text>
            </View>
            <TouchableOpacity style={styles.headerAccentBtn} onPress={() => refreshCatalog({ force: true })} disabled={catalogState.sync.status === 'syncing'} activeOpacity={0.85}>
              <Feather name="refresh-cw" size={16} color="#12161d" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: bottomPad + 80 }} keyboardShouldPersistTaps="handled">
            <View style={styles.pickerSearchCard}>
              <Text style={styles.fieldLabel}>Search</Text>
              <TextInput style={[styles.input, styles.pickerSearchInput]} value={pickerQuery} onChangeText={setPickerQuery} placeholder="Bench press, incline cable, rear delt..." placeholderTextColor={Colors.text3} />
              <Text style={styles.pickerHint}>Loose matching is enabled, so partial and out-of-order searches should still find useful results.</Text>
            </View>

            <View style={styles.pickerResultsCard}>
              <SectionHeader
                eyebrow="Results"
                title={`${results.length} shown`}
                detail="Tap any exercise to assign it to the active exercise."
                action={
                  activeSlot?.exerciseSource === 'wger' ? (
                    <TouchableOpacity
                      style={styles.inlineAction}
                      onPress={() => {
                        if (activeSlot) clearProgramCatalogAssignment(program.id, activeSlot.id);
                        setPickerSlotId(null);
                      }}
                      activeOpacity={0.85}
                    >
                      <Feather name="edit-3" size={14} color={Colors.text2} />
                      <Text style={styles.inlineActionText}>Use Manual</Text>
                    </TouchableOpacity>
                  ) : undefined
                }
              />

              {results.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyStateIcon}>
                    <Feather name="search" size={18} color="#12161d" />
                  </View>
                  <Text style={styles.emptyStateTitle}>No matches yet</Text>
                  <Text style={styles.emptyStateText}>Try a shorter search or a more general muscle or equipment term.</Text>
                </View>
              ) : (
                <View style={styles.resultList}>
                  {results.map(exercise => (
                    <TouchableOpacity
                      key={exercise.wgerId}
                      style={styles.resultCard}
                      onPress={() => {
                        if (activeSlot) assignProgramCatalogExercise(program.id, activeSlot.id, exercise);
                        setPickerSlotId(null);
                      }}
                      activeOpacity={0.88}
                    >
                      {exercise.imageUrls[0] ? (
                        <Image source={{ uri: exercise.imageUrls[0] }} style={styles.resultThumb} contentFit="cover" />
                      ) : (
                        <View style={styles.thumbFallback}>
                          <Feather name="image" size={18} color={Colors.text3} />
                        </View>
                      )}
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={styles.assignmentName}>{exercise.name}</Text>
                        <Text style={styles.assignmentMeta}>{[exercise.category?.name, exercise.equipment.map(item => item.name).join(', ')].filter(Boolean).join(' | ')}</Text>
                        <Text style={styles.assignmentMeta}>{exerciseMuscles(exercise)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  notFoundCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  notFoundTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.text },
  notFoundText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: Colors.text2, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14 },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAccentBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: { flex: 1, gap: 4 },
  headerEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  headerEyebrow: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 25, color: Colors.text, lineHeight: 30 },
  headerSubtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.text2, lineHeight: 18 },
  scroll: { flex: 1, paddingHorizontal: 16 },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 24,
    padding: 18,
    gap: 16,
    marginBottom: 14,
  },
  catalogCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 22,
    padding: 18,
    gap: 10,
    marginBottom: 14,
  },
  slotsCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  sectionEyebrow: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.text, lineHeight: 28 },
  sectionDetail: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text2, lineHeight: 19 },
  sectionToggle: {
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sectionToggleText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.text2 },
  summaryMetaRow: { flexDirection: 'row', gap: 10 },
  summaryMetaCard: {
    flex: 1,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  summaryMetaLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  summaryMetaValue: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.text2 },
  colorPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  colorPreview: { width: 18, height: 18, borderRadius: 9 },
  protocolSummary: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  protocolSummaryText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.text2, lineHeight: 18 },
  settingsPanel: { gap: 12, paddingTop: 4 },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Colors.text2,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
  },
  textarea: { minHeight: 96, paddingTop: 14 },
  twoCol: { flexDirection: 'row', gap: 10 },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 14,
  },
  toggleTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: Colors.text },
  toggleText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.text2, marginTop: 2, lineHeight: 18 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: { borderColor: Colors.text },
  inlineAction: {
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  inlineActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.text2 },
  inlineActionTextDisabled: { color: Colors.text3 },
  primaryInlineAction: {
    minHeight: 40,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryInlineActionText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#12161d' },
  warningText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.orange },
  recoveryPanel: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: Colors.warningBg,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    borderRadius: 18,
    padding: 16,
  },
  recoveryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,159,82,0.18)',
  },
  recoveryTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.text, lineHeight: 20 },
  recoveryText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text2, lineHeight: 19, marginTop: 4 },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 20,
    backgroundColor: Colors.surface2,
    paddingVertical: 28,
    paddingHorizontal: 18,
  },
  emptyStateIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: Colors.text, textAlign: 'center' },
  emptyStateText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text2, textAlign: 'center', lineHeight: 19 },
  slotList: { gap: 12 },
  slotCard: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 22,
    overflow: 'hidden',
  },
  slotSummary: { padding: 16, gap: 12 },
  slotSummaryHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  slotSummaryMain: { flex: 1, gap: 4 },
  slotNumber: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  slotName: { fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.text, lineHeight: 24 },
  slotSupport: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.text2, lineHeight: 18 },
  slotSummaryActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  reorderStack: { gap: 8 },
  reorderButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderButtonDisabled: { opacity: 0.5 },
  expandButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface3,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillLive: { backgroundColor: Colors.infoBg, borderColor: Colors.infoBorder },
  pillRest: { backgroundColor: Colors.warningBg, borderColor: Colors.warningBorder },
  pillAccent: { backgroundColor: Colors.accentBg, borderColor: 'rgba(232,255,71,0.36)' },
  pillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.text2,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  pillTextLive: { color: Colors.blue },
  pillTextRest: { color: Colors.orange },
  pillTextAccent: { color: Colors.accent },
  slotExpanded: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  editorSection: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  editorSectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: Colors.text },
  assignmentCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 12,
  },
  thumb: { width: 72, height: 72, borderRadius: 14, backgroundColor: Colors.surface3 },
  thumbFallback: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignmentName: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.text, lineHeight: 20 },
  assignmentMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.text2, lineHeight: 18 },
  primarySplitAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  primarySplitActionText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#12161d' },
  secondarySplitAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  secondarySplitActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.text2 },
  dangerSplitAction: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dangerBorder,
    backgroundColor: Colors.dangerBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  dangerSplitActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.red },
  stepperGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stepperCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 12,
    gap: 12,
  },
  stepperLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  stepperControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  stepperButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { flex: 1, textAlign: 'center', fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.text },
  readOnlyCard: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 12,
  },
  readOnlyText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.text2, lineHeight: 18 },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 4,
    gap: 4,
  },
  segment: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  segmentActive: { backgroundColor: Colors.surface4, borderWidth: 1, borderColor: Colors.border2 },
  segmentText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.text3 },
  segmentTextActive: { color: Colors.text },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chipActive: { backgroundColor: Colors.accentBg, borderColor: 'rgba(232,255,71,0.35)' },
  chipText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.text2 },
  chipTextActive: { color: Colors.accent },
  pickerSearchCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 24,
    padding: 18,
    gap: 12,
    marginBottom: 14,
  },
  pickerSearchInput: { minHeight: 54, fontSize: 15 },
  pickerHint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.text2, lineHeight: 18 },
  pickerResultsCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 24,
    padding: 18,
    gap: 12,
  },
  resultList: { gap: 10 },
  resultCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 12,
  },
  resultThumb: { width: 72, height: 72, borderRadius: 14, backgroundColor: Colors.surface3 },
});
