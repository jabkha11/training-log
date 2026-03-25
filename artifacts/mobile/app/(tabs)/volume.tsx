import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { MUSCLE_TARGETS } from '@/constants/workoutData';
import { useWorkout } from '@/context/WorkoutContext';

const MUSCLE_ORDER = [
  'Lateral Delts',
  'Forearms (total)',
  'Upper Chest',
  'Long Head Triceps',
  'Calves',
  'Back',
  'Biceps',
  'Legs',
  'Shoulders',
];

function VolumeBar({ muscle, sets, target }: { muscle: string; sets: number; target: { min: number; max?: number } }) {
  const maxTarget = target.max ?? target.min;
  const maxDisplay = Math.max(maxTarget * 1.3, sets * 1.1, 1);
  const progress = Math.min(sets / maxDisplay, 1);
  const minLinePos = target.min / maxDisplay;
  const maxLinePos = maxTarget / maxDisplay;

  let statusColor = Colors.text3;
  let statusText = 'Under';
  if (sets >= target.min && (!target.max || sets <= target.max)) {
    statusColor = Colors.green;
    statusText = 'On Target';
  } else if (sets > (target.max ?? target.min)) {
    statusColor = Colors.orange;
    statusText = 'Over';
  }

  const targetLabel = target.max && target.max !== target.min
    ? `${target.min}-${target.max} sets`
    : `${target.min} sets`;

  return (
    <View style={barStyles.container}>
      <View style={barStyles.header}>
        <Text style={barStyles.muscle}>{muscle}</Text>
        <View style={barStyles.right}>
          <View style={[barStyles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[barStyles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
          <Text style={barStyles.count}>
            <Text style={barStyles.countNum}>{sets}</Text>
            <Text style={barStyles.countTarget}> / {targetLabel}</Text>
          </Text>
        </View>
      </View>
      <View style={barStyles.track}>
        {/* Min line */}
        <View style={[barStyles.targetLine, { left: `${minLinePos * 100}%` as any }]} />
        {/* Max line if different */}
        {target.max && target.max !== target.min && (
          <View style={[barStyles.targetLineMax, { left: `${maxLinePos * 100}%` as any }]} />
        )}
        {/* Progress */}
        <View
          style={[
            barStyles.fill,
            {
              width: `${progress * 100}%` as any,
              backgroundColor: sets >= target.min
                ? (sets > (target.max ?? target.min) ? Colors.orange : Colors.green)
                : Colors.accent,
            },
          ]}
        />
      </View>
    </View>
  );
}

const barStyles = StyleSheet.create({
  container: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  muscle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 20,
  },
  statusText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  count: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.text2,
    minWidth: 70,
    textAlign: 'right',
  },
  countNum: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: Colors.text,
  },
  countTarget: {
    color: Colors.text3,
  },
  track: {
    height: 6,
    backgroundColor: Colors.surface3,
    borderRadius: 3,
    overflow: 'visible',
    position: 'relative',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    minWidth: 2,
  },
  targetLine: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 12,
    backgroundColor: 'rgba(232,255,71,0.6)',
    borderRadius: 1,
    zIndex: 2,
  },
  targetLineMax: {
    position: 'absolute',
    top: -3,
    width: 2,
    height: 12,
    backgroundColor: 'rgba(255, 159, 82, 0.6)',
    borderRadius: 1,
    zIndex: 2,
  },
});

export default function VolumeScreen() {
  const insets = useSafeAreaInsets();
  const { getWeeklyVolume, isDeloadWeek } = useWorkout();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const volume = useMemo(() => getWeeklyVolume(), [getWeeklyVolume]);

  const totals = useMemo(() => {
    const onTarget = MUSCLE_ORDER.filter(m => {
      const sets = volume[m] || 0;
      const target = MUSCLE_TARGETS[m];
      if (!target) return false;
      return sets >= target.min;
    }).length;
    const totalSets = Object.values(volume).reduce((sum, v) => sum + v, 0);
    return { onTarget, total: MUSCLE_ORDER.length, totalSets };
  }, [volume]);

  const deloadTargets = useMemo(() => {
    if (!isDeloadWeek) return MUSCLE_TARGETS;
    const dt: typeof MUSCLE_TARGETS = {};
    Object.entries(MUSCLE_TARGETS).forEach(([k, v]) => {
      dt[k] = { min: Math.ceil(v.min * 0.6), max: v.max ? Math.ceil(v.max * 0.6) : undefined };
    });
    return dt;
  }, [isDeloadWeek]);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Volume</Text>
          <Text style={styles.subtitle}>This week's training volume</Text>
        </View>
        {isDeloadWeek && (
          <View style={styles.deloadBadge}>
            <Feather name="battery-charging" size={12} color={Colors.orange} />
            <Text style={styles.deloadBadgeText}>Deload</Text>
          </View>
        )}
      </View>

      {/* Summary stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{totals.onTarget}/{totals.total}</Text>
          <Text style={styles.statLabel}>On Target</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{totals.totalSets}</Text>
          <Text style={styles.statLabel}>Total Sets</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statVal, { color: Colors.accent }]}>
            {Math.round((totals.onTarget / totals.total) * 100)}%
          </Text>
          <Text style={styles.statLabel}>Coverage</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomPad + 100, gap: 0 }}
        showsVerticalScrollIndicator={false}
      >
        {isDeloadWeek && (
          <View style={styles.deloadBanner}>
            <Feather name="info" size={14} color={Colors.orange} />
            <Text style={styles.deloadBannerText}>
              Deload targets are 60% of normal volume
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weekly Sets by Muscle</Text>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: 'rgba(232,255,71,0.6)' }]} />
              <Text style={styles.legendText}>Min target</Text>
            </View>
            {!isDeloadWeek && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: 'rgba(255,159,82,0.6)' }]} />
                <Text style={styles.legendText}>Max target</Text>
              </View>
            )}
          </View>

          <View style={styles.barsList}>
            {MUSCLE_ORDER.map((muscle, i) => (
              <View key={muscle}>
                <VolumeBar
                  muscle={muscle}
                  sets={volume[muscle] || 0}
                  target={deloadTargets[muscle] || { min: 0 }}
                />
                {i < MUSCLE_ORDER.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        </View>

        {/* Reference table */}
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.cardTitle}>Target Reference</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 2 }]}>Muscle</Text>
            <Text style={[styles.tableCell, styles.tableHeaderText]}>Weekly Sets</Text>
            <Text style={[styles.tableCell, styles.tableHeaderText]}>This Week</Text>
          </View>
          {MUSCLE_ORDER.map((muscle, i) => {
            const target = MUSCLE_TARGETS[muscle];
            const deloadTarget = deloadTargets[muscle];
            const sets = volume[muscle] || 0;
            const isOnTarget = sets >= deloadTarget.min;
            return (
              <View key={muscle} style={[styles.tableRow, i < MUSCLE_ORDER.length - 1 && styles.tableRowBorder]}>
                <Text style={[styles.tableCell, styles.tableCellText, { flex: 2 }]}>{muscle}</Text>
                <Text style={[styles.tableCell, styles.tableCellText, { color: Colors.text3 }]}>
                  {isDeloadWeek
                    ? `${deloadTarget.min}${deloadTarget.max ? `-${deloadTarget.max}` : ''}`
                    : `${target.min}${target.max ? `-${target.max}` : ''}`}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellText, { color: isOnTarget ? Colors.green : Colors.red }]}>
                  {sets}
                </Text>
              </View>
            );
          })}
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
  deloadBadge: {
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
  deloadBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.orange,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  statVal: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.text,
  },
  statLabel: {
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
  deloadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 159, 82, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 82, 0.2)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  deloadBannerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.orange,
  },
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  cardTitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: -6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.text3,
  },
  barsList: {
    gap: 0,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 14,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tableHeaderText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
  },
  tableRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tableCell: {
    flex: 1,
  },
  tableCellText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.text2,
  },
});
