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
  calculateEstimated1RM,
  STRENGTH_LIFT_CONFIG,
  STRENGTH_LIFT_ORDER,
  STRENGTH_MUSCLE_CONFIG,
  TRAINING_LEVEL_LABELS,
  VOLUME_MUSCLE_CONFIG,
  type HeatmapSide,
  type StrengthLiftKey,
  type StrengthMuscleId,
  type TrainingLevel,
  type VolumeMuscleId,
} from '@/constants/heatmap';
import { DAYS } from '@/constants/workoutData';
import { useWorkout } from '@/context/WorkoutContext';
import { showAlert } from '@/lib/alerts';
import type { SessionLog, WeightLogEntry } from '@/context/WorkoutContext';

type HeatmapMode = 'volume' | 'strength';

type HeatCard = {
  id: string;
  label: string;
  dotColor: string;
  primaryText: string;
  secondaryText: string;
  tertiaryText?: string;
  progress?: number;
  muted?: boolean;
};

type DerivedLiftMetric = {
  liftKey: StrengthLiftKey;
  label: string;
  e1rm: number | null;
  sessionCount: number;
};

const LIFT_NAME_MATCHERS: Record<StrengthLiftKey, string[]> = {
  overhead_press: ['seated db shoulder press', 'overhead press', 'shoulder press'],
  incline_press: ['incline barbell press', 'incline db press', 'incline dumbbell press'],
  pullup: ['weighted pull ups', 'weighted pullups', 'lat pulldown', 'pull ups', 'pullups'],
  seated_row: ['seated cable row'],
  hammer_curl: ['hammer curls', 'hammer curl'],
  skull_crusher: ['skull crushers', 'skull crusher', 'cable overhead tricep extension'],
  hack_squat: ['hack squat', 'leg press'],
  romanian_deadlift: ['romanian deadlift'],
  standing_calf_raise: ['standing calf raises', 'standing calf raise'],
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getVolumeColor(progress: number) {
  if (progress <= 0) return Colors.surface3;
  if (progress < 0.4) return '#2f4254';
  if (progress < 0.8) return Colors.blue;
  if (progress < 1) return Colors.accent;
  if (progress < 1.25) return Colors.green;
  return Colors.orange;
}

function getStrengthColor(ratio: number | null, tracked: boolean) {
  if (!tracked) return Colors.text3;
  if (ratio === null) return Colors.surface3;
  if (ratio < 0.6) return '#9f2f2f';
  if (ratio < 0.8) return Colors.orange;
  if (ratio < 1.0) return '#f0c45c';
  if (ratio < 1.2) return '#d9d5c8';
  if (ratio < 1.5) return '#86d38f';
  return Colors.green;
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
        <Pressable
          key={option.value}
          style={[styles.segmentChip, value === option.value && styles.segmentChipActive]}
          onPress={() => onChange(option.value)}
        >
          <Text style={[styles.segmentText, value === option.value && styles.segmentTextActive]}>
            {option.label}
          </Text>
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
      <Text style={[styles.heatCardPrimary, card.muted && styles.heatCardMutedText]}>
        {card.primaryText}
      </Text>
      <Text style={styles.heatCardSecondary}>{card.secondaryText}</Text>
      {card.tertiaryText ? <Text style={styles.heatCardTertiary}>{card.tertiaryText}</Text> : null}
      {typeof card.progress === 'number' ? (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${clamp(card.progress) * 100}%` as any,
                backgroundColor: card.dotColor,
              },
            ]}
          />
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

  const xy = points.map((point, index) => {
    const x = left + (index / Math.max(points.length - 1, 1)) * chartWidth;
    const y = top + chartHeight - ((point.weight - min) / range) * chartHeight;
    return { ...point, x, y };
  });

  const path = xy.reduce((acc, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    return `${acc} L ${point.x} ${point.y}`;
  }, '');

  return (
    <View style={styles.chartWrap}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path d={`M ${left} ${top + chartHeight} L ${width - right} ${top + chartHeight}`} stroke={Colors.border} strokeWidth="1.5" />
        <Path d={path} stroke={Colors.accent} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {xy.map(point => (
          <Circle key={point.id} cx={point.x} cy={point.y} r="4" fill={Colors.accent} />
        ))}
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
  const {
    getWeeklyVolume,
    isDeloadWeek,
    strengthProfile,
    setStrengthProfile,
    weightLogs,
    logBodyweight,
    workoutLog,
  } = useWorkout();

  const [mode, setMode] = useState<HeatmapMode>('volume');
  const [side, setSide] = useState<HeatmapSide>('front');
  const [weightDraft, setWeightDraft] = useState('');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const weeklyVolume = useMemo(() => getWeeklyVolume(), [getWeeklyVolume]);
  const latestWeight = weightLogs[0]?.weight ?? ((strengthProfile?.bodyweightLbs ?? 0) > 0 ? strengthProfile?.bodyweightLbs ?? null : null);
  const trainingLevel = strengthProfile?.trainingLevel ?? 'intermediate';

  const exerciseLookup = useMemo(() => {
    const map: Record<string, string> = {};
    for (const day of DAYS) {
      day.exercises?.forEach((exercise, index) => {
        map[`${day.id}_${index}`] = exercise.name;
      });
    }
    return map;
  }, []);

  const derivedLiftMetrics = useMemo((): Record<StrengthLiftKey, DerivedLiftMetric> => {
    const metrics = {} as Record<StrengthLiftKey, DerivedLiftMetric>;
    for (const liftKey of STRENGTH_LIFT_ORDER) {
      const matches = LIFT_NAME_MATCHERS[liftKey];
      let bestE1rm: number | null = null;
      let sessionCount = 0;

      for (const [storageKey, sessions] of Object.entries(workoutLog)) {
        const exerciseName = exerciseLookup[storageKey];
        if (!exerciseName) continue;
        const normalized = normalizeLabel(exerciseName);
        if (!matches.some(match => normalized.includes(match))) continue;

        sessionCount += sessions.length;
        for (const session of sessions as SessionLog[]) {
          for (const set of session.sets) {
            const e1rm = calculateEstimated1RM(set.weight, set.reps);
            if (e1rm === null) continue;
            if (bestE1rm === null || e1rm > bestE1rm) {
              bestE1rm = e1rm;
            }
          }
        }
      }

      metrics[liftKey] = {
        liftKey,
        label: STRENGTH_LIFT_CONFIG[liftKey].label,
        e1rm: bestE1rm,
        sessionCount,
      };
    }
    return metrics;
  }, [exerciseLookup, workoutLog]);

  const volumeCards = useMemo(() => {
    return VOLUME_MUSCLE_CONFIG
      .filter(item => item.side === 'both' || item.side === side)
      .map(item => {
        const sets = weeklyVolume[item.sourceKey] || 0;
        const target = isDeloadWeek
          ? {
              min: Math.ceil(item.target.min * 0.6),
              max: item.target.max ? Math.ceil(item.target.max * 0.6) : undefined,
            }
          : item.target;
        const targetCount = target.max ?? target.min;
        const progress = targetCount > 0 ? sets / targetCount : 0;
        return {
          id: item.id,
          label: item.label,
          sets,
          target,
          progress,
          color: getVolumeColor(progress),
        };
      });
  }, [isDeloadWeek, side, weeklyVolume]);

  const volumeFigureColors = useMemo(() => {
    const findCard = (id: VolumeMuscleId) => volumeCards.find(card => card.id === id);
    return {
      front_delts: findCard('shoulders')?.color,
      rear_delts: findCard('shoulders')?.color,
      lateral_delts: findCard('lateral_delts')?.color ?? findCard('shoulders')?.color,
      upper_chest: findCard('upper_chest')?.color,
      triceps_long_head: findCard('long_head_triceps')?.color,
      lats: findCard('back')?.color,
      mid_back: findCard('back')?.color,
      biceps: findCard('biceps')?.color,
      brachioradialis: findCard('forearms_total')?.color,
      forearms: findCard('forearms_total')?.color,
      quads: findCard('legs')?.color,
      hamstrings: findCard('legs')?.color,
      glutes: findCard('legs')?.color,
      calves: findCard('calves')?.color,
    };
  }, [volumeCards]);

  const strengthMetrics = useMemo(() => {
    const totals: Partial<Record<StrengthMuscleId, { sum: number; count: number }>> = {};

    for (const liftKey of STRENGTH_LIFT_ORDER) {
      const lift = STRENGTH_LIFT_CONFIG[liftKey];
      const metric = derivedLiftMetrics[liftKey];
      if (metric.e1rm === null || latestWeight === null) continue;

      const target = lift.standards[trainingLevel] * latestWeight;
      const ratio = target <= 0 ? (metric.e1rm > 0 ? 1 : 0) : metric.e1rm / target;

      for (const muscle of lift.primaryMuscles) {
        const current = totals[muscle] ?? { sum: 0, count: 0 };
        totals[muscle] = { sum: current.sum + ratio, count: current.count + 1 };
      }

      for (const muscle of lift.secondaryMuscles) {
        const current = totals[muscle] ?? { sum: 0, count: 0 };
        totals[muscle] = { sum: current.sum + ratio * 0.6, count: current.count + 1 };
      }
    }

    const ratios: Partial<Record<StrengthMuscleId, number | null>> = {};
    const cards: HeatCard[] = STRENGTH_MUSCLE_CONFIG
      .filter(muscle => muscle.side === 'both' || muscle.side === side)
      .map(muscle => {
        const aggregate = totals[muscle.id];
        const ratio = aggregate ? aggregate.sum / aggregate.count : null;
        ratios[muscle.id] = ratio;

        if (!muscle.tracked) {
          return {
            id: muscle.id,
            label: muscle.label,
            dotColor: getStrengthColor(null, false),
            primaryText: 'Untracked',
            secondaryText: 'No direct lift target for this muscle',
            tertiaryText: 'Shown in gray on the map',
            muted: true,
          };
        }

        const metric = derivedLiftMetrics[muscle.displayLiftKey!];
        const target1RM = latestWeight === null ? null : STRENGTH_LIFT_CONFIG[muscle.displayLiftKey!].standards[trainingLevel] * latestWeight;
        const color = getStrengthColor(ratio, true);
        const hasWeight = latestWeight !== null;

        return {
          id: muscle.id,
          label: muscle.label,
          dotColor: color,
          primaryText: metric.e1rm === null ? 'No logged lift yet' : formatLiftValue(metric.e1rm),
          secondaryText: !hasWeight
            ? 'Log bodyweight to calculate your standard'
            : `target ${formatLiftValue(target1RM)}`,
          tertiaryText: metric.e1rm === null
            ? 'Strength is pulled automatically from workout logs'
            : hasWeight
            ? `${formatPercent(ratio)} of standard`
            : `${metric.sessionCount} logged sessions`,
          muted: metric.e1rm === null || !hasWeight,
        };
      });

    const figureColors = {
      front_delts: getStrengthColor(ratios.front_delts ?? null, true),
      lateral_delts: getStrengthColor(ratios.lateral_delts ?? null, true),
      upper_chest: getStrengthColor(ratios.upper_chest ?? null, true),
      biceps: getStrengthColor(ratios.biceps ?? null, true),
      brachioradialis: getStrengthColor(ratios.brachioradialis ?? null, true),
      quads: getStrengthColor(ratios.quads ?? null, true),
      calves: getStrengthColor(ratios.calves ?? null, true),
      rear_delts: getStrengthColor(ratios.rear_delts ?? null, false),
      lats: getStrengthColor(ratios.lats ?? null, true),
      mid_back: getStrengthColor(ratios.mid_back ?? null, true),
      triceps_long_head: getStrengthColor(ratios.triceps_long_head ?? null, true),
      glutes: getStrengthColor(ratios.glutes ?? null, true),
      hamstrings: getStrengthColor(ratios.hamstrings ?? null, true),
      forearms: getStrengthColor(ratios.forearms ?? null, false),
    };

    return { ratios, cards, figureColors };
  }, [derivedLiftMetrics, latestWeight, side, trainingLevel]);

  const summaryCards = useMemo(() => {
    if (mode === 'volume') {
      const covered = volumeCards.filter(card => card.progress >= 1).length;
      const totalSets = volumeCards.reduce((sum, card) => sum + card.sets, 0);
      return [
        { label: 'Muscles', value: `${covered}/${volumeCards.length}` },
        { label: 'Sets', value: `${totalSets}` },
        { label: 'Mode', value: isDeloadWeek ? 'Deload' : 'Normal' },
      ];
    }

    const tracked = STRENGTH_MUSCLE_CONFIG.filter(muscle => muscle.tracked);
    const atStandard = tracked.filter(muscle => {
      const ratio = strengthMetrics.ratios[muscle.id];
      return ratio !== null && ratio !== undefined && ratio >= 1;
    }).length;
    const loggedLifts = STRENGTH_LIFT_ORDER.filter(liftKey => derivedLiftMetrics[liftKey].e1rm !== null).length;

    return [
      { label: 'Bodyweight', value: latestWeight === null ? '—' : `${Math.round(latestWeight)} lbs` },
      { label: 'Tracked', value: `${atStandard}/${tracked.length}` },
      { label: 'Lifts', value: `${loggedLifts}` },
    ];
  }, [derivedLiftMetrics, isDeloadWeek, latestWeight, mode, strengthMetrics.ratios, volumeCards]);

  const visibleCards = mode === 'volume'
    ? volumeCards.map(card => {
        const targetLabel = card.target.max ? `${card.target.min}-${card.target.max}` : `${card.target.min}`;
        return {
          id: card.id,
          label: card.label,
          dotColor: card.color,
          primaryText: `${card.sets} sets / ${targetLabel} target`,
          secondaryText: card.progress >= 1 ? 'Weekly target met' : `${Math.round(clamp(card.progress, 0, 2) * 100)}% of target`,
          progress: clamp(card.progress),
        } satisfies HeatCard;
      })
    : strengthMetrics.cards;

  const figureColors = mode === 'volume' ? volumeFigureColors : strengthMetrics.figureColors;

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
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Heatmap</Text>
          <Text style={styles.subtitle}>
            {mode === 'volume' ? 'Weekly training distribution' : 'Strength pulled from logged workouts'}
          </Text>
        </View>
        {mode === 'volume' && isDeloadWeek ? (
          <View style={styles.badge}>
            <Feather name="battery-charging" size={12} color={Colors.orange} />
            <Text style={styles.badgeText}>Deload</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.controls}>
        <SegmentControl
          value={mode}
          options={[
            { value: 'volume', label: 'Volume Heatmap' },
            { value: 'strength', label: 'Strength Heatmap' },
          ]}
          onChange={setMode}
        />
        <SegmentControl
          value={side}
          options={[
            { value: 'front', label: 'Front' },
            { value: 'back', label: 'Back' },
          ]}
          onChange={setSide}
        />
      </View>

      <View style={styles.summaryRow}>
        {summaryCards.map(card => (
          <View key={card.label} style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{card.value}</Text>
            <Text style={styles.summaryLabel}>{card.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomPad + 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {mode === 'strength' ? (
          <>
            <View style={styles.profileCard}>
              <Text style={styles.sectionLabel}>Strength Profile</Text>
              <Text style={styles.figureHint}>
                Strength is detected from your logged workouts automatically. Bodyweight is the only thing you need to log manually.
              </Text>
              <View style={styles.levelRow}>
                {(['beginner', 'intermediate', 'advanced'] as TrainingLevel[]).map(level => (
                  <Pressable
                    key={level}
                    style={[styles.levelChip, trainingLevel === level && styles.levelChipActive]}
                    onPress={() => setTrainingLevel(level)}
                  >
                    <Text style={[styles.levelChipText, trainingLevel === level && styles.levelChipTextActive]}>
                      {TRAINING_LEVEL_LABELS[level]}
                    </Text>
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
              <Text style={styles.profileText}>
                Current: {latestWeight === null ? 'No bodyweight logged yet' : `${Math.round(latestWeight)} lbs`}
              </Text>
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
          </>
        ) : null}

        <View style={styles.figureCard}>
          <View style={styles.figureHeader}>
            <View>
              <Text style={styles.sectionLabel}>{mode === 'volume' ? 'Body Heatmap' : 'Strength Map'}</Text>
              <Text style={styles.figureHint}>
                {mode === 'volume'
                  ? 'Weekly set count lights up each muscle zone.'
                  : 'Each muscle is colored from your best logged lift performance for that area.'}
              </Text>
            </View>
            <View style={styles.sideBadge}>
              <Text style={styles.sideBadgeText}>{side.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.figureStage}>
            <BodyHeatmapFigure side={side} colors={figureColors} />
          </View>

          <Text style={styles.legendText}>
            {mode === 'volume'
              ? 'Blue to green means you are approaching target volume. Orange means you are above target.'
              : 'Red is behind standard, white is around standard, and green is above standard.'}
          </Text>
        </View>

        {mode === 'strength' ? (
          <View style={styles.autoCard}>
            <Text style={styles.sectionLabel}>Detected Lift Signals</Text>
            <View style={styles.autoGrid}>
              {STRENGTH_LIFT_ORDER.map(liftKey => {
                const metric = derivedLiftMetrics[liftKey];
                return (
                  <View key={liftKey} style={styles.autoItem}>
                    <Text style={styles.autoItemTitle}>{metric.label}</Text>
                    <Text style={styles.autoItemValue}>
                      {metric.e1rm === null ? 'No log yet' : `${metric.e1rm} lbs e1RM`}
                    </Text>
                    <Text style={styles.autoItemMeta}>{metric.sessionCount} logged sessions</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.cardsSection}>
          <Text style={styles.sectionLabel}>
            {mode === 'volume' ? 'Muscle Cards' : 'Muscle Scorecards'}
          </Text>
          <View style={styles.cardsGrid}>
            {visibleCards.map(card => (
              <HeatCardView key={card.id} card={card} />
            ))}
          </View>
        </View>
      </ScrollView>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: Colors.text,
    letterSpacing: 1,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.text3,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,159,82,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,159,82,0.3)',
  },
  badgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.orange,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  controls: {
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 12,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  segmentChip: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentChipActive: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border2,
  },
  segmentText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.text3,
  },
  segmentTextActive: {
    color: Colors.text,
    fontFamily: 'Inter_600SemiBold',
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  summaryValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.text,
  },
  summaryLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  profileCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  profileText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.text,
  },
  profileInput: {
    flex: 1,
    backgroundColor: Colors.surface2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: Colors.text,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
  },
  levelRow: {
    flexDirection: 'row',
    gap: 8,
  },
  levelChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  levelChipActive: {
    borderColor: Colors.accent,
    backgroundColor: 'rgba(232,255,71,0.08)',
  },
  levelChipText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
  },
  levelChipTextActive: {
    color: Colors.text,
  },
  weightEntryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButtonCompact: {
    borderRadius: 10,
    backgroundColor: Colors.accent,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: '#000',
    letterSpacing: 0.5,
  },
  weightCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 12,
    gap: 10,
  },
  chartWrap: {
    marginTop: 8,
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  chartLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.text3,
  },
  emptyChart: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    padding: 18,
    marginTop: 8,
  },
  emptyChartText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.text3,
    textAlign: 'center',
  },
  weightMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weightMetaText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.text2,
  },
  figureCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 12,
  },
  figureStage: {
    marginTop: 14,
    marginBottom: 10,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 14,
  },
  figureHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  figureHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.text2,
    lineHeight: 18,
    marginTop: 6,
  },
  sideBadge: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sideBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.text2,
    letterSpacing: 1,
  },
  legendText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.text3,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: -4,
  },
  autoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 12,
  },
  autoGrid: {
    gap: 10,
    marginTop: 10,
  },
  autoItem: {
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 4,
  },
  autoItemTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.text,
  },
  autoItemValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: Colors.accent,
  },
  autoItemMeta: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.text3,
  },
  cardsSection: {
    marginBottom: 12,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  heatCard: {
    width: '48%',
    minWidth: 160,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 8,
  },
  heatCardMuted: {
    opacity: 0.88,
  },
  heatCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  heatCardTitle: {
    flex: 1,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.text,
  },
  heatCardPrimary: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.text,
  },
  heatCardMutedText: {
    color: Colors.text2,
  },
  heatCardSecondary: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.text2,
    lineHeight: 17,
  },
  heatCardTertiary: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.text3,
    lineHeight: 17,
  },
  progressTrack: {
    height: 6,
    borderRadius: 4,
    backgroundColor: Colors.surface3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
});


