import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useProgram } from '@/context/ProgramContext';
import { useWorkout, type SetLog } from '@/context/WorkoutContext';
import { formatLocalDateKey } from '@/lib/date';

type SessionExercise = { name: string; sets: SetLog[]; slotId: string; sessionId: string };
type DailySession = { id: string; dayId: string; dayName: string; sessionLabel: string; exercises: SessionExercise[] };

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getMonthLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getMonthGrid(monthCursor: Date) {
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const leadingBlankCount = (firstOfMonth.getDay() + 6) % 7;
  const totalDays = lastOfMonth.getDate();
  const cells: Array<Date | null> = [];

  for (let i = 0; i < leadingBlankCount; i += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function formatPrettyDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function getScheduledDayForDate(days: { id: string; name: string; session?: string; rest?: boolean }[], dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  return days.find(day => day.name === dayName) ?? null;
}

function summarizeSet(sets: SetLog[]) {
  if (sets.length === 0) return 'No sets';
  const top = sets.reduce((best, set) => (set.weight * set.reps >= best.weight * best.reps ? set : best), sets[0]);
  return `${sets.length} sets | top ${top.weight} x ${top.reps}`;
}

function EditExerciseModal({
  session,
  exercise,
  onClose,
  onSave,
}: {
  session: DailySession | null;
  exercise: SessionExercise | null;
  onClose: () => void;
  onSave: (sets: SetLog[]) => void;
}) {
  const [draft, setDraft] = useState<Array<{ weight: string; reps: string }>>([]);

  useEffect(() => {
    setDraft(exercise?.sets.map(set => ({ weight: set.weight ? String(set.weight) : '', reps: set.reps ? String(set.reps) : '' })) ?? []);
  }, [exercise]);

  return (
    <Modal visible={!!exercise} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalScrim}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalEyebrow}>Edit Exercise</Text>
              <Text style={styles.modalTitle}>{exercise?.name ?? 'Exercise'}</Text>
              {session ? <Text style={styles.modalSubtitle}>{session.dayName} | {session.sessionLabel}</Text> : null}
            </View>
            <Pressable onPress={onClose} style={styles.iconBtn}>
              <Feather name="x" size={16} color={Colors.text2} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {draft.map((set, index) => (
              <View key={`${exercise?.sessionId ?? 'exercise'}-${index}`} style={styles.editRow}>
                <Text style={styles.editLabel}>Set {index + 1}</Text>
                <View style={styles.editInputs}>
                  <TextInput
                    value={set.weight}
                    onChangeText={value => setDraft(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, weight: value } : item))}
                    keyboardType="decimal-pad"
                    placeholder="Weight"
                    placeholderTextColor={Colors.text3}
                    style={styles.input}
                  />
                  <TextInput
                    value={set.reps}
                    onChangeText={value => setDraft(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, reps: value } : item))}
                    keyboardType="number-pad"
                    placeholder="Reps"
                    placeholderTextColor={Colors.text3}
                    style={styles.input}
                  />
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.modalFooter}>
            <Pressable onPress={onClose} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => onSave(draft.map(set => ({ weight: Number(set.weight) || 0, reps: Number(set.reps) || 0 })))} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { workoutLog, completedWorkouts, updateSession } = useWorkout();
  const { days } = useProgram();
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState(formatLocalDateKey());
  const [editingExercise, setEditingExercise] = useState<SessionExercise | null>(null);
  const [editingSession, setEditingSession] = useState<DailySession | null>(null);
  const [showAddSessionPicker, setShowAddSessionPicker] = useState(false);

  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 14) : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const todayKey = formatLocalDateKey();

  const sessionsByDate = useMemo(() => {
    const map: Record<string, DailySession[]> = {};

    for (const sessions of Object.values(workoutLog)) {
      for (const session of sessions) {
        if (!map[session.date]) map[session.date] = [];
        let bucket = map[session.date].find(item => item.id === session.id);
        if (!bucket) {
          bucket = {
            id: session.id,
            dayId: session.dayId,
            dayName: session.dayName,
            sessionLabel: session.sessionLabel,
            exercises: [],
          };
          map[session.date].push(bucket);
        }
        bucket.exercises.push({ name: session.exerciseName, sets: session.sets, slotId: session.slotId, sessionId: session.id });
      }
    }

    return map;
  }, [workoutLog]);

  const monthCells = useMemo(() => getMonthGrid(monthCursor), [monthCursor]);
  const selectedSessions = sessionsByDate[selectedDateKey] ?? [];
  const workoutDays = useMemo(() => days.filter(day => !day.rest), [days]);
  const scheduledDay = useMemo(() => getScheduledDayForDate(days, selectedDateKey), [days, selectedDateKey]);
  const canLogSelectedDay = Boolean(scheduledDay && !scheduledDay.rest && selectedSessions.length === 0);
  const canBackfillSelectedDay = selectedSessions.length === 0 && selectedDateKey < todayKey && workoutDays.length > 0;
  const completedDay = days.find(day => day.id === completedWorkouts[selectedDateKey]);
  const selectedStatus = selectedSessions.length > 0
    ? 'Logged'
    : completedDay
      ? 'Marked complete'
      : selectedDateKey < todayKey
        ? 'No workout'
        : selectedDateKey === todayKey
          ? 'Today'
          : 'Upcoming';

  const monthSummary = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    let loggedDays = 0;
    let missedDays = 0;
    let upcomingDays = 0;

    monthCells.forEach(cell => {
      if (!cell) return;
      const key = formatLocalDateKey(cell);
      if ((sessionsByDate[key]?.length ?? 0) > 0 || completedWorkouts[key]) {
        loggedDays += 1;
      } else if (key < todayKey) {
        missedDays += 1;
      } else {
        upcomingDays += 1;
      }
    });

    const inCurrentMonth = new Date().getFullYear() === year && new Date().getMonth() === month;

    return {
      loggedDays,
      missedDays,
      upcomingDays,
      subtitle: inCurrentMonth
        ? 'Your current month at a glance'
        : 'Review your training rhythm by date',
    };
  }, [completedWorkouts, monthCells, monthCursor, sessionsByDate, todayKey]);

  return (
    <View testID="calendar-screen" style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 104 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Training Calendar</Text>
          <Text style={styles.title}>Calendar</Text>
          <Text style={styles.subtitle}>{monthSummary.subtitle}</Text>
        </View>

        <View style={styles.summaryStrip}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Logged</Text>
            <Text style={styles.summaryValue}>{monthSummary.loggedDays}</Text>
            <Text style={styles.summaryCaption}>days this month</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Missed</Text>
            <Text style={styles.summaryValue}>{monthSummary.missedDays}</Text>
            <Text style={styles.summaryCaption}>past days open</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Ahead</Text>
            <Text style={styles.summaryValue}>{monthSummary.upcomingDays}</Text>
            <Text style={styles.summaryCaption}>upcoming dates</Text>
          </View>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.monthHeader}>
            <View>
              <Text style={styles.monthLabel}>{getMonthLabel(monthCursor)}</Text>
              <Text style={styles.monthSub}>Tap a day to review what happened there</Text>
            </View>
            <View style={styles.monthNavGroup}>
              <TouchableOpacity
                style={styles.monthNavBtn}
                onPress={() => setMonthCursor(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              >
                <Feather name="chevron-left" size={18} color={Colors.text2} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.monthNavBtn}
                onPress={() => setMonthCursor(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              >
                <Feather name="chevron-right" size={18} color={Colors.text2} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_LABELS.map(label => (
              <Text key={label} style={styles.weekLabel}>{label}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {monthCells.map((cell, idx) => {
              if (!cell) return <View key={`blank-${idx}`} style={styles.dayCellBlank} />;

              const dateKey = formatLocalDateKey(cell);
              const hasLoggedSession = (sessionsByDate[dateKey]?.length ?? 0) > 0;
              const markedComplete = Boolean(completedWorkouts[dateKey]);
              const isComplete = hasLoggedSession || markedComplete;
              const isSelected = dateKey === selectedDateKey;
              const isToday = dateKey === todayKey;
              const isPast = dateKey < todayKey;
              const isMissed = isPast && !isComplete;

              return (
                <TouchableOpacity
                  key={dateKey}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                    isToday && styles.dayCellToday,
                    isComplete && styles.dayCellComplete,
                    isMissed && styles.dayCellMissed,
                  ]}
                  onPress={() => setSelectedDateKey(dateKey)}
                >
                  <Text
                    style={[
                      styles.dayCellText,
                      isSelected && styles.dayCellTextSelected,
                      isMissed && styles.dayCellTextMissed,
                    ]}
                  >
                    {cell.getDate()}
                  </Text>
                  <View style={styles.dayMarkerRow}>
                    {isToday ? <View style={[styles.dayMarker, styles.todayMarker]} /> : null}
                    {isComplete ? <View style={[styles.dayMarker, styles.completeMarker]} /> : null}
                    {isMissed ? <View style={[styles.dayMarker, styles.missedMarker]} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.detailsCard}>
          <View style={styles.detailsHeader}>
            <View style={styles.detailsCopy}>
              <Text style={styles.detailsLabel}>Selected Day</Text>
              <Text style={styles.selectedDate}>{formatPrettyDate(selectedDateKey)}</Text>
            </View>
            <View
              style={[
                styles.statusPill,
                selectedStatus === 'Logged' && styles.statusPillSuccess,
                selectedStatus === 'Marked complete' && styles.statusPillInfo,
                selectedStatus === 'No workout' && styles.statusPillDanger,
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  selectedStatus === 'Logged' && styles.statusPillTextSuccess,
                  selectedStatus === 'Marked complete' && styles.statusPillTextInfo,
                  selectedStatus === 'No workout' && styles.statusPillTextDanger,
                ]}
              >
                {selectedStatus}
              </Text>
            </View>
          </View>

          {selectedSessions.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather
                name={completedDay ? 'check-circle' : selectedDateKey < todayKey ? 'slash' : 'calendar'}
                size={18}
                color={completedDay ? Colors.green : selectedDateKey < todayKey ? Colors.red : Colors.text3}
              />
              <View style={styles.emptyCopy}>
                <Text style={styles.emptyTitle}>
                  {completedDay
                    ? completedDay.session
                    : selectedDateKey < todayKey
                      ? 'No workout logged'
                      : 'Nothing scheduled yet'}
                </Text>
                <Text style={styles.emptyText}>
                  {completedDay
                    ? 'This day was marked complete even though no detailed set log was saved.'
                    : selectedDateKey < todayKey
                      ? 'Use this view to spot holes in your training rhythm and keep future weeks cleaner.'
                      : 'Upcoming dates will fill in as you keep logging training.'}
                </Text>
                {canLogSelectedDay ? (
                  <Pressable
                    onPress={() => {
                      if (!scheduledDay) return;
                      router.push({ pathname: '/workout/[dayId]', params: { dayId: scheduledDay.id, date: selectedDateKey } });
                    }}
                    style={styles.logWorkoutBtn}
                  >
                    <Feather name="plus-circle" size={14} color={Colors.accent} />
                    <Text style={styles.logWorkoutBtnText}>Log {scheduledDay?.session ?? 'workout'}</Text>
                  </Pressable>
                ) : null}
                {canBackfillSelectedDay ? (
                  <Pressable
                    onPress={() => setShowAddSessionPicker(true)}
                    style={styles.backfillBtn}
                  >
                    <Feather name="clock" size={14} color={Colors.text} />
                    <Text style={styles.backfillBtnText}>Add a session to this date</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.sessionList}>
              {selectedSessions.map(session => (
                <View key={session.id} style={styles.sessionItem}>
                  <View style={styles.sessionHeader}>
                    <View style={styles.sessionTitleCopy}>
                      <Text style={styles.sessionTitle}>{session.dayName}</Text>
                      <Text style={styles.sessionSubtitle}>{session.sessionLabel}</Text>
                    </View>
                    <View style={styles.sessionBadge}>
                      <Text style={styles.sessionBadgeText}>{session.exercises.length} exercises</Text>
                    </View>
                  </View>

                  {session.exercises.map((exercise, idx) => (
                    <View key={`${session.id}-${exercise.name}-${idx}`} style={styles.exerciseRow}>
                      <View style={styles.exerciseCopy}>
                        <Text style={styles.exerciseName}>{exercise.name}</Text>
                        <Text style={styles.exerciseMeta}>{summarizeSet(exercise.sets)}</Text>
                      </View>
                      <View style={styles.exerciseActions}>
                        <Pressable
                          onPress={() => {
                            setEditingSession(session);
                            setEditingExercise(exercise);
                          }}
                          style={styles.exerciseActionBtn}
                        >
                          <Feather name="edit-3" size={14} color={Colors.text2} />
                          <Text style={styles.exerciseActionText}>Edit</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => router.push({ pathname: '/progress', params: { slotId: exercise.slotId } })}
                          style={styles.exerciseActionBtn}
                        >
                          <Feather name="trending-up" size={14} color={Colors.accent} />
                          <Text style={styles.exerciseActionText}>Progress</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <EditExerciseModal
        session={editingSession}
        exercise={editingExercise}
        onClose={() => {
          setEditingExercise(null);
          setEditingSession(null);
        }}
        onSave={sets => {
          if (!editingExercise) return;
          updateSession(editingExercise.slotId, editingExercise.sessionId, sets);
          setEditingExercise(null);
          setEditingSession(null);
        }}
      />

      <Modal visible={showAddSessionPicker} transparent animationType="slide" onRequestClose={() => setShowAddSessionPicker(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>Add Past Session</Text>
                <Text style={styles.modalTitle}>Pick a workout for this date</Text>
                <Text style={styles.modalSubtitle}>{formatPrettyDate(selectedDateKey)}</Text>
              </View>
              <Pressable onPress={() => setShowAddSessionPicker(false)} style={styles.iconBtn}>
                <Feather name="x" size={16} color={Colors.text2} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              {workoutDays.map(day => (
                <Pressable
                  key={day.id}
                  onPress={() => {
                    setShowAddSessionPicker(false);
                    router.push({ pathname: '/workout/[dayId]', params: { dayId: day.id, date: selectedDateKey } });
                  }}
                  style={styles.sessionPickerRow}
                >
                  <View style={[styles.sessionPickerAccent, { backgroundColor: day.color }]} />
                  <View style={styles.sessionPickerCopy}>
                    <Text style={styles.sessionPickerTitle}>{day.session}</Text>
                    <Text style={styles.sessionPickerMeta}>{day.name} | {day.tag}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={Colors.text3} />
                </Pressable>
              ))}
            </ScrollView>
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
  scroll: {
    flex: 1,
  },
  content: {
    padding: 14,
    gap: 14,
  },
  header: {
    gap: 4,
    paddingHorizontal: 4,
  },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 30,
    color: Colors.text,
  },
  subtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 19,
  },
  summaryStrip: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  summaryLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: Colors.text,
  },
  summaryCaption: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
  },
  calendarCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 24,
    padding: 16,
    gap: 14,
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
  },
  monthLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: Colors.text,
  },
  monthSub: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
    marginTop: 4,
  },
  monthNavGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  monthNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayCellBlank: {
    width: '13.6%',
    aspectRatio: 0.92,
  },
  dayCell: {
    width: '13.6%',
    aspectRatio: 0.92,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    paddingTop: 10,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayCellSelected: {
    backgroundColor: Colors.surface3,
    borderColor: Colors.accentDim,
  },
  dayCellToday: {
    borderColor: Colors.blue,
  },
  dayCellComplete: {
    borderColor: Colors.successBorder,
  },
  dayCellMissed: {
    borderColor: Colors.dangerBorder,
  },
  dayCellText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: Colors.text2,
  },
  dayCellTextSelected: {
    color: Colors.text,
  },
  dayCellTextMissed: {
    color: '#f1adb0',
  },
  dayMarkerRow: {
    flexDirection: 'row',
    gap: 4,
    minHeight: 8,
    alignItems: 'center',
  },
  dayMarker: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  todayMarker: {
    backgroundColor: Colors.blue,
  },
  completeMarker: {
    backgroundColor: Colors.green,
  },
  missedMarker: {
    backgroundColor: Colors.red,
  },
  detailsCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 24,
    padding: 16,
    gap: 16,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  detailsCopy: {
    flex: 1,
    gap: 6,
  },
  detailsLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  selectedDate: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.text,
    lineHeight: 28,
  },
  statusPill: {
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border2,
    justifyContent: 'center',
  },
  statusPillSuccess: {
    backgroundColor: Colors.successBg,
    borderColor: Colors.successBorder,
  },
  statusPillInfo: {
    backgroundColor: Colors.infoBg,
    borderColor: Colors.infoBorder,
  },
  statusPillDanger: {
    backgroundColor: Colors.dangerBg,
    borderColor: Colors.dangerBorder,
  },
  statusPillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.text2,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statusPillTextSuccess: {
    color: Colors.green,
  },
  statusPillTextInfo: {
    color: Colors.blue,
  },
  statusPillTextDanger: {
    color: Colors.red,
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 14,
  },
  emptyCopy: {
    flex: 1,
    gap: 4,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.text,
  },
  emptyText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 19,
  },
  logWorkoutBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.accentDim,
    backgroundColor: Colors.accentBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  logWorkoutBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: Colors.text,
  },
  backfillBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border2,
    backgroundColor: Colors.surface3,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backfillBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: Colors.text,
  },
  sessionList: {
    gap: 12,
  },
  sessionItem: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  sessionTitleCopy: {
    flex: 1,
    gap: 4,
  },
  sessionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.text,
  },
  sessionSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
  },
  sessionBadge: {
    minHeight: 30,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border2,
    justifyContent: 'center',
  },
  sessionBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.text2,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  exerciseRow: {
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  exerciseCopy: {
    gap: 4,
  },
  exerciseName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  exerciseMeta: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
  },
  exerciseActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  exerciseActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface3,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  exerciseActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: Colors.text2,
  },
  modalScrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(7,9,14,0.72)',
  },
  modalCard: {
    maxHeight: '82%',
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    gap: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  modalEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.text,
    marginTop: 4,
  },
  modalSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
    marginTop: 4,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalBody: {
    gap: 12,
    paddingBottom: 4,
  },
  sessionPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 14,
  },
  sessionPickerAccent: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 999,
  },
  sessionPickerCopy: {
    flex: 1,
    gap: 4,
  },
  sessionPickerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.text,
  },
  sessionPickerMeta: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
  },
  editRow: {
    gap: 8,
  },
  editLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: Colors.text2,
  },
  editInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: Colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: Colors.text2,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: '#12161d',
  },
});
