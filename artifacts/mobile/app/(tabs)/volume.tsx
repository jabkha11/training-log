import React, { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { BodyHeatmapFigure } from '@/components/BodyHeatmapFigure';
import { Colors } from '@/constants/colors';
import {
  STRENGTH_LIFT_CONFIG,
  STRENGTH_LIFT_ORDER,
  STRENGTH_MUSCLE_CONFIG,
  TRAINING_LEVEL_LABELS,
  VOLUME_MUSCLE_CONFIG,
  type HeatmapSide,
  type StrengthMuscleId,
  type TrainingLevel,
  type VolumeMuscleId,
} from '@/constants/heatmap';
import { useProgram } from '@/context/ProgramContext';
import { useWorkout } from '@/context/WorkoutContext';
import { showAlert } from '@/lib/alerts';
import { getCurrentLocalWeekRange } from '@/lib/date';
import { getMuscleVolumeByRange, getScopedWorkoutLogForSlots, getStrengthMetricsBySignal, getWeakPointInsights } from '@/lib/analytics';
import type { WeightLogEntry } from '@/context/WorkoutContext';

type HeatmapMode = 'volume' | 'strength';
type HeatCard = {
  id: string;
  label: string;
  dotColor: string;
  statusLabel?: string;
  primaryText: string;
  secondaryText: string;
  tertiaryText?: string;
  progress?: number;
  muted?: boolean;
};

type HeatBucketKey = 'very_low' | 'low' | 'on_target' | 'high' | 'very_high' | 'untracked';

type LegendItem = {
  key: HeatBucketKey;
  label: string;
  meaning: string;
  color: string;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

const HEAT_BUCKET_COLORS: Record<HeatBucketKey, string> = {
  very_low: '#2f6fb1',
  low: '#7fb0e2',
  on_target: '#e7d36e',
  high: '#ef9561',
  very_high: '#de5b4f',
  untracked: '#6d7480',
};

const VOLUME_LEGEND: LegendItem[] = [
  { key: 'very_low', label: 'Very Low', meaning: 'Well below weekly target', color: HEAT_BUCKET_COLORS.very_low },
  { key: 'low', label: 'Low', meaning: 'Below weekly target', color: HEAT_BUCKET_COLORS.low },
  { key: 'on_target', label: 'On Target', meaning: 'Right around weekly target', color: HEAT_BUCKET_COLORS.on_target },
  { key: 'high', label: 'High', meaning: 'Above weekly target', color: HEAT_BUCKET_COLORS.high },
  { key: 'very_high', label: 'Very High', meaning: 'Well above weekly target', color: HEAT_BUCKET_COLORS.very_high },
];

const STRENGTH_LEGEND: LegendItem[] = [
  { key: 'very_low', label: 'Very Low', meaning: 'Well below your current standard', color: HEAT_BUCKET_COLORS.very_low },
  { key: 'low', label: 'Low', meaning: 'Below your current standard', color: HEAT_BUCKET_COLORS.low },
  { key: 'on_target', label: 'On Target', meaning: 'Right around your current standard', color: HEAT_BUCKET_COLORS.on_target },
  { key: 'high', label: 'High', meaning: 'Above your current standard', color: HEAT_BUCKET_COLORS.high },
  { key: 'very_high', label: 'Very High', meaning: 'Well above your current standard', color: HEAT_BUCKET_COLORS.very_high },
  { key: 'untracked', label: 'Untracked', meaning: 'No mapped strength signal here', color: HEAT_BUCKET_COLORS.untracked },
];

function getVolumeBucket(progress: number): HeatBucketKey {
  if (progress < 0.35) return 'very_low';
  if (progress < 0.8) return 'low';
  if (progress <= 1.1) return 'on_target';
  if (progress <= 1.35) return 'high';
  return 'very_high';
}

function getStrengthBucket(ratio: number | null, tracked: boolean): HeatBucketKey {
  if (!tracked) return 'untracked';
  if (ratio === null) return 'very_low';
  if (ratio < 0.6) return 'very_low';
  if (ratio < 0.9) return 'low';
  if (ratio <= 1.1) return 'on_target';
  if (ratio <= 1.35) return 'high';
  return 'very_high';
}

function getBucketColor(bucket: HeatBucketKey) {
  return HEAT_BUCKET_COLORS[bucket];
}

function getCoverageStatusLabel(bucket: HeatBucketKey) {
  if (bucket === 'very_low' || bucket === 'low') return 'Below target';
  if (bucket === 'on_target') return 'Near target';
  if (bucket === 'high' || bucket === 'very_high') return 'Above target';
  return 'Untracked';
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function formatLiftValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${Math.round(value)} lbs`;
}

function SegmentControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map(option => (
        <Pressable key={option.value} style={[styles.segmentChip, value === option.value && styles.segmentChipActive]} onPress={() => onChange(option.value)}>
          <Text style={[styles.segmentText, value === option.value && styles.segmentTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function HeatCardView({ card }: { card: HeatCard }) {
  return (
    <View style={[styles.heatCard, card.muted && styles.heatCardMuted]}>
      <View style={styles.heatCardHeader}>
        <View style={[styles.dot, { backgroundColor: card.dotColor }]} />
        <Text style={styles.heatCardTitle}>{card.label}</Text>
      </View>
      {card.statusLabel ? <Text style={[styles.heatCardStatus, card.muted && styles.heatCardMutedText]}>{card.statusLabel}</Text> : null}
      <Text style={[styles.heatCardPrimary, card.muted && styles.heatCardMutedText]}>{card.primaryText}</Text>
      <Text style={styles.heatCardSecondary}>{card.secondaryText}</Text>
      {card.tertiaryText ? <Text style={styles.heatCardTertiary}>{card.tertiaryText}</Text> : null}
      {typeof card.progress === 'number' ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${clamp(card.progress) * 100}%` as any, backgroundColor: card.dotColor }]} />
        </View>
      ) : null}
    </View>
  );
}

function WeightTrendChart({ logs }: { logs: WeightLogEntry[] }) {
  const points = useMemo(() => logs.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-8), [logs]);
  if (points.length === 0) {
    return (
      <View style={styles.emptyChart}>
        <Text style={styles.emptyChartText}>Log bodyweight to see a trend line.</Text>
      </View>
    );
  }

  const values = points.map(point => point.weight);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const width = 300;
  const height = 120;
  const left = 14;
  const right = 14;
  const top = 16;
  const bottom = 18;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  const xy = points.map((point, index) => ({
    ...point,
    x: left + (index / Math.max(points.length - 1, 1)) * chartWidth,
    y: top + chartHeight - ((point.weight - min) / range) * chartHeight,
  }));
  const path = xy.reduce((acc, point, index) => (index === 0 ? `M ${point.x} ${point.y}` : `${acc} L ${point.x} ${point.y}`), '');

  return (
    <View style={styles.chartWrap}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path d={`M ${left} ${top + chartHeight} L ${width - right} ${top + chartHeight}`} stroke={Colors.border} strokeWidth="1.5" />
        <Path d={path} stroke={Colors.accent} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {xy.map(point => <Circle key={point.id} cx={point.x} cy={point.y} r="4" fill={Colors.accent} />)}
      </Svg>
      <View style={styles.chartLabels}>
        <Text style={styles.chartLabel}>{points[0].date}</Text>
        <Text style={styles.chartLabel}>{points[points.length - 1].date}</Text>
      </View>
    </View>
  );
}

export default function HeatmapScreen() {
  const insets = useSafeAreaInsets();
  const { days, getDaySlots } = useProgram();
  const { isDeloadWeek, strengthProfile, setStrengthProfile, weightLogs, logBodyweight, workoutLog } = useWorkout();
  const [mode, setMode] = useState<HeatmapMode>('volume');
  const [side, setSide] = useState<HeatmapSide>('front');
  const [weightDraft, setWeightDraft] = useState('');
  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 14) : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const { weekStart, weekEnd } = useMemo(() => getCurrentLocalWeekRange(), []);
  const activeSlots = useMemo(() => days.flatMap(day => getDaySlots(day.id)), [days, getDaySlots]);
  const activeWorkoutLog = useMemo(() => getScopedWorkoutLogForSlots(workoutLog, activeSlots), [activeSlots, workoutLog]);

  const latestWeight = weightLogs[0]?.weight ?? ((strengthProfile?.bodyweightLbs ?? 0) > 0 ? strengthProfile?.bodyweightLbs ?? null : null);
  const trainingLevel = strengthProfile?.trainingLevel ?? 'intermediate';
  const weeklyVolume = useMemo(() => getMuscleVolumeByRange(activeWorkoutLog, { start: weekStart, end: weekEnd }), [activeWorkoutLog, weekEnd, weekStart]);
  const strengthMetrics = useMemo(() => getStrengthMetricsBySignal(activeWorkoutLog), [activeWorkoutLog]);

  const volumeCards = useMemo(() => {
    return VOLUME_MUSCLE_CONFIG
      .filter(item => item.side === 'both' || item.side === side)
      .map(item => {
        const entry = weeklyVolume[item.sourceKey];
        const sets = entry?.weightedSets ?? 0;
        const target = isDeloadWeek
          ? { min: Math.ceil(item.target.min * 0.6), max: item.target.max ? Math.ceil(item.target.max * 0.6) : undefined }
          : item.target;
        const targetCount = target.max ?? target.min;
        const progress = targetCount > 0 ? sets / targetCount : 0;
        const bucket = getVolumeBucket(progress);
        return { id: item.id, label: item.label, sets, target, progress, bucket, color: getBucketColor(bucket) };
      });
  }, [isDeloadWeek, side, weeklyVolume]);

  const volumeFigureColors = useMemo(() => {
    const findCard = (id: VolumeMuscleId) => volumeCards.find(card => card.id === id);
    return {
      front_delts: findCard('shoulders')?.color,
      rear_delts: findCard('shoulders')?.color,
      lateral_delts: findCard('lateral_delts')?.color ?? findCard('shoulders')?.color,
      upper_chest: findCard('upper_chest')?.color,
      abs: findCard('abdominals')?.color,
      obliques: findCard('obliques')?.color ?? findCard('abdominals')?.color,
      triceps_long_head: findCard('long_head_triceps')?.color,
      lats: findCard('back')?.color,
      mid_back: findCard('back')?.color,
      traps: findCard('traps')?.color ?? findCard('back')?.color,
      biceps: findCard('biceps')?.color,
      brachioradialis: findCard('forearms_total')?.color,
      forearms: findCard('forearms_total')?.color,
      quads: findCard('legs')?.color,
      hamstrings: findCard('legs')?.color,
      glutes: findCard('legs')?.color,
      calves: findCard('calves')?.color,
    };
  }, [volumeCards]);

  const strengthView = useMemo(() => {
    const ratios: Partial<Record<StrengthMuscleId, number | null>> = {};
    const totals: Partial<Record<StrengthMuscleId, { sum: number; count: number }>> = {};

    STRENGTH_LIFT_ORDER.forEach(liftKey => {
      const metric = strengthMetrics[liftKey];
      if (metric.e1rm === null || latestWeight === null) return;
      const lift = STRENGTH_LIFT_CONFIG[liftKey];
      const target = lift.standards[trainingLevel] * latestWeight;
      const ratio = target <= 0 ? (metric.e1rm > 0 ? 1 : 0) : metric.e1rm / target;

      lift.primaryMuscles.forEach(muscle => {
        const current = totals[muscle] ?? { sum: 0, count: 0 };
        totals[muscle] = { sum: current.sum + ratio, count: current.count + 1 };
      });
      lift.secondaryMuscles.forEach(muscle => {
        const current = totals[muscle] ?? { sum: 0, count: 0 };
        totals[muscle] = { sum: current.sum + ratio * 0.6, count: current.count + 1 };
      });
    });

    const cards: HeatCard[] = STRENGTH_MUSCLE_CONFIG
      .filter(muscle => muscle.side === 'both' || muscle.side === side)
      .map(muscle => {
        const aggregate = totals[muscle.id];
        const ratio = aggregate ? aggregate.sum / aggregate.count : null;
        ratios[muscle.id] = ratio;
        const bucket = getStrengthBucket(ratio, muscle.tracked);

        if (!muscle.tracked) {
          return {
            id: muscle.id,
            label: muscle.label,
            dotColor: getBucketColor(bucket),
            statusLabel: getCoverageStatusLabel(bucket),
            primaryText: 'Untracked',
            secondaryText: 'No explicit strength signal mapped for this muscle',
            tertiaryText: 'Shown muted on the figure',
            muted: true,
          };
        }

        const liftKey = muscle.displayLiftKey!;
        const metric = strengthMetrics[liftKey];
        const target1rm = latestWeight === null ? null : STRENGTH_LIFT_CONFIG[liftKey].standards[trainingLevel] * latestWeight;
        return {
          id: muscle.id,
          label: muscle.label,
          dotColor: getBucketColor(bucket),
          statusLabel: getCoverageStatusLabel(bucket),
          primaryText: metric.e1rm === null ? 'No logged lift yet' : formatLiftValue(metric.e1rm),
          secondaryText: latestWeight === null ? 'Log bodyweight to calculate your standard' : `target ${formatLiftValue(target1rm)}`,
          tertiaryText: metric.e1rm === null ? 'Driven by slot strength signals' : latestWeight === null ? `${metric.sessionCount} logged sessions` : `${formatPercent(ratio)} of standard`,
          muted: metric.e1rm === null || latestWeight === null,
        };
      });

    return {
      cards,
      ratios,
      figureColors: {
        front_delts: getBucketColor(getStrengthBucket(ratios.front_delts ?? null, true)),
        lateral_delts: getBucketColor(getStrengthBucket(ratios.lateral_delts ?? null, true)),
        upper_chest: getBucketColor(getStrengthBucket(ratios.upper_chest ?? null, true)),
        abs: getBucketColor(getStrengthBucket(ratios.abs ?? null, true)),
        obliques: getBucketColor(getStrengthBucket(ratios.obliques ?? null, true)),
        biceps: getBucketColor(getStrengthBucket(ratios.biceps ?? null, true)),
        brachioradialis: getBucketColor(getStrengthBucket(ratios.brachioradialis ?? null, true)),
        quads: getBucketColor(getStrengthBucket(ratios.quads ?? null, true)),
        calves: getBucketColor(getStrengthBucket(ratios.calves ?? null, true)),
        rear_delts: getBucketColor(getStrengthBucket(ratios.rear_delts ?? null, false)),
        lats: getBucketColor(getStrengthBucket(ratios.lats ?? null, true)),
        mid_back: getBucketColor(getStrengthBucket(ratios.mid_back ?? null, true)),
        traps: getBucketColor(getStrengthBucket(ratios.traps ?? null, true)),
        triceps_long_head: getBucketColor(getStrengthBucket(ratios.triceps_long_head ?? null, true)),
        glutes: getBucketColor(getStrengthBucket(ratios.glutes ?? null, true)),
        hamstrings: getBucketColor(getStrengthBucket(ratios.hamstrings ?? null, true)),
        forearms: getBucketColor(getStrengthBucket(ratios.forearms ?? null, false)),
      },
    };
  }, [latestWeight, side, strengthMetrics, trainingLevel]);

  const summaryCards = useMemo(() => {
    if (mode === 'volume') {
      const covered = volumeCards.filter(card => card.progress >= 1).length;
      const totalSets = volumeCards.reduce((sum, card) => sum + card.sets, 0);
      return [
        { label: 'Covered', value: `${covered}/${volumeCards.length}` },
        { label: 'Sets', value: `${Math.round(totalSets * 10) / 10}` },
        { label: 'Week', value: isDeloadWeek ? 'Deload' : 'Normal' },
      ];
    }

    const tracked = STRENGTH_MUSCLE_CONFIG.filter(muscle => muscle.tracked);
    const atStandard = tracked.filter(muscle => {
      const ratio = strengthView.ratios[muscle.id];
      return ratio !== null && ratio !== undefined && ratio >= 1;
    }).length;
    const loggedLifts = STRENGTH_LIFT_ORDER.filter(liftKey => strengthMetrics[liftKey].e1rm !== null).length;
    return [
      { label: 'Bodyweight', value: latestWeight === null ? '—' : `${Math.round(latestWeight)} lbs` },
      { label: 'Tracked', value: `${atStandard}/${tracked.length}` },
      { label: 'Signals', value: `${loggedLifts}` },
    ];
  }, [isDeloadWeek, latestWeight, mode, strengthMetrics, strengthView.ratios, volumeCards]);

  const visibleCards = mode === 'volume'
    ? volumeCards.map(card => {
        const targetLabel = card.target.max ? `${card.target.min}-${card.target.max}` : `${card.target.min}`;
        return {
          id: card.id,
          label: card.label,
          dotColor: card.color,
          statusLabel: getCoverageStatusLabel(card.bucket),
          primaryText: `${Math.round(card.sets * 10) / 10} sets / ${targetLabel} target`,
          secondaryText: `${Math.round(clamp(card.progress, 0, 2) * 100)}% of weekly target`,
          progress: clamp(card.progress),
        } satisfies HeatCard;
      })
    : strengthView.cards;

  const legendItems = mode === 'volume' ? VOLUME_LEGEND : STRENGTH_LEGEND;

  const insightCards = useMemo(() => {
    if (mode === 'volume') {
      const weakVolumeMuscles = volumeCards
        .filter(card => card.progress < 0.8)
        .sort((a, b) => a.progress - b.progress)
        .slice(0, 2)
        .map(card => ({ label: card.label, progress: card.progress }));
      return getWeakPointInsights(activeWorkoutLog, { weakVolumeMuscles });
    }

    const missingStrengthSignals = STRENGTH_LIFT_ORDER
      .filter(liftKey => strengthMetrics[liftKey].e1rm === null)
      .slice(0, 2)
      .map(liftKey => STRENGTH_LIFT_CONFIG[liftKey].label);
    return getWeakPointInsights(activeWorkoutLog, { missingStrengthSignals });
  }, [activeWorkoutLog, mode, strengthMetrics, volumeCards]);

  const figureColors = mode === 'volume' ? volumeFigureColors : strengthView.figureColors;

  const saveBodyweight = () => {
    const nextWeight = Number(weightDraft);
    if (!Number.isFinite(nextWeight) || nextWeight <= 0) {
      showAlert('Invalid bodyweight', 'Enter a valid bodyweight in pounds.');
      return;
    }
    logBodyweight(nextWeight);
    setWeightDraft('');
  };

  const setTrainingLevel = (nextLevel: TrainingLevel) => {
    setStrengthProfile({
      bodyweightLbs: latestWeight ?? strengthProfile?.bodyweightLbs ?? 0,
      trainingLevel: nextLevel,
    });
  };

  return (
    <View testID="heatmap-screen" style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerEyebrow}>Analytics</Text>
          <Text style={styles.title}>Heatmap</Text>
          <Text style={styles.subtitle}>{mode === 'volume' ? 'See which muscles are below, near, or above your weekly volume targets.' : 'See which muscles are below, near, or above your current strength standard.'}</Text>
        </View>
        {mode === 'volume' && isDeloadWeek ? (
          <View style={styles.badge}>
            <Feather name="battery-charging" size={12} color={Colors.orange} />
            <Text style={styles.badgeText}>Deload</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.controls}>
        <SegmentControl value={mode} options={[{ value: 'volume', label: 'Volume' }, { value: 'strength', label: 'Strength' }]} onChange={setMode} />
        <SegmentControl value={side} options={[{ value: 'front', label: 'Front' }, { value: 'back', label: 'Back' }]} onChange={setSide} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: bottomPad + 120 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.summaryRow}>
          {summaryCards.map(card => (
            <View key={card.label} style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{card.value}</Text>
              <Text style={styles.summaryLabel}>{card.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.figureCard}>
          <View style={styles.figureHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionLabel}>{mode === 'volume' ? 'Volume Coverage' : 'Strength Coverage'}</Text>
              <Text style={styles.figureTitle}>{mode === 'volume' ? 'Which muscles are getting enough work this week' : 'Which muscles are keeping pace with your current standard'}</Text>
              <Text style={styles.figureHint}>
                {mode === 'volume'
                  ? `Based on sessions from ${weekStart} to ${weekEnd}. Colors show how close each muscle is to its weekly target.`
                  : 'Colors show how each tracked muscle is performing relative to your current bodyweight-based standard.'}
              </Text>
            </View>
            <View style={styles.sideBadge}><Text style={styles.sideBadgeText}>{side.toUpperCase()}</Text></View>
          </View>

          <View style={styles.figureStage}>
            <BodyHeatmapFigure side={side} colors={figureColors} />
          </View>
          <View style={styles.legendCard}>
            <Text style={styles.legendTitle}>{mode === 'volume' ? 'Color guide for weekly target coverage' : 'Color guide for strength standard coverage'}</Text>
            <View style={styles.legendGrid}>
              {legendItems.map(item => (
                <View key={item.key} style={styles.legendItem}>
                  <View style={[styles.legendSwatch, { backgroundColor: item.color }]} />
                  <View style={styles.legendCopy}>
                    <Text style={styles.legendLabel}>{item.label}</Text>
                    <Text style={styles.legendMeaning}>{item.meaning}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {insightCards.length > 0 ? (
          <View style={styles.insightsCard}>
            <Text style={styles.sectionLabel}>Insights</Text>
            <View style={styles.insightGrid}>
              {insightCards.map(card => (
                <View key={card.id} style={styles.insightItem}>
                  <Text style={styles.insightTitle}>{card.label}</Text>
                  <Text style={[styles.insightState, card.severity === 'watch' ? styles.insightStateWatch : null]}>
                    {card.severity === 'watch' ? 'Watch' : 'Info'}
                  </Text>
                  <Text style={styles.insightMeta}>{card.message}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {mode === 'strength' ? (
          <>
            <View style={styles.profileCard}>
              <Text style={styles.sectionLabel}>Strength Profile</Text>
              <Text style={styles.profileHint}>Bodyweight is the only manual input here. Everything else reads from logged slot signals.</Text>
              <View style={styles.levelRow}>
                {(['beginner', 'intermediate', 'advanced'] as TrainingLevel[]).map(level => (
                  <Pressable key={level} style={[styles.levelChip, trainingLevel === level && styles.levelChipActive]} onPress={() => setTrainingLevel(level)}>
                    <Text style={[styles.levelChipText, trainingLevel === level && styles.levelChipTextActive]}>{TRAINING_LEVEL_LABELS[level]}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.weightEntryRow}>
                <TextInput
                  style={styles.profileInput}
                  value={weightDraft}
                  onChangeText={setWeightDraft}
                  keyboardType="decimal-pad"
                  placeholder="Log bodyweight (lbs)"
                  placeholderTextColor={Colors.text3}
                />
                <TouchableOpacity style={styles.primaryButtonCompact} onPress={saveBodyweight}>
                  <Text style={styles.primaryButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.profileText}>Current: {latestWeight === null ? 'No bodyweight logged yet' : `${Math.round(latestWeight)} lbs`}</Text>
            </View>

            <View style={styles.weightCard}>
              <Text style={styles.sectionLabel}>Weight Trend</Text>
              <WeightTrendChart logs={weightLogs} />
              {weightLogs.length > 0 ? (
                <View style={styles.weightMetaRow}>
                  <Text style={styles.weightMetaText}>Latest {Math.round(weightLogs[0].weight)} lbs</Text>
                  <Text style={styles.weightMetaText}>{weightLogs[0].date}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.supportCard}>
              <Text style={styles.sectionLabel}>Detected Lift Signals</Text>
              <View style={styles.supportGrid}>
                {STRENGTH_LIFT_ORDER.map(liftKey => {
                  const metric = strengthMetrics[liftKey];
                  return (
                    <View key={liftKey} style={styles.supportItem}>
                      <Text style={styles.supportTitle}>{metric.label}</Text>
                      <Text style={styles.supportValue}>{metric.e1rm === null ? 'No log yet' : `${metric.e1rm} lbs e1RM`}</Text>
                      <Text style={styles.supportMeta}>{metric.sessionCount} logged sessions</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        ) : null}

        <View style={styles.cardsSection}>
          <Text style={styles.sectionLabel}>{mode === 'volume' ? 'Muscle Coverage' : 'Muscle Coverage Cards'}</Text>
          <View style={styles.cardsGrid}>
            {visibleCards.map(card => <HeatCardView key={card.id} card={card} />)}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  headerEyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: Colors.text3, letterSpacing: 2, textTransform: 'uppercase' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, color: Colors.text },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.text2, marginTop: 3, lineHeight: 18 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.warningBg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.warningBorder },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: Colors.orange, letterSpacing: 1, textTransform: 'uppercase' },
  controls: { paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  segmented: { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: 16, padding: 4, borderWidth: 1, borderColor: Colors.border, gap: 4 },
  segmentChip: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
  segmentChipActive: { backgroundColor: Colors.surface3, borderWidth: 1, borderColor: Colors.border2 },
  segmentText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.text3 },
  segmentTextActive: { color: Colors.text },
  scroll: { flex: 1, paddingHorizontal: 16 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  summaryCard: { flex: 1, backgroundColor: Colors.surface, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center', gap: 4 },
  summaryValue: { fontFamily: 'Inter_700Bold', fontSize: 17, color: Colors.text },
  summaryLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: Colors.text3, letterSpacing: 1.2, textTransform: 'uppercase' },
  figureCard: { backgroundColor: Colors.surface, borderRadius: 24, borderWidth: 1, borderColor: Colors.border2, padding: 16, marginBottom: 12 },
  figureHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: Colors.text3, letterSpacing: 1.8, textTransform: 'uppercase' },
  figureTitle: { fontFamily: 'Inter_700Bold', fontSize: 21, color: Colors.text, marginTop: 4 },
  figureHint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.text2, lineHeight: 18, marginTop: 5 },
  sideBadge: { alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2, paddingHorizontal: 10, paddingVertical: 6 },
  sideBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: Colors.text2, letterSpacing: 1.2 },
  figureStage: { marginTop: 16, marginBottom: 12, borderRadius: 24, overflow: 'hidden', backgroundColor: '#12171f', borderWidth: 1, borderColor: Colors.border, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 22 },
  legendCard: { borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2, padding: 12, gap: 10 },
  legendTitle: { fontFamily: 'Inter_700Bold', fontSize: 12, color: Colors.text },
  legendGrid: { gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendSwatch: { width: 12, height: 12, borderRadius: 999 },
  legendCopy: { flex: 1, gap: 1 },
  legendLabel: { fontFamily: 'Inter_700Bold', fontSize: 11, color: Colors.text },
  legendMeaning: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.text3, lineHeight: 16 },
  insightsCard: { backgroundColor: Colors.surface, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 12 },
  insightGrid: { gap: 10, marginTop: 10 },
  insightItem: { backgroundColor: Colors.surface2, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 4 },
  insightTitle: { fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.text },
  insightState: { fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.accent },
  insightStateWatch: { color: Colors.orange },
  insightMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.text2, lineHeight: 17 },
  profileCard: { backgroundColor: Colors.surface, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 12, gap: 12 },
  profileHint: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.text2, lineHeight: 18 },
  profileText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.text },
  profileInput: { flex: 1, backgroundColor: Colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 12, color: Colors.text, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  levelRow: { flexDirection: 'row', gap: 8 },
  levelChip: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border },
  levelChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accentBg },
  levelChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: Colors.text2 },
  levelChipTextActive: { color: Colors.text },
  weightEntryRow: { flexDirection: 'row', gap: 10 },
  primaryButtonCompact: { borderRadius: 14, backgroundColor: Colors.accent, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#12161d', letterSpacing: 0.5 },
  weightCard: { backgroundColor: Colors.surface, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 12, gap: 10 },
  chartWrap: { marginTop: 8 },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  chartLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: Colors.text3 },
  emptyChart: { borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2, padding: 18, marginTop: 8 },
  emptyChartText: { fontFamily: 'Inter_400Regular', fontSize: 12, color: Colors.text3, textAlign: 'center' },
  weightMetaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weightMetaText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: Colors.text2 },
  supportCard: { backgroundColor: Colors.surface, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 12 },
  supportGrid: { gap: 10, marginTop: 10 },
  supportItem: { backgroundColor: Colors.surface2, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 12, gap: 4 },
  supportTitle: { fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.text },
  supportValue: { fontFamily: 'Inter_700Bold', fontSize: 14, color: Colors.accent },
  supportMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.text3 },
  cardsSection: { marginBottom: 12 },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  heatCard: { width: '48%', minWidth: 160, backgroundColor: Colors.surface, borderRadius: 18, borderWidth: 1, borderColor: Colors.border, padding: 14, gap: 8 },
  heatCardMuted: { opacity: 0.88 },
  heatCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  heatCardTitle: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.text },
  heatCardStatus: { fontFamily: 'Inter_700Bold', fontSize: 10, color: Colors.text3, letterSpacing: 1.1, textTransform: 'uppercase' },
  heatCardPrimary: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.text },
  heatCardMutedText: { color: Colors.text2 },
  heatCardSecondary: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.text2, lineHeight: 17 },
  heatCardTertiary: { fontFamily: 'Inter_400Regular', fontSize: 11, color: Colors.text3, lineHeight: 17 },
  progressTrack: { height: 6, borderRadius: 4, backgroundColor: Colors.surface3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
});
