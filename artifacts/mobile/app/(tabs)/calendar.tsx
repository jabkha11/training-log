import React, { useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { DAYS } from '@/constants/workoutData';
import { useWorkout, type SetLog } from '@/context/WorkoutContext';
import { formatLocalDateKey } from '@/lib/date';

type SessionExercise = {
  name: string;
  sets: SetLog[];
};

type DailySession = {
  id: string;
  dayId: string;
  dayName: string;
  sessionLabel: string;
  exercises: SessionExercise[];
};

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
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function summarizeSet(sets: SetLog[]) {
  if (sets.length === 0) return 'No sets';
  const top = sets.reduce((best, set) => {
    const currentScore = set.weight * set.reps;
    const bestScore = best.weight * best.reps;
    return currentScore >= bestScore ? set : best;
  }, sets[0]);
  return `${sets.length} sets · top ${top.weight} x ${top.reps}`;
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { workoutLog, completedWorkouts } = useWorkout();
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState(formatLocalDateKey());

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const todayKey = formatLocalDateKey();

  const sessionsByDate = useMemo(() => {
    const map: Record<string, DailySession[]> = {};

    for (const [key, sessions] of Object.entries(workoutLog)) {
      const [dayId, exIdxRaw] = key.split('_');
      const exIdx = Number.parseInt(exIdxRaw ?? '', 10);
      if (!dayId || Number.isNaN(exIdx)) continue;

      const day = DAYS.find(d => d.id === dayId);
      const exercise = day?.exercises?.[exIdx];
      if (!day || !exercise) continue;

      for (const session of sessions) {
        if (!map[session.date]) map[session.date] = [];

        let bucket = map[session.date].find(item => item.id === session.id);
        if (!bucket) {
          bucket = {
            id: session.id,
            dayId,
            dayName: day.name,
            sessionLabel: day.session,
            exercises: [],
          };
          map[session.date].push(bucket);
        }

        bucket.exercises.push({ name: exercise.name, sets: session.sets });
      }
    }

    return map;
  }, [workoutLog]);

  const monthCells = useMemo(() => getMonthGrid(monthCursor), [monthCursor]);

  const selectedSessions = sessionsByDate[selectedDateKey] ?? [];
  const completedDayId = completedWorkouts[selectedDateKey];
  const completedDay = completedDayId ? DAYS.find(day => day.id === completedDayId) : null;

  const goPrevMonth = () => {
    setMonthCursor(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goNextMonth = () => {
    setMonthCursor(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Calendar</Text>
        <Text style={styles.subtitle}>Track workouts by day</Text>
      </View>

      <View style={styles.calendarCard}>
        <View style={styles.monthRow}>
          <TouchableOpacity style={styles.monthNavBtn} onPress={goPrevMonth}>
            <Feather name="chevron-left" size={16} color={Colors.text2} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{getMonthLabel(monthCursor)}</Text>
          <TouchableOpacity style={styles.monthNavBtn} onPress={goNextMonth}>
            <Feather name="chevron-right" size={16} color={Colors.text2} />
          </TouchableOpacity>
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
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selectedDateKey;
            const hasWorkout = (sessionsByDate[dateKey]?.length ?? 0) > 0;
            const isPast = dateKey < todayKey;
            const showMissed = isPast && !hasWorkout;

            return (
              <TouchableOpacity
                key={dateKey}
                style={[
                  styles.dayCell,
                  isSelected && styles.dayCellSelected,
                  isToday && styles.dayCellToday,
                ]}
                onPress={() => setSelectedDateKey(dateKey)}
              >
                <Text style={[styles.dayCellText, isSelected && styles.dayCellTextSelected]}>
                  {cell.getDate()}
                </Text>
                {hasWorkout ? <View style={[styles.statusDot, { backgroundColor: Colors.green }]} /> : null}
                {showMissed ? <View style={[styles.statusDot, { backgroundColor: Colors.red }]} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView
        style={styles.detailsScroll}
        contentContainerStyle={{ paddingBottom: bottomPad + 110 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailsCard}>
          <Text style={styles.sectionLabel}>Selected Date</Text>
          <Text style={styles.selectedDate}>{formatPrettyDate(selectedDateKey)}</Text>

          {selectedSessions.length === 0 ? (
            <Text style={styles.emptyText}>No workout logged for this day.</Text>
          ) : (
            <View style={styles.sessionList}>
              {selectedSessions.map(session => (
                <View key={session.id} style={styles.sessionItem}>
                  <Text style={styles.sessionTitle}>{session.dayName} · {session.sessionLabel}</Text>
                  {session.exercises.map((exercise, idx) => (
                    <View key={`${session.id}-${exercise.name}-${idx}`} style={styles.exerciseRow}>
                      <Text style={styles.exerciseName}>{exercise.name}</Text>
                      <Text style={styles.exerciseMeta}>{summarizeSet(exercise.sets)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          {!selectedSessions.length && completedDay ? (
            <View style={styles.completedHint}>
              <Feather name="check-circle" size={14} color={Colors.green} />
              <Text style={styles.completedHintText}>Marked complete: {completedDay.session}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.text, letterSpacing: 1 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.text3, marginTop: 2 },
  calendarCard: {
    marginHorizontal: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 12,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  monthNavBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  monthLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayCellBlank: { width: '13%', aspectRatio: 1 },
  dayCell: {
    width: '13%',
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayCellSelected: { borderColor: Colors.accent, backgroundColor: 'rgba(232,255,71,0.09)' },
  dayCellToday: { borderColor: Colors.blue },
  dayCellText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.text2 },
  dayCellTextSelected: { color: Colors.text },
  statusDot: {
    position: 'absolute',
    bottom: 4,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  detailsScroll: { flex: 1, marginTop: 12, paddingHorizontal: 16 },
  detailsCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 14,
  },
  sectionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  selectedDate: { fontFamily: 'Inter_700Bold', fontSize: 18, color: Colors.text, marginTop: 6, marginBottom: 10 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text2 },
  sessionList: { gap: 10 },
  sessionItem: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 10,
    gap: 7,
  },
  sessionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.text },
  exerciseRow: { gap: 2 },
  exerciseName: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.text2 },
  exerciseMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.text3 },
  completedHint: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  completedHintText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.green },
});
