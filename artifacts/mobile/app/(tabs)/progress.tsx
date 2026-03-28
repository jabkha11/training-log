import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { Colors } from '@/constants/colors';
import { useProgram } from '@/context/ProgramContext';
import { useWorkout, type SessionLog, type SetLog } from '@/context/WorkoutContext';
import {
  getProgressSlotOptions,
  getSlotAssignmentSessions,
  getSlotOverloadInsight,
  getSlotProgressSeries,
  getSlotProgressionRecommendation,
  type OverloadInsight,
  type OverloadVerdict,
  type ProgressPoint,
} from '@/lib/analytics';
import type { ProgramSlot } from '@/lib/program';
import { confirmAlert, showAlert } from '@/lib/alerts';

type ChartMode = 'overload' | 'weight' | 'reps' | 'volume';

function formatDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatVolume(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

function formatLbs(value: number | null | undefined) {
  if (!value) return '--';
  return `${Math.round(value)} lbs`;
}

function getMetricLabel(mode: ChartMode) {
  if (mode === 'overload') return 'Estimated 1RM';
  if (mode === 'weight') return 'Best weight';
  if (mode === 'reps') return 'Best reps';
  return 'Session volume';
}

function getPointMetric(point: ProgressPoint, mode: ChartMode) {
  if (mode === 'overload') return point.e1rm;
  if (mode === 'weight') return point.maxWeight;
  if (mode === 'reps') return point.maxReps;
  return point.volume;
}

function getVerdictVisuals(verdict: OverloadVerdict) {
  if (verdict === 'improving') {
    return { label: 'Improving', icon: 'trending-up' as const, bg: Colors.successBg, border: Colors.successBorder, color: Colors.green };
  }
  if (verdict === 'holding') {
    return { label: 'Holding', icon: 'minus' as const, bg: Colors.infoBg, border: Colors.infoBorder, color: Colors.blue };
  }
  if (verdict === 'stalled') {
    return { label: 'Stalled', icon: 'pause-circle' as const, bg: Colors.warningBg, border: Colors.warningBorder, color: Colors.orange };
  }
  if (verdict === 'regressing') {
    return { label: 'Slipping', icon: 'trending-down' as const, bg: Colors.dangerBg, border: Colors.dangerBorder, color: Colors.red };
  }
  if (verdict === 'rebuild') {
    return { label: 'Rebuilding', icon: 'refresh-cw' as const, bg: Colors.warningBg, border: Colors.warningBorder, color: Colors.orange };
  }
  return { label: 'Too early to tell', icon: 'clock' as const, bg: Colors.surface2, border: Colors.border, color: Colors.text2 };
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Feather name="activity" size={18} color={Colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

function ProofCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={styles.proofCard}>
      <Text style={styles.proofLabel}>{label}</Text>
      <Text style={styles.proofValue}>{value}</Text>
      {note ? <Text style={styles.proofNote}>{note}</Text> : null}
    </View>
  );
}

function buildPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function formatAxisValue(value: number, mode: ChartMode) {
  if (mode === 'reps') return `${Math.round(value)}`;
  if (mode === 'volume') return formatVolume(value);
  return `${Math.round(value)}`;
}

function buildTickValues(minValue: number, maxValue: number, count = 4) {
  if (count <= 1) return [maxValue];
  const range = maxValue - minValue || 1;
  return Array.from({ length: count }, (_, index) => maxValue - ((range / (count - 1)) * index));
}

function buildXTickIndices(length: number) {
  if (length <= 1) return [0];
  const desired = [0, Math.round((length - 1) / 3), Math.round(((length - 1) * 2) / 3), length - 1];
  return Array.from(new Set(desired.filter(index => index >= 0 && index < length)));
}

function LineChart({ points, mode }: { points: ProgressPoint[]; mode: ChartMode }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(points.length ? points.length - 1 : null);
  const [chartWidth, setChartWidth] = useState(332);

  useEffect(() => {
    setSelectedIndex(points.length ? points.length - 1 : null);
  }, [mode, points]);

  const chart = useMemo(() => {
    const width = Math.max(280, chartWidth);
    const height = 232;
    const paddingLeft = 44;
    const paddingRight = 14;
    const paddingTop = 18;
    const paddingBottom = 34;
    if (!points.length) {
      return {
        width,
        height,
        projected: [] as Array<{ x: number; y: number }>,
        path: '',
        bestIndex: -1,
        minMetric: 0,
        maxMetric: 0,
        paddingLeft,
        paddingRight,
        paddingTop,
        paddingBottom,
      };
    }

    const metrics = points.map(point => getPointMetric(point, mode));
    const rawMin = Math.min(...metrics);
    const rawMax = Math.max(...metrics);
    const padding = Math.max(1, (rawMax - rawMin) * 0.08);
    const minMetric = mode === 'reps' ? Math.max(0, Math.floor(rawMin - 1)) : Math.max(0, rawMin - padding);
    const maxMetric = rawMax + padding;
    const metricRange = maxMetric - minMetric || 1;
    const stepX = points.length > 1 ? (width - paddingLeft - paddingRight) / (points.length - 1) : 0;
    const bestIndex = metrics.findIndex(metric => metric === rawMax);
    const projected = points.map((point, index) => {
      const metric = getPointMetric(point, mode);
      const normalized = (metric - minMetric) / metricRange;
      return {
        x: paddingLeft + (index * stepX),
        y: height - paddingBottom - normalized * (height - paddingTop - paddingBottom),
      };
    });

    return {
      width,
      height,
      projected,
      path: buildPath(projected),
      bestIndex,
      minMetric,
      maxMetric,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
    };
  }, [chartWidth, mode, points]);

  const selectedPoint = selectedIndex === null ? null : points[selectedIndex];
  const latestIndex = points.length - 1;
  const yTicks = useMemo(() => buildTickValues(chart.minMetric, chart.maxMetric, 4), [chart.maxMetric, chart.minMetric]);
  const xTickIndices = useMemo(() => buildXTickIndices(points.length), [points.length]);

  const updateSelectedIndex = (locationX: number) => {
    if (!points.length) return;
    const clamped = Math.max(chart.paddingLeft, Math.min(locationX, chart.width - chart.paddingRight));
    const ratio = points.length > 1
      ? (clamped - chart.paddingLeft) / (chart.width - chart.paddingLeft - chart.paddingRight)
      : 0;
    const nextIndex = Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
    setSelectedIndex(nextIndex);
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => updateSelectedIndex(event.nativeEvent.locationX),
    onPanResponderMove: event => updateSelectedIndex(event.nativeEvent.locationX),
  }), [chart.paddingLeft, chart.paddingRight, chart.width, points.length]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width - 24;
    if (nextWidth > 0 && Math.abs(nextWidth - chartWidth) > 2) {
      setChartWidth(nextWidth);
    }
  };

  if (!points.length) {
    return <EmptyState title="No history for this exercise yet" body="Log this exercise a few times to unlock overload verdicts and trend lines." />;
  }

  return (
    <View style={styles.chartShell} onLayout={handleLayout}>
      <View style={styles.chartLegend}>
        <View>
          <Text style={styles.chartLegendLabel}>{getMetricLabel(mode)}</Text>
          <Text style={styles.chartLegendValue}>
            {mode === 'reps'
              ? `${Math.round(getPointMetric(selectedPoint ?? points[latestIndex], mode))} reps`
              : mode === 'volume'
                ? `${formatVolume(getPointMetric(selectedPoint ?? points[latestIndex], mode))} lbs`
                : `${Math.round(getPointMetric(selectedPoint ?? points[latestIndex], mode))} lbs`}
          </Text>
        </View>
        <Text style={styles.chartLegendDate}>{formatDate((selectedPoint ?? points[latestIndex]).date)}</Text>
      </View>

      <View {...responder.panHandlers}>
      <Svg width="100%" height={chart.height} viewBox={`0 0 ${chart.width} ${chart.height}`}>
        {yTicks.map(tick => {
          const normalized = (tick - chart.minMetric) / ((chart.maxMetric - chart.minMetric) || 1);
          const y = chart.height - chart.paddingBottom - normalized * (chart.height - chart.paddingTop - chart.paddingBottom);
          return (
            <React.Fragment key={`y-${tick}`}>
              <Line x1={chart.paddingLeft} y1={y} x2={chart.width - chart.paddingRight} y2={y} stroke={Colors.border} strokeWidth={1} opacity={0.7} />
              <SvgText x={chart.paddingLeft - 8} y={y + 4} fontSize="10" fill={Colors.text3} textAnchor="end">
                {formatAxisValue(tick, mode)}
                {mode === 'reps' ? '' : mode === 'volume' ? '' : ' lb'}
              </SvgText>
            </React.Fragment>
          );
        })}
        <Line x1={chart.paddingLeft} y1={chart.height - chart.paddingBottom} x2={chart.width - chart.paddingRight} y2={chart.height - chart.paddingBottom} stroke={Colors.border2} strokeWidth={1} />
        <Line x1={chart.paddingLeft} y1={chart.paddingTop} x2={chart.paddingLeft} y2={chart.height - chart.paddingBottom} stroke={Colors.border2} strokeWidth={1} />
        <Path d={chart.path} stroke={Colors.accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {selectedIndex !== null ? (
          <Line
            x1={chart.projected[selectedIndex]?.x ?? chart.paddingLeft}
            y1={chart.paddingTop}
            x2={chart.projected[selectedIndex]?.x ?? chart.paddingLeft}
            y2={chart.height - chart.paddingBottom}
            stroke={Colors.accent}
            strokeWidth={1}
            opacity={0.55}
          />
        ) : null}
        {chart.projected.map((point, index) => {
          const isLatest = index === latestIndex;
          const isBest = index === chart.bestIndex;
          const isSelected = index === selectedIndex;
          return (
            <Circle
              key={`${points[index]?.sessionId ?? index}-point`}
              cx={point.x}
              cy={point.y}
              r={isSelected ? 6 : isLatest || isBest ? 5 : 4}
              fill={isLatest ? Colors.green : isBest ? Colors.orange : Colors.surface3}
              stroke={Colors.text}
              strokeWidth={isSelected ? 2 : 1}
              onPress={() => setSelectedIndex(index)}
            />
          );
        })}
        {xTickIndices.map(index => {
          const point = chart.projected[index];
          const label = formatDate(points[index].date);
          return (
            <SvgText key={`x-${index}`} x={point.x} y={chart.height - 8} fontSize="10" fill={Colors.text3} textAnchor="middle">
              {label}
            </SvgText>
          );
        })}
      </Svg>
      </View>

      <View style={styles.chartTags}>
        <View style={styles.chartTag}>
          <View style={[styles.chartDot, { backgroundColor: Colors.green }]} />
          <Text style={styles.chartTagText}>Latest</Text>
        </View>
        <View style={styles.chartTag}>
          <View style={[styles.chartDot, { backgroundColor: Colors.orange }]} />
          <Text style={styles.chartTagText}>Best</Text>
        </View>
        <View style={styles.chartTag}>
          <View style={[styles.chartDot, { backgroundColor: Colors.accent }]} />
          <Text style={styles.chartTagText}>Trend</Text>
        </View>
      </View>
    </View>
  );
}

function EditSessionModal({ session, onClose, onSave }: { session: SessionLog | null; onClose: () => void; onSave: (sets: SetLog[]) => void }) {
  const [draft, setDraft] = useState<Array<{ weight: string; reps: string }>>([]);

  useEffect(() => {
    setDraft(session?.sets.map(set => ({ weight: set.weight ? String(set.weight) : '', reps: set.reps ? String(set.reps) : '' })) ?? []);
  }, [session]);

  return (
    <Modal visible={!!session} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalScrim}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalEyebrow}>Edit Session</Text>
              <Text style={styles.modalTitle}>{session?.exerciseName ?? 'Exercise'}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.iconBtn}>
              <Feather name="x" size={16} color={Colors.text2} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            {draft.map((set, index) => (
              <View key={`${session?.id ?? 'session'}-${index}`} style={styles.editRow}>
                <Text style={styles.editLabel}>Set {index + 1}</Text>
                <View style={styles.editInputs}>
                  <TextInput value={set.weight} onChangeText={value => setDraft(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, weight: value } : item))} keyboardType="decimal-pad" placeholder="Weight" placeholderTextColor={Colors.text3} style={styles.input} />
                  <TextInput value={set.reps} onChangeText={value => setDraft(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, reps: value } : item))} keyboardType="number-pad" placeholder="Reps" placeholderTextColor={Colors.text3} style={styles.input} />
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

export default function ProgressScreen() {
  const params = useLocalSearchParams<{ slotId?: string }>();
  const { days, getDaySlots } = useProgram();
  const { workoutLog, updateSession, deleteSession, clearAllData } = useWorkout();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [chartMode, setChartMode] = useState<ChartMode>('overload');
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [editingSession, setEditingSession] = useState<SessionLog | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const slots = useMemo(() => days.flatMap(day => getDaySlots(day.id)), [days, getDaySlots]);
  const slotOptions = useMemo(() => getProgressSlotOptions(days, slots, workoutLog), [days, slots, workoutLog]);
  const defaultKey = useMemo(() => {
    const withHistory = slotOptions.filter(option => option.hasHistory);
    const improving = withHistory.find(option => {
      const slot = slots.find(entry => entry.id === option.slotId);
      if (!slot) return false;
      const sessions = getSlotAssignmentSessions(workoutLog, slot.id, slot.assignmentId);
      return getSlotOverloadInsight(slot, sessions).verdict === 'improving';
    });
    return improving?.slotId ?? withHistory[0]?.slotId ?? slotOptions[0]?.slotId ?? null;
  }, [slotOptions, slots, workoutLog]);
  const requestedKey = useMemo(() => {
    const raw = params.slotId;
    if (Array.isArray(raw)) return raw[0] ?? null;
    return raw ?? null;
  }, [params.slotId]);
  const activeKey = useMemo(() => {
    if (selectedKey && slotOptions.some(option => option.slotId === selectedKey)) {
      return selectedKey;
    }
    if (requestedKey && slotOptions.some(option => option.slotId === requestedKey)) {
      return requestedKey;
    }
    return defaultKey;
  }, [defaultKey, requestedKey, selectedKey, slotOptions]);

  useEffect(() => {
    if (activeKey && selectedKey !== activeKey) {
      setSelectedKey(activeKey);
    }
  }, [activeKey, selectedKey]);

  const selectedSlot = useMemo<ProgramSlot | null>(() => slots.find(slot => slot.id === activeKey) ?? null, [activeKey, slots]);
  const selectedOption = useMemo(() => slotOptions.find(option => option.slotId === activeKey) ?? null, [activeKey, slotOptions]);
  const filteredSlotOptions = useMemo(() => {
    const query = pickerQuery.trim().toLowerCase();
    if (!query) return slotOptions;
    return slotOptions.filter(option => (
      option.exerciseName.toLowerCase().includes(query)
      || option.dayLabel.toLowerCase().includes(query)
      || option.sessionTitle.toLowerCase().includes(query)
    ));
  }, [pickerQuery, slotOptions]);
  const chartPoints = useMemo(() => (selectedSlot ? getSlotProgressSeries(workoutLog, selectedSlot.id) : []), [selectedSlot, workoutLog]);
  const assignmentSessions = useMemo(() => (selectedSlot ? getSlotAssignmentSessions(workoutLog, selectedSlot.id, selectedSlot.assignmentId) : []), [selectedSlot, workoutLog]);
  const overloadInsight = useMemo<OverloadInsight | null>(() => (selectedSlot ? getSlotOverloadInsight(selectedSlot, assignmentSessions) : null), [assignmentSessions, selectedSlot]);
  const progressionSummary = useMemo(() => (selectedSlot ? getSlotProgressionRecommendation(selectedSlot, assignmentSessions) : null), [assignmentSessions, selectedSlot]);
  const allSessions = useMemo(() => (
    selectedSlot
      ? (workoutLog[selectedSlot.id] ?? []).slice().sort((a, b) => {
          const dateCompare = b.date.localeCompare(a.date);
          if (dateCompare !== 0) return dateCompare;
          return b.id.localeCompare(a.id);
        })
      : []
  ), [selectedSlot, workoutLog]);
  const visibleSessions = showAllSessions ? allSessions : allSessions.slice(0, 4);

  const latestPoint = chartPoints[chartPoints.length - 1] ?? null;
  const previousPoint = chartPoints[chartPoints.length - 2] ?? null;
  const overloadVisuals = getVerdictVisuals(overloadInsight?.verdict ?? 'insufficient');
  const confidenceLabel = overloadInsight?.confidence === 'enough' ? 'Strong signal' : overloadInsight?.confidence === 'mixed' ? 'Mixed signal' : 'Too early to tell';

  const handleDelete = (session: SessionLog) => {
    if (!selectedSlot) return;
    confirmAlert({
      title: 'Delete Session',
      message: `Delete the ${formatDate(session.date)} log for ${session.exerciseName}?`,
      destructive: true,
    }).then(confirmed => {
      if (confirmed) {
        deleteSession(selectedSlot.id, session.id);
      }
    });
  };

  return (
    <SafeAreaView style={styles.safeArea} testID="progress-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Analytics</Text>
            <Text style={styles.title}>Progress</Text>
            <Text style={styles.subtitle}>See whether this exercise is actually progressing, stalling, or just noisy.</Text>
          </View>
          <Pressable
            onPress={() => confirmAlert({
              title: 'Clear All Progress',
              message: 'This will remove all logged progress data from the app.',
              destructive: true,
            }).then(confirmed => {
              if (confirmed) {
                clearAllData();
                showAlert('Progress Cleared', 'All saved workout history was removed.');
              }
            })}
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryBtnText}>Clear all</Text>
          </Pressable>
        </View>

        {slotOptions.length === 0 ? (
          <EmptyState title="No progress history yet" body="Complete a workout to unlock overload verdicts, charts, and recent-session comparisons here." />
        ) : (
          <>
            <Pressable onPress={() => {
              setPickerQuery('');
              setShowPicker(true);
            }} style={styles.selectorCard}>
              <Text style={styles.sectionLabel}>Exercise</Text>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectorTitle}>{selectedOption?.exerciseName ?? 'Choose exercise'}</Text>
                  <Text style={styles.selectorMeta}>{selectedOption ? `${selectedOption.dayLabel} | ${selectedOption.sessionTitle}` : 'Choose an exercise'}</Text>
                </View>
                <Feather name="chevron-down" size={18} color={Colors.text2} />
              </View>
            </Pressable>

            <View style={styles.verdictCard}>
              <View style={styles.rowBetween}>
                <View style={[styles.verdictBadge, { backgroundColor: overloadVisuals.bg, borderColor: overloadVisuals.border }]}>
                  <Feather name={overloadVisuals.icon} size={14} color={overloadVisuals.color} />
                  <Text style={[styles.verdictBadgeText, { color: overloadVisuals.color }]}>{overloadVisuals.label}</Text>
                </View>
                <Text style={styles.confidenceText}>{confidenceLabel}</Text>
              </View>
              <Text style={styles.verdictTitle}>{overloadInsight?.summary ?? 'Too early to call'}</Text>
              <Text style={styles.verdictBody}>{overloadInsight?.evidence ?? 'Log this exercise to start building a meaningful overload story.'}</Text>
              <View style={styles.verdictCompare}>
                <Text style={styles.compareLabel}>{overloadInsight?.baselineWindowSize ? `Last ${overloadInsight.recentWindowSize} vs prior ${overloadInsight.baselineWindowSize}` : 'Recent read'}</Text>
                <Text style={styles.compareValue}>
                  {overloadInsight?.recentChangePct !== null && overloadInsight?.recentChangePct !== undefined
                    ? `${overloadInsight.recentChangePct >= 0 ? '+' : ''}${Math.round(overloadInsight.recentChangePct * 100)}% vs your earlier block`
                    : 'Not enough sessions yet'}
                </Text>
              </View>
              {progressionSummary ? (
                <View style={styles.nextActionCard}>
                  <Text style={styles.nextActionLabel}>Coaching note</Text>
                  <Text style={styles.nextActionText}>{progressionSummary.reason}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Trend</Text>
              <Text style={styles.cardTitle}>Progress trend</Text>
              <Text style={styles.cardMeta}>
                {chartMode === 'overload'
                  ? 'Strength trend blends your best weight and reps into one progress signal.'
                  : chartMode === 'weight'
                    ? 'Weight view shows the heaviest set you logged each session.'
                    : chartMode === 'reps'
                      ? 'Reps view shows your best rep performance each session.'
                      : 'Volume view shows the total work you logged each session.'}
              </Text>
              <View style={styles.modeRow}>
                {(['overload', 'weight', 'reps', 'volume'] as ChartMode[]).map(mode => (
                  <Pressable key={mode} onPress={() => setChartMode(mode)} style={[styles.modeBtn, chartMode === mode && styles.modeBtnActive]}>
                    <Text style={[styles.modeText, chartMode === mode && styles.modeTextActive]}>
                      {mode === 'overload' ? 'Strength trend' : mode === 'weight' ? 'Weight' : mode === 'reps' ? 'Reps' : 'Volume'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <LineChart points={chartPoints} mode={chartMode} />
            </View>

            <View style={styles.proofRow}>
              <ProofCard label="Latest Top Set" value={formatLbs(overloadInsight?.latestTopSetE1rm)} note={latestPoint ? formatDate(latestPoint.date) : undefined} />
              <ProofCard label="Best All-Time Top Set" value={formatLbs(overloadInsight?.bestAllTimeTopSetE1rm)} note={previousPoint ? `Previous ${formatLbs(previousPoint.e1rm)}` : undefined} />
            </View>

            <Pressable onPress={() => setShowDetail(value => !value)} style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionLabel}>More Detail</Text>
                  <Text style={styles.cardTitle}>See the extra context</Text>
                  <Text style={styles.cardMeta}>Open this if you want the fuller breakdown behind the verdict.</Text>
                </View>
                <Feather name={showDetail ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.text2} />
              </View>
              {showDetail ? (
                <View style={styles.evidenceList}>
                  <View style={styles.evidenceRow}>
                    <Text style={styles.evidenceLabel}>Latest vs previous</Text>
                    <Text style={styles.evidenceValue}>{latestPoint && previousPoint ? `${formatLbs(latestPoint.e1rm)} vs ${formatLbs(previousPoint.e1rm)}` : 'Need more sessions'}</Text>
                  </View>
                  <View style={styles.evidenceRow}>
                    <Text style={styles.evidenceLabel}>Current block sessions</Text>
                    <Text style={styles.evidenceValue}>{assignmentSessions.length}</Text>
                  </View>
                  <View style={styles.evidenceRow}>
                    <Text style={styles.evidenceLabel}>Recent change</Text>
                    <Text style={styles.evidenceValue}>
                      {overloadInsight?.recentChangePct !== null && overloadInsight?.recentChangePct !== undefined
                        ? `${overloadInsight.recentChangePct >= 0 ? '+' : ''}${Math.round(overloadInsight.recentChangePct * 100)}%`
                        : 'Need more sessions'}
                    </Text>
                  </View>
                </View>
              ) : null}
            </Pressable>

            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Sessions</Text>
              <Text style={styles.cardTitle}>Recent logs</Text>
              {allSessions.length === 0 ? (
                <EmptyState title="No history for this exercise yet" body="Log this exercise a few times and the overload view will start making real calls." />
              ) : (
                <>
                  {visibleSessions.map(session => {
                    const bestSessionWeight = Math.max(...session.sets.map(set => set.weight || 0), 0);
                    const bestSessionReps = Math.max(...session.sets.map(set => set.reps || 0), 0);
                    const sessionVolume = session.sets.reduce((sum, set) => sum + ((set.weight || 0) * (set.reps || 0)), 0);
                    return (
                      <View key={session.id} style={styles.sessionRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.sessionDate}>{formatDate(session.date)}</Text>
                          <Text style={styles.sessionMeta}>{bestSessionWeight ? `${bestSessionWeight} lbs` : '--'} max - {bestSessionReps ? `${bestSessionReps} reps` : '--'} - {formatVolume(sessionVolume)} volume</Text>
                        </View>
                        <Pressable onPress={() => setEditingSession(session)} style={styles.iconBtn}>
                          <Feather name="edit-3" size={16} color={Colors.text2} />
                        </Pressable>
                        <Pressable onPress={() => handleDelete(session)} style={styles.iconBtn}>
                          <Feather name="trash-2" size={16} color={Colors.red} />
                        </Pressable>
                      </View>
                    );
                  })}
                  {allSessions.length > 4 ? (
                    <Pressable onPress={() => setShowAllSessions(value => !value)} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryBtnText}>{showAllSessions ? 'Show fewer' : 'Show all sessions'}</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <View style={styles.modalScrim}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>Pick Exercise</Text>
                <Text style={styles.modalTitle}>Current program exercises</Text>
              </View>
              <Pressable onPress={() => setShowPicker(false)} style={styles.iconBtn}>
                <Feather name="x" size={16} color={Colors.text2} />
              </Pressable>
            </View>
            <TextInput
              value={pickerQuery}
              onChangeText={setPickerQuery}
              placeholder="Search current program exercises"
              placeholderTextColor={Colors.text3}
              style={styles.pickerSearchInput}
            />
            <ScrollView contentContainerStyle={styles.modalBody}>
              {filteredSlotOptions.length ? filteredSlotOptions.map(option => (
                <Pressable key={option.slotId} onPress={() => { setSelectedKey(option.slotId); setShowPicker(false); }} style={[styles.pickerRow, option.slotId === activeKey && styles.pickerRowActive]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerTitle}>{option.exerciseName}</Text>
                    <Text style={styles.pickerMeta}>{option.dayLabel} | {option.sessionTitle}</Text>
                  </View>
                  <Text style={option.hasHistory ? styles.historyTag : styles.newTag}>{option.hasHistory ? 'History' : 'New'}</Text>
                </Pressable>
              )) : (
                <View style={styles.pickerEmptyState}>
                  <Text style={styles.pickerEmptyTitle}>No exercises match that search</Text>
                  <Text style={styles.pickerEmptyBody}>Try a different exercise name, weekday, or session title.</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <EditSessionModal
        session={editingSession}
        onClose={() => setEditingSession(null)}
        onSave={sets => {
          if (!selectedSlot || !editingSession) return;
          updateSession(selectedSlot.id, editingSession.id, sets);
          setEditingSession(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  content: {
    padding: 20,
    paddingBottom: 120,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  eyebrow: {
    color: Colors.text3,
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: Colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 30,
    marginTop: 4,
  },
  subtitle: {
    color: Colors.text2,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  sectionLabel: {
    color: Colors.text3,
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  selectorCard: {
    backgroundColor: Colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 10,
  },
  selectorTitle: {
    color: Colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  selectorMeta: {
    color: Colors.text2,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    marginTop: 4,
  },
  verdictCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    gap: 14,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  verdictBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  verdictBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  confidenceText: {
    color: Colors.text3,
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  verdictTitle: {
    color: Colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
  },
  verdictBody: {
    color: Colors.text2,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 21,
  },
  verdictCompare: {
    backgroundColor: Colors.surface2,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 6,
  },
  compareLabel: {
    color: Colors.text3,
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  compareValue: {
    color: Colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
  },
  nextActionCard: {
    backgroundColor: Colors.accentBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 6,
  },
  nextActionLabel: {
    color: Colors.text3,
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  nextActionText: {
    color: Colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    color: Colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  cardMeta: {
    color: Colors.text2,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeBtnActive: {
    backgroundColor: Colors.accentBg,
    borderColor: Colors.accent,
  },
  modeText: {
    color: Colors.text2,
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  modeTextActive: {
    color: Colors.text,
  },
  chartShell: {
    backgroundColor: Colors.surface2,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 12,
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 10,
  },
  chartLegendLabel: {
    color: Colors.text3,
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  chartLegendValue: {
    color: Colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    marginTop: 4,
  },
  chartLegendDate: {
    color: Colors.text2,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  chartTags: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  chartTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.surface3,
  },
  chartDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  chartTagText: {
    color: Colors.text2,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  proofRow: {
    flexDirection: 'row',
    gap: 10,
  },
  proofCard: {
    flex: 1,
    backgroundColor: Colors.surface2,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 6,
  },
  proofLabel: {
    color: Colors.text3,
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  proofValue: {
    color: Colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
  },
  proofNote: {
    color: Colors.text2,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  evidenceList: {
    gap: 10,
  },
  evidenceRow: {
    backgroundColor: Colors.surface2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 4,
  },
  evidenceLabel: {
    color: Colors.text3,
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  evidenceValue: {
    color: Colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  sessionDate: {
    color: Colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  sessionMeta: {
    color: Colors.text2,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  emptyIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: Colors.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: Colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    textAlign: 'center',
  },
  emptyBody: {
    color: Colors.text2,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryBtnText: {
    color: Colors.text2,
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#18140f',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.64)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    paddingBottom: 28,
    maxHeight: '82%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  pickerSearchInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    backgroundColor: Colors.surface2,
    color: Colors.text,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
  },
  modalEyebrow: {
    color: Colors.text3,
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  modalTitle: {
    color: Colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
  },
  modalBody: {
    paddingTop: 14,
    gap: 10,
  },
  pickerEmptyState: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    padding: 16,
    gap: 6,
  },
  pickerEmptyTitle: {
    color: Colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
  pickerEmptyBody: {
    color: Colors.text2,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 18,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface2,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  pickerRowActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentBg,
  },
  pickerTitle: {
    color: Colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  pickerMeta: {
    color: Colors.text2,
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 4,
  },
  historyTag: {
    color: Colors.text,
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  newTag: {
    color: Colors.text3,
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  editRow: {
    gap: 8,
    backgroundColor: Colors.surface2,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  editLabel: {
    color: Colors.text2,
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  editInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: Colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
});
