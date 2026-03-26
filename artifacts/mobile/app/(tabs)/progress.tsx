import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  TextInput,
  Modal,
  KeyboardAvoidingView,
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
import { confirmAlert, showAlert } from '@/lib/alerts';
import type { SessionLog, SetLog } from '@/context/WorkoutContext';

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

type ExerciseGroup = {
  name: string;
  variants: ExerciseEntry[];
};

type SessionRecord = SessionLog & {
  exerciseKey: string;
  dayId: string;
  exIdx: number;
};

const exerciseGroups: ExerciseGroup[] = DAYS.flatMap(d => {
  if (!d.exercises) return [] as ExerciseEntry[];
  return d.exercises.map((ex, idx) => ({ ...ex, dayId: d.id, exIdx: idx }));
}).reduce<ExerciseGroup[]>((acc, ex) => {
  const existing = acc.find(group => group.name === ex.name);
  if (existing) {
    existing.variants.push(ex);
    return acc;
  }
  acc.push({ name: ex.name, variants: [ex] });
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

  const linePath = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1];
    const cpX = (prev.x + p.x) / 2;
    return `${acc} C ${cpX} ${prev.y}, ${cpX} ${p.y}, ${p.x} ${p.y}`;
  }, '');

  const fillPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x} ${padTop + plotH} L ${points[0].x} ${padTop + plotH} Z`
      : '';

  const yTicks = [0, 0.5, 1].map(t => ({
    y: padTop + plotH * (1 - t),
    label: `${Math.round(minVal + t * range)}`,
  }));

  const step = Math.max(1, Math.ceil(data.length / 5));
  const xTicks = data
    .map((d, i) => ({ i, date: d.date }))
    .filter((_, i) => i % step === 0 || i === data.length - 1);

  const isGaining = values.length >= 2 && values[values.length - 1] >= values[0];
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

        {yTicks.map((tick, i) => (
          <Line key={i} x1={padLeft} y1={tick.y} x2={width - padRight} y2={tick.y}
            stroke={Colors.border} strokeWidth="1" strokeDasharray="4 4" />
        ))}
        {yTicks.map((tick, i) => (
          <SvgText key={i} x={padLeft - 6} y={tick.y + 4} fontSize="9"
            fill={Colors.text3} textAnchor="end">{tick.label}</SvgText>
        ))}
        {xTicks.map(({ i, date }) => (
          <SvgText key={i} x={getX(i)} y={chartH - 4} fontSize="9"
            fill={Colors.text3} textAnchor="middle">{formatDate(date)}</SvgText>
        ))}

        {fillPath ? <Path d={fillPath} fill="url(#fillGrad)" /> : null}
        {linePath ? (
          <Path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" />
        ) : null}

        {sel && (
          <Line x1={sel.x} y1={padTop} x2={sel.x} y2={padTop + plotH}
            stroke={lineColor} strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.5" />
        )}
        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={selectedIdx === i ? 6 : 4}
            fill={selectedIdx === i ? lineColor : Colors.bg}
            stroke={lineColor} strokeWidth="2" />
        ))}
      </Svg>

      {/* Tap targets */}
      <View style={{
        position: 'absolute', top: 0, left: 0, width, height: chartH,
        pointerEvents: 'box-none',
      }}>
        {points.map((p, i) => (
          <TouchableOpacity key={i} activeOpacity={1}
            style={{ position: 'absolute', left: p.x - 18, top: p.y - 18, width: 36, height: 36 }}
            onPress={() => setSelectedIdx(i === selectedIdx ? null : i)}
          />
        ))}
      </View>

      {sel && selectedIdx !== null && (
        <View style={[tooltipStyles.box, {
          left: Math.min(Math.max(sel.x - 54, padLeft), width - padRight - 110),
          top: Math.max(sel.y - 54, 0),
          pointerEvents: 'none',
        }]}>
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
    width: 110,
    alignItems: 'center',
  },
  val: { fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.text },
  date: { fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.text3, marginTop: 1 },
});

type EditState = { weight: string; reps: string }[];

function EditModal({
  session,
  exName,
  onClose,
}: {
  session: SessionRecord;
  exName: string;
  onClose: () => void;
}) {
  const { updateSession } = useWorkout();
  const [editSets, setEditSets] = useState<EditState>(
    session.sets.map(s => ({ weight: s.weight ? `${s.weight}` : '', reps: s.reps ? `${s.reps}` : '' }))
  );

  const updateSet = (idx: number, field: 'weight' | 'reps', val: string) => {
    setEditSets(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  };

  const addSet = () => {
    setEditSets(prev => [...prev, { weight: '', reps: '' }]);
  };

  const removeSet = (idx: number) => {
    setEditSets(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    const newSets: SetLog[] = editSets
      .map(s => ({ weight: parseFloat(s.weight) || 0, reps: parseInt(s.reps) || 0 }))
      .filter(s => s.weight > 0 || s.reps > 0);
    if (newSets.length === 0) {
      showAlert('No sets', 'Add at least one set with data before saving.');
      return;
    }
    updateSession(session.exerciseKey, session.id, newSets);
    onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={editStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={editStyles.sheet}>
          <View style={editStyles.handle} />

          <View style={editStyles.sheetHeader}>
            <View>
              <Text style={editStyles.sheetTitle}>{exName}</Text>
              <Text style={editStyles.sheetDate}>{formatDate(session.date)}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={editStyles.closeBtn}>
              <Feather name="x" size={20} color={Colors.text2} />
            </TouchableOpacity>
          </View>

          <View style={editStyles.setHeader}>
            <Text style={editStyles.setHeaderCell}>#</Text>
            <Text style={[editStyles.setHeaderCell, { flex: 1 }]}>Weight (lbs)</Text>
            <Text style={[editStyles.setHeaderCell, { flex: 1 }]}>Reps</Text>
            <View style={{ width: 32 }} />
          </View>

          <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
            {editSets.map((s, i) => (
              <View key={i} style={editStyles.setRow}>
                <Text style={editStyles.setNum}>{i + 1}</Text>
                <TextInput
                  style={[editStyles.setInput, { flex: 1 }]}
                  value={s.weight}
                  onChangeText={v => updateSet(i, 'weight', v)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.text3}
                  selectTextOnFocus
                />
                <TextInput
                  style={[editStyles.setInput, { flex: 1 }]}
                  value={s.reps}
                  onChangeText={v => updateSet(i, 'reps', v)}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.text3}
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={editStyles.removeSetBtn}
                  onPress={() => removeSet(i)}
                  disabled={editSets.length <= 1}
                >
                  <Feather name="minus-circle" size={16}
                    color={editSets.length <= 1 ? Colors.border : Colors.red} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={editStyles.addSetBtn} onPress={addSet}>
            <Feather name="plus" size={14} color={Colors.text3} />
            <Text style={editStyles.addSetText}>Add set</Text>
          </TouchableOpacity>

          <View style={editStyles.sheetActions}>
            <TouchableOpacity style={editStyles.cancelBtn} onPress={onClose}>
              <Text style={editStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={editStyles.saveBtn} onPress={handleSave}>
              <Text style={editStyles.saveText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const editStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border2,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  sheetTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    color: Colors.text,
  },
  sheetDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.text3,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  setHeader: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  setHeaderCell: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
    width: 24,
    textAlign: 'center',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  setNum: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.text3,
    width: 24,
    textAlign: 'center',
  },
  setInput: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.text,
    textAlign: 'center',
    minWidth: 0,
  },
  removeSetBtn: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    borderStyle: 'dashed',
    marginTop: 8,
    marginBottom: 16,
  },
  addSetText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text3,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text2,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    backgroundColor: Colors.accent,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: Colors.bg,
  },
});

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const { workoutLog, deleteSession, clearAllData } = useWorkout();
  const [selectedEx, setSelectedEx] = useState(0);
  const [showPicker, setShowPicker] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>('weight');
  const [showAll, setShowAll] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionRecord | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const chartWidth = screenWidth - 32;

  const exercisesWithData = useMemo(() => {
    return exerciseGroups.filter(group => {
      return group.variants.some(ex => {
        const key = `${ex.dayId}_${ex.exIdx}`;
        return workoutLog[key] && workoutLog[key].length > 0;
      });
    });
  }, [workoutLog]);

  const clampedEx = Math.min(selectedEx, Math.max(0, exercisesWithData.length - 1));
  const currentEx = exercisesWithData[clampedEx];

  const currentSessions = useMemo((): SessionRecord[] => {
    if (!currentEx) return [];

    return currentEx.variants.flatMap(ex => {
      const key = `${ex.dayId}_${ex.exIdx}`;
      const sessions = workoutLog[key] || [];
      return sessions.map(session => ({
        ...session,
        exerciseKey: key,
        dayId: ex.dayId,
        exIdx: ex.exIdx,
      }));
    });
  }, [currentEx, workoutLog]);

  const chartData = useMemo(() => {
    return currentSessions
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(s => {
        const maxWeight = Math.max(...s.sets.map(st => st.weight || 0));
        const maxReps = Math.max(...s.sets.map(st => st.reps || 0));
        const volume = s.sets.reduce((sum, st) => sum + (st.weight || 0) * (st.reps || 0), 0);
        return { date: s.date, maxWeight, maxReps, volume: Math.round(volume), e1rm: epley1RM(maxWeight, maxReps) };
      })
      .filter(d => d.maxWeight > 0)
      .slice(-12);
  }, [currentSessions]);

  const allSessions: SessionRecord[] = useMemo(() => {
    return currentSessions
      .slice()
      .sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.id.localeCompare(a.id);
      });
  }, [currentSessions]);

  const visibleSessions = showAll ? allSessions : allSessions.slice(0, 6);

  const summaryStats = useMemo(() => {
    if (!chartData.length) return null;
    const best = Math.max(...chartData.map(d => d.maxWeight));
    const bestE1rm = Math.max(...chartData.map(d => d.e1rm));
    const delta = chartData[chartData.length - 1].maxWeight - chartData[0].maxWeight;
    const pct = chartData[0].maxWeight > 0 ? Math.round((delta / chartData[0].maxWeight) * 100) : 0;
    return { best, bestE1rm, delta, pct, sessions: chartData.length };
  }, [chartData]);

  const handleDelete = async (session: SessionRecord) => {
    if (!currentEx) return;

    const confirmed = await confirmAlert({
      title: 'Delete Session',
      message: `Remove the ${formatDate(session.date)} session? Charts and volume will update immediately.`,
      cancelText: 'Cancel',
      confirmText: 'Delete',
      destructive: true,
    });

    if (!confirmed) return;
    deleteSession(session.exerciseKey, session.id);
  };

  const handleClearAll = async () => {
    const confirmed = await confirmAlert({
      title: 'Clear All Data',
      message: 'This will permanently delete every logged session and reset all charts. This cannot be undone.',
      cancelText: 'Cancel',
      confirmText: 'Clear Everything',
      destructive: true,
    });

    if (!confirmed) return;
    clearAllData();
  };

  const modeLabels: { key: ChartMode; label: string }[] = [
    { key: 'weight', label: 'Max Weight' },
    { key: '1rm', label: 'Est. 1RM' },
    { key: 'volume', label: 'Volume' },
  ];

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Progress</Text>
        {Object.keys(workoutLog).length > 0 && (
          <TouchableOpacity style={styles.clearBtn} onPress={handleClearAll}>
            <Feather name="trash-2" size={14} color={Colors.red} />
            <Text style={styles.clearBtnText}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>

      {exercisesWithData.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="trending-up" size={44} color={Colors.text3} />
          <Text style={styles.emptyTitle}>No data yet</Text>
          <Text style={styles.emptySub}>Complete a workout to see your progress charts here</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: bottomPad + 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Exercise Selector */}
          <TouchableOpacity style={styles.exSelector} onPress={() => setShowPicker(!showPicker)} activeOpacity={0.8}>
            <View style={styles.exSelectorLeft}>
              <Text style={styles.exSelectorLabel}>Exercise</Text>
              <Text style={styles.exSelectorText} numberOfLines={1}>{currentEx?.name ?? '—'}</Text>
            </View>
            <Feather name={showPicker ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.text2} />
          </TouchableOpacity>

          {showPicker && (
            <View style={styles.picker}>
              <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                {exercisesWithData.map((ex, i) => (
                  <TouchableOpacity key={i}
                    style={[styles.pickerItem, i === clampedEx && styles.pickerItemActive]}
                    onPress={() => { setSelectedEx(i); setShowPicker(false); setShowAll(false); }}
                  >
                    <Text style={[styles.pickerItemText, i === clampedEx && styles.pickerItemTextActive]}>
                      {ex.name}
                    </Text>
                    {i === clampedEx && <Feather name="check" size={14} color={Colors.accent} />}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Summary Stats */}
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
                borderColor: summaryStats.delta >= 0 ? 'rgba(76,255,145,0.25)' : 'rgba(255,82,82,0.25)',
              }]}>
                <Text style={[styles.statVal, { color: summaryStats.delta >= 0 ? Colors.green : Colors.red }]}>
                  {summaryStats.delta >= 0 ? '+' : ''}{summaryStats.delta} lbs
                </Text>
                <Text style={styles.statLabel}>
                  {summaryStats.delta >= 0 ? '+' : ''}{summaryStats.pct}% overall
                </Text>
              </View>
            </View>
          )}

          {/* Chart */}
          {chartData.length >= 1 && (
            <View style={styles.chartCard}>
              <View style={styles.modeToggle}>
                {modeLabels.map(m => (
                  <TouchableOpacity key={m.key}
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
                  <Text style={styles.singleSessionText}>Log more sessions to see a trend line</Text>
                </View>
              ) : (
                <View style={{ marginHorizontal: -16 }}>
                  <LineChart data={chartData} mode={chartMode} width={chartWidth} />
                </View>
              )}

              <View style={styles.chartFooter}>
                <Text style={styles.chartFooterText}>
                  {chartMode === 'weight' && 'Heaviest set per session'}
                  {chartMode === '1rm' && 'Epley formula: weight × (1 + reps / 30)'}
                  {chartMode === 'volume' && 'Total volume = weight × reps across all sets'}
                </Text>
              </View>
            </View>
          )}

          {/* Sessions list */}
          {allSessions.length > 0 && (
            <View style={styles.sessionsCard}>
              <View style={styles.sessionsHeader}>
                <Text style={styles.sectionLabel}>Sessions ({allSessions.length})</Text>
                {allSessions.length > 6 && (
                  <TouchableOpacity onPress={() => setShowAll(v => !v)}>
                    <Text style={styles.showAllBtn}>{showAll ? 'Show less' : `Show all ${allSessions.length}`}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {visibleSessions.map((session, i) => {
                const maxWeight = Math.max(...session.sets.map(s => s.weight || 0));
                const maxReps = Math.max(...session.sets.map(s => s.reps || 0));
                const totalVol = session.sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
                const e1rm = epley1RM(maxWeight, maxReps);
                return (
                  <View key={session.id ?? i} style={[styles.sessionRow, i < visibleSessions.length - 1 && styles.sessionRowBorder]}>
                    <TouchableOpacity
                      style={styles.sessionMain}
                      onPress={() => setEditingSession(session)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.sessionLeft}>
                        <Text style={styles.sessionDate}>{formatDate(session.date)}</Text>
                        <Text style={styles.sessionNote}>
                          {session.sets.length} sets · {Math.round(totalVol).toLocaleString()} lbs vol
                        </Text>
                      </View>
                      <View style={styles.sessionRight}>
                        <Text style={styles.sessionBest}>{maxWeight} × {maxReps}</Text>
                        <Text style={styles.sessionE1rm}>e1RM: {e1rm} lbs</Text>
                      </View>
                    </TouchableOpacity>
                    <View style={styles.sessionActions}>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => setEditingSession(session)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
                      >
                        <Feather name="edit-2" size={14} color={Colors.text3} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => handleDelete(session)}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                      >
                        <Feather name="trash-2" size={14} color={Colors.text3} />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {editingSession && currentEx && (
        <EditModal
          session={editingSession}
          exName={currentEx.name}
          onClose={() => setEditingSession(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  headerRow: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.text, letterSpacing: 1 },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,82,82,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,82,82,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clearBtnText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.red },
  body: { flex: 1, paddingHorizontal: 16 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18, color: Colors.text2 },
  emptySub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text3, textAlign: 'center', lineHeight: 20 },
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
  exSelectorLeft: { flex: 1, marginRight: 8 },
  exSelectorLabel: {
    fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.text3,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 3,
  },
  exSelectorText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: Colors.text },
  picker: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, marginBottom: 12, overflow: 'hidden',
  },
  pickerItem: {
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  pickerItemActive: { backgroundColor: Colors.surface2 },
  pickerItemText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text2, flex: 1 },
  pickerItemTextActive: { color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 12, alignItems: 'center', gap: 3,
  },
  statVal: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.text, textAlign: 'center' },
  statLabel: {
    fontFamily: 'Inter_400Regular', fontSize: 9, color: Colors.text3,
    letterSpacing: 1, textTransform: 'uppercase', textAlign: 'center',
  },
  chartCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 16, marginBottom: 12, overflow: 'hidden',
  },
  modeToggle: {
    flexDirection: 'row', backgroundColor: Colors.surface3,
    borderRadius: 8, padding: 3, marginBottom: 14, gap: 2,
  },
  modeBtn: { flex: 1, paddingVertical: 7, borderRadius: 6, alignItems: 'center' },
  modeBtnActive: { backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border2 },
  modeBtnText: { fontFamily: 'Inter_500Medium', fontSize: 11, color: Colors.text3 },
  modeBtnTextActive: { color: Colors.text, fontFamily: 'Inter_600SemiBold' },
  singleSession: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 20, justifyContent: 'center',
  },
  singleSessionText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.text3 },
  chartFooter: { marginTop: 10, alignItems: 'center' },
  chartFooterText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.text3, letterSpacing: 0.5 },
  sectionLabel: {
    fontFamily: 'Inter_500Medium', fontSize: 10, color: Colors.text3,
    letterSpacing: 2, textTransform: 'uppercase',
  },
  sessionsCard: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, padding: 16,
  },
  sessionsHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  showAllBtn: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.accent },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, gap: 6,
  },
  sessionRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  sessionMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionLeft: { flex: 1, gap: 2 },
  sessionDate: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.text },
  sessionNote: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.text3 },
  sessionRight: { alignItems: 'flex-end', gap: 2 },
  sessionBest: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.text },
  sessionE1rm: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.accent },
  sessionActions: { flexDirection: 'row', gap: 4 },
  actionBtn: { padding: 6 },
});



