import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Svg, {
  Path,
  Circle,
  Line,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { Colors } from '@/constants/colors';
import { DAYS } from '@/constants/workoutData';
import { useWorkout } from '@/context/WorkoutContext';
import type { SessionLog } from '@/context/WorkoutContext';

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

function epley1RM(weight: number, reps: number) {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

type ChartMode = 'weight' | '1rm' | 'volume';

function LineChart({
  data,
  mode,
  width,
}: {
  data: { date: string; maxWeight: number; maxReps: number; volume: number; e1rm: number }[];
  mode: ChartMode;
  width: number;
}) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const values = data.map(d =>
    mode === 'weight' ? d.maxWeight : mode === '1rm' ? d.e1rm : d.volume
  );

  const chartH = 160;
  const padTop = 20;
  const padBottom = 28;
  const padLeft = 44;
  const padRight = 12;
  const chartW = width - padLeft - padRight;
  const plotH = chartH - padTop - padBottom;

  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);
  const range = maxVal - minVal || 1;

  const getX = (i: number) =>
    padLeft + (i / Math.max(data.length - 1, 1)) * chartW;
  const getY = (v: number) =>
    padTop + plotH - ((v - minVal) / range) * plotH;

  const points = data.map((d, i) => ({
    x: getX(i),
    y: getY(values[i]),
    value: values[i],
    date: d.date,
  }));

  // Build smooth bezier path
  const linePath = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1];
    const cpX = (prev.x + p.x) / 2;
    return `${acc} C ${cpX} ${prev.y}, ${cpX} ${p.y}, ${p.x} ${p.y}`;
  }, '');

  // Gradient fill area
  const fillPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x} ${padTop + plotH} L ${points[0].x} ${padTop + plotH} Z`
      : '';

  // Y axis labels (3 ticks)
  const yTicks = [0, 0.5, 1].map(t => ({
    y: padTop + plotH * (1 - t),
    label:
      mode === 'volume'
        ? `${Math.round(minVal + t * range)}`
        : `${Math.round(minVal + t * range)}`,
  }));

  // X axis: show up to 5 labels
  const step = Math.max(1, Math.ceil(data.length / 5));
  const xTicks = data
    .map((d, i) => ({ i, date: d.date }))
    .filter((_, i) => i % step === 0 || i === data.length - 1);

  const isGaining =
    values.length >= 2 && values[values.length - 1] >= values[0];

  const lineColor = isGaining ? Colors.accent : Colors.red;

  const sel = selectedIdx !== null ? points[selectedIdx] : null;

  return (
    <View style={{ position: 'relative' }}>
      <Svg width={width} height={chartH}>
        <Defs>
          <LinearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lineColor} stopOpacity="0.3" />
            <Stop offset="1" stopColor={lineColor} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <Line
            key={i}
            x1={padLeft}
            y1={tick.y}
            x2={width - padRight}
            y2={tick.y}
            stroke={Colors.border}
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}

        {/* Y axis labels */}
        {yTicks.map((tick, i) => (
          <SvgText
            key={i}
            x={padLeft - 6}
            y={tick.y + 4}
            fontSize="9"
            fill={Colors.text3}
            textAnchor="end"
          >
            {tick.label}
          </SvgText>
        ))}

        {/* X axis labels */}
        {xTicks.map(({ i, date }) => (
          <SvgText
            key={i}
            x={getX(i)}
            y={chartH - 4}
            fontSize="9"
            fill={Colors.text3}
            textAnchor="middle"
          >
            {formatDate(date)}
          </SvgText>
        ))}

        {/* Fill area */}
        {fillPath ? <Path d={fillPath} fill="url(#fillGrad)" /> : null}

        {/* Line */}
        {linePath ? (
          <Path
            d={linePath}
            fill="none"
            stroke={lineColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {/* Selected vertical line */}
        {sel && (
          <Line
            x1={sel.x}
            y1={padTop}
            x2={sel.x}
            y2={padTop + plotH}
            stroke={lineColor}
            strokeWidth="1"
            strokeDasharray="3 3"
            strokeOpacity="0.6"
          />
        )}

        {/* Dots — rendered last so they're on top */}
        {points.map((p, i) => (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={selectedIdx === i ? 6 : 4}
            fill={selectedIdx === i ? lineColor : Colors.bg}
            stroke={lineColor}
            strokeWidth="2"
          />
        ))}
      </Svg>

      {/* Tap targets overlay (native-compatible) */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width,
          height: chartH,
          flexDirection: 'row',
          pointerEvents: 'box-none',
        }}
      >
        {points.map((p, i) => (
          <TouchableOpacity
            key={i}
            style={{
              position: 'absolute',
              left: p.x - 16,
              top: p.y - 16,
              width: 32,
              height: 32,
            }}
            onPress={() => setSelectedIdx(i === selectedIdx ? null : i)}
            activeOpacity={1}
          />
        ))}
      </View>

      {/* Tooltip */}
      {sel && selectedIdx !== null && (
        <View
          style={[tooltipStyles.box, {
            left: Math.min(
              Math.max(sel.x - 52, padLeft),
              width - padRight - 108
            ),
            top: Math.max(sel.y - 52, 0),
          }, { pointerEvents: 'none' as const }]}
        >
          <Text style={tooltipStyles.val}>
            {mode === 'volume'
              ? `${Math.round(sel.value).toLocaleString()} lbs`
              : `${sel.value} lbs`}
          </Text>
          <Text style={tooltipStyles.date}>{formatDate(data[selectedIdx].date)}</Text>
        </View>
      )}
    </View>
  );
}

const tooltipStyles = StyleSheet.create({
  box: {
    position: 'absolute',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 108,
    alignItems: 'center',
  },
  val: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: Colors.text,
  },
  date: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.text3,
    marginTop: 1,
  },
});

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { workoutLog, deleteSession } = useWorkout();
  const [selectedEx, setSelectedEx] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>('weight');
  const [showAll, setShowAll] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const chartWidth = screenWidth - 32; // 16px padding each side

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
    return sessions
      .map(s => {
        const maxWeight = Math.max(...s.sets.map(st => st.weight || 0));
        const maxReps = Math.max(...s.sets.map(st => st.reps || 0));
        const volume = s.sets.reduce((sum, st) => sum + (st.weight || 0) * (st.reps || 0), 0);
        const e1rm = epley1RM(maxWeight, maxReps);
        return { date: s.date, maxWeight, maxReps, volume: Math.round(volume), e1rm };
      })
      .filter(d => d.maxWeight > 0)
      .slice(-12);
  }, [currentEx, workoutLog]);

  const allSessions: SessionLog[] = useMemo(() => {
    if (!currentEx) return [];
    const key = `${currentEx.dayId}_${currentEx.exIdx}`;
    return (workoutLog[key] || []).slice().reverse();
  }, [currentEx, workoutLog]);

  const visibleSessions = showAll ? allSessions : allSessions.slice(0, 6);

  const handleDelete = (session: SessionLog) => {
    if (!currentEx) return;
    Alert.alert(
      'Delete Session',
      `Remove the session from ${formatDate(session.date)}? This will update your charts and volume.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteSession(currentEx.dayId, currentEx.exIdx, session.date),
        },
      ]
    );
  };

  const summaryStats = useMemo(() => {
    if (!chartData.length) return null;
    const allWeights = chartData.map(d => d.maxWeight);
    const allE1rm = chartData.map(d => d.e1rm);
    const best = Math.max(...allWeights);
    const bestE1rm = Math.max(...allE1rm);
    const first = chartData[0];
    const last = chartData[chartData.length - 1];
    const delta = last.maxWeight - first.maxWeight;
    const pct = first.maxWeight > 0 ? Math.round((delta / first.maxWeight) * 100) : 0;
    return { best, bestE1rm, delta, pct, sessions: chartData.length };
  }, [chartData]);

  const modeLabels: { key: ChartMode; label: string }[] = [
    { key: 'weight', label: 'Max Weight' },
    { key: '1rm', label: 'Est. 1RM' },
    { key: 'volume', label: 'Volume' },
  ];

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Progress</Text>
      </View>

      {exercisesWithData.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="trending-up" size={44} color={Colors.text3} />
          <Text style={styles.emptyTitle}>No data yet</Text>
          <Text style={styles.emptySub}>Log your first workout to see progress charts here</Text>
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
            activeOpacity={0.8}
          >
            <View style={styles.exSelectorLeft}>
              <Text style={styles.exSelectorLabel}>Exercise</Text>
              <Text style={styles.exSelectorText} numberOfLines={1}>
                {currentEx?.name ?? 'Select exercise'}
              </Text>
            </View>
            <Feather name={showPicker ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.text2} />
          </TouchableOpacity>

          {showPicker && (
            <View style={styles.picker}>
              <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
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
              </ScrollView>
            </View>
          )}

          {/* Summary stats */}
          {summaryStats && (
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statVal}>{summaryStats.best} lbs</Text>
                <Text style={styles.statLabel}>Best Weight</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statVal}>{summaryStats.bestE1rm} lbs</Text>
                <Text style={styles.statLabel}>Est. 1RM</Text>
              </View>
              <View style={[styles.statCard, {
                borderColor: summaryStats.delta >= 0 ? 'rgba(76,255,145,0.2)' : 'rgba(255,82,82,0.2)',
              }]}>
                <Text style={[styles.statVal, {
                  color: summaryStats.delta >= 0 ? Colors.green : Colors.red,
                }]}>
                  {summaryStats.delta >= 0 ? '+' : ''}{summaryStats.delta} lbs
                </Text>
                <Text style={styles.statLabel}>
                  {summaryStats.delta >= 0 ? '+' : ''}{summaryStats.pct}% overall
                </Text>
              </View>
            </View>
          )}

          {/* Chart card */}
          {chartData.length >= 1 && (
            <View style={styles.chartCard}>
              {/* Mode toggle */}
              <View style={styles.modeToggle}>
                {modeLabels.map(m => (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.modeBtn, chartMode === m.key && styles.modeBtnActive]}
                    onPress={() => setChartMode(m.key)}
                  >
                    <Text style={[styles.modeBtnText, chartMode === m.key && styles.modeBtnTextActive]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {chartData.length === 1 ? (
                <View style={styles.singleSession}>
                  <Feather name="info" size={14} color={Colors.text3} />
                  <Text style={styles.singleSessionText}>
                    Log more sessions to see your progress chart
                  </Text>
                </View>
              ) : (
                <View style={{ marginHorizontal: -16 }}>
                  <LineChart
                    data={chartData}
                    mode={chartMode}
                    width={chartWidth}
                  />
                </View>
              )}

              <View style={styles.chartFooter}>
                <Text style={styles.chartFooterText}>
                  {chartMode === 'weight' && 'Heaviest set per session'}
                  {chartMode === '1rm' && 'Epley formula: weight × (1 + reps/30)'}
                  {chartMode === 'volume' && 'Total volume = sets × weight × reps'}
                </Text>
              </View>
            </View>
          )}

          {/* All Sessions */}
          {allSessions.length > 0 && (
            <View style={styles.sessionsCard}>
              <View style={styles.sessionsHeader}>
                <Text style={styles.sectionLabel}>
                  Sessions ({allSessions.length})
                </Text>
                {allSessions.length > 6 && (
                  <TouchableOpacity onPress={() => setShowAll(v => !v)}>
                    <Text style={styles.showAllBtn}>
                      {showAll ? 'Show less' : `Show all ${allSessions.length}`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              {visibleSessions.map((session, i) => {
                const maxWeight = Math.max(...session.sets.map(s => s.weight || 0));
                const maxReps = Math.max(...session.sets.map(s => s.reps || 0));
                const totalVol = session.sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
                const e1rm = epley1RM(maxWeight, maxReps);
                return (
                  <View key={`${session.date}-${i}`} style={[styles.sessionRow, i < visibleSessions.length - 1 && styles.sessionRowBorder]}>
                    <View style={styles.sessionLeft}>
                      <Text style={styles.sessionDate}>{formatDate(session.date)}</Text>
                      <Text style={styles.sessionNote}>{session.sets.length} sets · {Math.round(totalVol).toLocaleString()} lbs vol</Text>
                    </View>
                    <View style={styles.sessionRight}>
                      <Text style={styles.sessionBest}>{maxWeight} × {maxReps}</Text>
                      <Text style={styles.sessionE1rm}>e1RM: {e1rm} lbs</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDelete(session)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Feather name="trash-2" size={15} color={Colors.text3} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
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
    paddingHorizontal: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 40,
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.text2,
  },
  emptySub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.text3,
    textAlign: 'center',
    lineHeight: 20,
  },
  exSelector: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  exSelectorLeft: {
    flex: 1,
    marginRight: 8,
  },
  exSelectorLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  exSelectorText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
  },
  picker: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  pickerItem: {
    paddingHorizontal: 16,
    paddingVertical: 13,
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
    fontFamily: 'Inter_600SemiBold',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 3,
  },
  statVal: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.text,
    textAlign: 'center',
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  chartCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surface3,
    borderRadius: 8,
    padding: 3,
    marginBottom: 14,
    gap: 2,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border2,
  },
  modeBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.text3,
  },
  modeBtnTextActive: {
    color: Colors.text,
    fontFamily: 'Inter_600SemiBold',
  },
  singleSession: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  singleSessionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.text3,
  },
  chartFooter: {
    marginTop: 10,
    alignItems: 'center',
  },
  chartFooterText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 0.5,
  },
  sectionLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sessionsCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
  },
  sessionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  showAllBtn: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.accent,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    gap: 8,
  },
  deleteBtn: {
    padding: 4,
  },
  sessionRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sessionLeft: {
    gap: 2,
    flex: 1,
  },
  sessionDate: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.text,
  },
  sessionNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.text3,
  },
  sessionRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  sessionBest: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.text,
  },
  sessionE1rm: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.accent,
  },
});
