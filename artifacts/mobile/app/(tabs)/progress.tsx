import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { DAYS } from '@/constants/workoutData';
import { useWorkout } from '@/context/WorkoutContext';
import type { SessionLog } from '@/context/WorkoutContext';

const allExercises = DAYS.flatMap(d => {
  if (!d.exercises) return [];
  return d.exercises.map((ex, idx) => ({ ...ex, dayId: d.id, exIdx: idx }));
}).reduce<typeof allExercisesRaw>((acc, ex) => {
  if (!acc.find(e => e.name === ex.name)) acc.push(ex);
  return acc;
}, []);

type ExerciseEntry = {
  name: string;
  dayId: string;
  exIdx: number;
  muscleGroups: string[];
  sets: number;
  repRange: [number, number];
  rest: number;
  failure: boolean;
  note: string;
};

const allExercisesRaw: ExerciseEntry[] = [];

const exercises: ExerciseEntry[] = DAYS.flatMap(d => {
  if (!d.exercises) return [] as ExerciseEntry[];
  return d.exercises.map((ex, idx) => ({ ...ex, dayId: d.id, exIdx: idx }));
}).reduce<ExerciseEntry[]>((acc, ex) => {
  if (!acc.find(e => e.name === ex.name)) acc.push(ex);
  return acc;
}, []);

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function MiniChart({ data }: { data: { date: string; value: number }[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data.map(d => d.value));
  const min = Math.min(...data.map(d => d.value));
  const range = max - min || 1;
  const width = 280;
  const height = 80;
  const pad = 8;
  const chartW = width - pad * 2;
  const chartH = height - pad * 2;

  const points = data.map((d, i) => {
    const x = pad + (i / (data.length - 1)) * chartW;
    const y = pad + chartH - ((d.value - min) / range) * chartH;
    return { x, y, value: d.value, date: d.date };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <View style={chartStyles.container}>
      <View style={chartStyles.yLabels}>
        <Text style={chartStyles.axisLabel}>{Math.round(max)}</Text>
        <Text style={chartStyles.axisLabel}>{Math.round(min)}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width, height }}>
          {/* Grid lines */}
          {[0, 0.5, 1].map((t, i) => (
            <View
              key={i}
              style={[chartStyles.gridLine, { top: pad + t * chartH }]}
            />
          ))}
          {/* SVG-like path using Views */}
          {points.slice(1).map((point, i) => {
            const prev = points[i];
            const dx = point.x - prev.x;
            const dy = point.y - prev.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            return (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: prev.x,
                  top: prev.y - 1,
                  width: len,
                  height: 2,
                  backgroundColor: Colors.accent,
                  transformOrigin: 'left center',
                  transform: [{ rotate: `${angle}deg` }],
                }}
              />
            );
          })}
          {/* Dots */}
          {points.map((p, i) => (
            <View
              key={i}
              style={[chartStyles.dot, { left: p.x - 4, top: p.y - 4 }]}
            />
          ))}
          {/* X axis labels */}
          {points.filter((_, i) => i === 0 || i === points.length - 1).map((p, i) => (
            <Text
              key={i}
              style={[chartStyles.xLabel, { left: p.x - 20 }]}
            >
              {formatDate(p.date)}
            </Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  yLabels: {
    width: 36,
    justifyContent: 'space-between',
    height: 80,
    paddingVertical: 8,
  },
  axisLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: Colors.text3,
    textAlign: 'right',
  },
  gridLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 1,
    backgroundColor: Colors.border,
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: Colors.bg,
  },
  xLabel: {
    position: 'absolute',
    bottom: 0,
    width: 40,
    fontFamily: 'Inter_400Regular',
    fontSize: 8,
    color: Colors.text3,
    textAlign: 'center',
  },
});

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { workoutLog } = useWorkout();
  const [selectedEx, setSelectedEx] = useState(0);
  const [showPicker, setShowPicker] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const exercisesWithData = useMemo(() => {
    return exercises.filter(ex => {
      const key = `${ex.dayId}_${ex.exIdx}`;
      return workoutLog[key] && workoutLog[key].length > 0;
    });
  }, [workoutLog]);

  const currentEx = exercisesWithData[selectedEx];

  const chartData = useMemo(() => {
    if (!currentEx) return [];
    const key = `${currentEx.dayId}_${currentEx.exIdx}`;
    const sessions: SessionLog[] = workoutLog[key] || [];
    return sessions.map(s => ({
      date: s.date,
      value: Math.max(...s.sets.map(st => st.weight || 0)),
    })).filter(d => d.value > 0).slice(-10);
  }, [currentEx, workoutLog]);

  const recentSessions: SessionLog[] = useMemo(() => {
    if (!currentEx) return [];
    const key = `${currentEx.dayId}_${currentEx.exIdx}`;
    return (workoutLog[key] || []).slice().reverse().slice(0, 5);
  }, [currentEx, workoutLog]);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Progress</Text>
      </View>

      {exercisesWithData.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="trending-up" size={40} color={Colors.text3} />
          <Text style={styles.emptyTitle}>No data yet</Text>
          <Text style={styles.emptySub}>Log your first workout to see progress</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: bottomPad + 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Exercise Selector */}
          <TouchableOpacity
            style={styles.exSelector}
            onPress={() => setShowPicker(!showPicker)}
          >
            <Text style={styles.exSelectorText}>{currentEx?.name ?? 'Select exercise'}</Text>
            <Feather name={showPicker ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.text2} />
          </TouchableOpacity>

          {showPicker && (
            <View style={styles.picker}>
              {exercisesWithData.map((ex, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.pickerItem, i === selectedEx && styles.pickerItemActive]}
                  onPress={() => { setSelectedEx(i); setShowPicker(false); }}
                >
                  <Text style={[styles.pickerItemText, i === selectedEx && styles.pickerItemTextActive]}>
                    {ex.name}
                  </Text>
                  {i === selectedEx && <Feather name="check" size={14} color={Colors.accent} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Chart */}
          {chartData.length >= 2 && (
            <View style={styles.chartCard}>
              <Text style={styles.sectionLabel}>Max Weight Over Time</Text>
              <MiniChart data={chartData} />
              <View style={styles.chartStats}>
                <View style={styles.chartStat}>
                  <Text style={styles.chartStatVal}>{Math.max(...chartData.map(d => d.value))} lbs</Text>
                  <Text style={styles.chartStatLabel}>All-Time Best</Text>
                </View>
                <View style={styles.chartStatDivider} />
                <View style={styles.chartStat}>
                  <Text style={styles.chartStatVal}>{chartData.length}</Text>
                  <Text style={styles.chartStatLabel}>Sessions</Text>
                </View>
                {chartData.length >= 2 && (
                  <>
                    <View style={styles.chartStatDivider} />
                    <View style={styles.chartStat}>
                      <Text style={[styles.chartStatVal, {
                        color: chartData[chartData.length - 1].value >= chartData[0].value ? Colors.green : Colors.red
                      }]}>
                        {chartData[chartData.length - 1].value >= chartData[0].value ? '+' : ''}
                        {Math.round(chartData[chartData.length - 1].value - chartData[0].value)} lbs
                      </Text>
                      <Text style={styles.chartStatLabel}>Overall</Text>
                    </View>
                  </>
                )}
              </View>
            </View>
          )}

          {/* Recent Sessions */}
          <View style={styles.sessionsCard}>
            <Text style={styles.sectionLabel}>Recent Sessions</Text>
            {recentSessions.map((session, i) => {
              const maxWeight = Math.max(...session.sets.map(s => s.weight || 0));
              const maxReps = Math.max(...session.sets.map(s => s.reps || 0));
              const totalVol = session.sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
              return (
                <View key={i} style={[styles.sessionRow, i < recentSessions.length - 1 && styles.sessionRowBorder]}>
                  <View>
                    <Text style={styles.sessionDate}>{formatDate(session.date)}</Text>
                    <Text style={styles.sessionNote}>{session.sets.length} sets logged</Text>
                  </View>
                  <View style={styles.sessionRight}>
                    <Text style={styles.sessionBest}>{maxWeight} lbs × {maxReps}</Text>
                    <Text style={styles.sessionVol}>{Math.round(totalVol).toLocaleString()} vol</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: Colors.text,
    letterSpacing: 1,
  },
  body: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 40,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.text2,
  },
  emptySub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
  },
  exSelector: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  exSelectorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  picker: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
  },
  pickerItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerItemActive: {
    backgroundColor: Colors.surface2,
  },
  pickerItemText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.text2,
    flex: 1,
  },
  pickerItemTextActive: {
    color: Colors.text,
    fontFamily: 'Inter_500Medium',
  },
  chartCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  sectionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  chartStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  chartStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  chartStatVal: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.text,
  },
  chartStatLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.text3,
  },
  chartStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.border,
  },
  sessionsCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    gap: 0,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  sessionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sessionDate: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
  },
  sessionNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.text3,
    marginTop: 2,
  },
  sessionRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  sessionBest: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  sessionVol: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.green,
  },
});
