import {
  STRENGTH_LIFT_CONFIG,
  STRENGTH_LIFT_ORDER,
  type StrengthLiftKey,
} from '@/constants/heatmap';
import type { ProgramDay, ProgramSlot } from '@/lib/program';
import type { SessionLog, WorkoutLogData } from '@/context/WorkoutContext';

export interface ProgressSlotOption {
  slotId: string;
  dayId: string;
  dayName: string;
  dayLabel: string;
  sessionTitle: string;
  exerciseName: string;
  exerciseImageUrl?: string | null;
  hasHistory: boolean;
}

export interface ProgressPoint {
  slotId: string;
  assignmentId: string;
  date: string;
  exerciseName: string;
  sessionId: string;
  maxWeight: number;
  maxReps: number;
  volume: number;
  e1rm: number;
}

export interface ProgressAssignmentSegment {
  assignmentId: string;
  slotId: string;
  exerciseName: string;
  startDate: string;
  endDate: string;
  sessionCount: number;
}

export interface DerivedMuscleVolume {
  muscleGroup: string;
  weightedSets: number;
  rawSets: number;
}

export interface DerivedStrengthSignalMetric {
  liftKey: StrengthLiftKey;
  label: string;
  e1rm: number | null;
  sessionCount: number;
}

export interface PersonalRecordEvent {
  slotId: string;
  assignmentId: string;
  sessionId: string;
  date: string;
  exerciseName: string;
  recordType: 'weight' | 'reps' | 'e1rm' | 'volume';
  value: number;
}

export interface TrendSummary {
  direction: 'up' | 'flat' | 'down' | 'insufficient';
  summary: string;
  windowSize: number;
}

export type OverloadVerdict = 'improving' | 'holding' | 'stalled' | 'regressing' | 'rebuild' | 'insufficient';
export type OverloadConfidence = 'insufficient' | 'mixed' | 'enough';

export interface OverloadInsight {
  verdict: OverloadVerdict;
  confidence: OverloadConfidence;
  summary: string;
  evidence: string;
  action: string;
  recentWindowSize: number;
  baselineWindowSize: number;
  recentAverageE1rm: number | null;
  baselineAverageE1rm: number | null;
  latestTopSetE1rm: number | null;
  previousTopSetE1rm: number | null;
  bestRecentTopSetE1rm: number | null;
  bestAllTimeTopSetE1rm: number | null;
  topRangeHitRate: number;
  nonImprovingStreak: number;
  recentChangePct: number | null;
}

export interface WeakPointInsight {
  id: string;
  label: string;
  message: string;
  severity: 'info' | 'watch';
}

export interface CoachingSummary {
  recentPrs: PersonalRecordEvent[];
  stalledSlots: Array<{ slotId: string; exerciseName: string; dayLabel: string; reason: string }>;
  nextOpportunities: Array<{ slotId: string; exerciseName: string; dayLabel: string; message: string }>;
  weakPoints: WeakPointInsight[];
}

export type ProgressionStatus = 'repeat' | 'progress' | 'stall' | 'deload';

export interface ProgressionRecommendation {
  status: ProgressionStatus;
  targetWeight: number | null;
  targetRepRange: [number, number];
  reason: string;
  basedOnSessionId: string;
  stallCount: number;
  suggestedDeloadWeight: number | null;
}

export interface SlotStallState {
  isStalled: boolean;
  stallCount: number;
  validSessionCount: number;
  basedOnSessionId: string | null;
}

type DateRange = {
  start: string;
  end: string;
};

const LEGACY_LIFT_NAME_MATCHERS: Record<StrengthLiftKey, string[]> = {
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

function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function roundToNearestFive(value: number) {
  return Math.round(value / 5) * 5;
}

export function calculateEstimated1RM(weight: number, reps: number) {
  if (!weight || !reps || weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(weight);
  return Math.round(weight * (1 + reps / 30));
}

type ValidSet = {
  weight: number;
  reps: number;
};

type AssignmentSessionSummary = {
  session: SessionLog;
  validSets: ValidSet[];
  bestWeight: number;
  bestReps: number;
  bestE1rm: number;
  topWeightTotalReps: number;
  allSetsAtTopEnd: boolean;
};

function getValidSets(session: SessionLog) {
  return session.sets
    .map(set => ({ weight: set.weight || 0, reps: set.reps || 0 }))
    .filter(set => set.weight > 0 && set.reps > 0);
}

function summarizeAssignmentSession(session: SessionLog, targetRepRange: [number, number]): AssignmentSessionSummary | null {
  const validSets = getValidSets(session);
  if (validSets.length === 0) return null;

  const bestWeight = Math.max(...validSets.map(set => set.weight), 0);
  const topWeightTotalReps = validSets
    .filter(set => set.weight === bestWeight)
    .reduce((sum, set) => sum + set.reps, 0);

  return {
    session,
    validSets,
    bestWeight,
    bestReps: Math.max(...validSets.map(set => set.reps), 0),
    bestE1rm: Math.max(...validSets.map(set => calculateEstimated1RM(set.weight, set.reps)), 0),
    topWeightTotalReps,
    allSetsAtTopEnd: validSets.every(set => set.reps >= targetRepRange[1]),
  };
}

function getSummaryVolume(validSets: ValidSet[]) {
  return Math.round(validSets.reduce((sum, set) => sum + (set.weight * set.reps), 0));
}

function toProgressPoint(session: SessionLog): ProgressPoint {
  const maxWeight = Math.max(...session.sets.map(set => set.weight || 0), 0);
  const maxReps = Math.max(...session.sets.map(set => set.reps || 0), 0);
  const volume = Math.round(session.sets.reduce((sum, set) => sum + ((set.weight || 0) * (set.reps || 0)), 0));
  return {
    slotId: session.slotId,
    assignmentId: session.assignmentId,
    date: session.date,
    exerciseName: session.exerciseName,
    sessionId: session.id,
    maxWeight,
    maxReps,
    volume,
    e1rm: calculateEstimated1RM(maxWeight, maxReps),
  };
}

export function getSlotProgressSeries(workoutLog: WorkoutLogData, slotId: string) {
  return (workoutLog[slotId] ?? [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(toProgressPoint);
}

export function getAssignmentPersonalRecords(workoutLog: WorkoutLogData) {
  const events: PersonalRecordEvent[] = [];

  Object.entries(workoutLog).forEach(([slotId, sessions]) => {
    const byAssignment = new Map<string, SessionLog[]>();
    sessions.forEach(session => {
      const current = byAssignment.get(session.assignmentId) ?? [];
      current.push(session);
      byAssignment.set(session.assignmentId, current);
    });

    byAssignment.forEach((assignmentSessions, assignmentId) => {
      let bestWeight = 0;
      let bestReps = 0;
      let bestE1rm = 0;
      let bestVolume = 0;

      assignmentSessions
        .slice()
        .sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return a.id.localeCompare(b.id);
        })
        .forEach(session => {
          const validSets = getValidSets(session);
          if (validSets.length === 0) return;

          const sessionWeight = Math.max(...validSets.map(set => set.weight), 0);
          const sessionReps = Math.max(...validSets.map(set => set.reps), 0);
          const sessionE1rm = Math.max(...validSets.map(set => calculateEstimated1RM(set.weight, set.reps)), 0);
          const sessionVolume = getSummaryVolume(validSets);

          if (sessionWeight > bestWeight) {
            bestWeight = sessionWeight;
            events.push({ slotId, assignmentId, sessionId: session.id, date: session.date, exerciseName: session.exerciseName, recordType: 'weight', value: sessionWeight });
          }
          if (sessionReps > bestReps) {
            bestReps = sessionReps;
            events.push({ slotId, assignmentId, sessionId: session.id, date: session.date, exerciseName: session.exerciseName, recordType: 'reps', value: sessionReps });
          }
          if (sessionE1rm > bestE1rm) {
            bestE1rm = sessionE1rm;
            events.push({ slotId, assignmentId, sessionId: session.id, date: session.date, exerciseName: session.exerciseName, recordType: 'e1rm', value: sessionE1rm });
          }
          if (sessionVolume > bestVolume) {
            bestVolume = sessionVolume;
            events.push({ slotId, assignmentId, sessionId: session.id, date: session.date, exerciseName: session.exerciseName, recordType: 'volume', value: sessionVolume });
          }
        });
    });
  });

  return events;
}

export function getRecentPersonalRecordEvents(workoutLog: WorkoutLogData, limit = 6) {
  return getAssignmentPersonalRecords(workoutLog)
    .slice()
    .sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.sessionId.localeCompare(a.sessionId);
    })
    .slice(0, limit);
}

export function getSlotAssignmentSessions(workoutLog: WorkoutLogData, slotId: string, assignmentId: string) {
  return (workoutLog[slotId] ?? [])
    .filter(session => session.assignmentId === assignmentId)
    .slice()
    .sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.id.localeCompare(b.id);
    });
}

export function getScopedWorkoutLogForSlots(workoutLog: WorkoutLogData, slots: ProgramSlot[]): WorkoutLogData {
  const scopedLog: WorkoutLogData = {};
  const slotAssignments = new Map(slots.map(slot => [slot.id, slot.assignmentId]));

  slotAssignments.forEach((assignmentId, slotId) => {
    const sessions = (workoutLog[slotId] ?? [])
      .filter(session => session.assignmentId === assignmentId);
    if (sessions.length > 0) {
      scopedLog[slotId] = sessions;
    }
  });

  return scopedLog;
}

export function getSlotAssignmentSegments(workoutLog: WorkoutLogData, slotId: string): ProgressAssignmentSegment[] {
  const sessions = (workoutLog[slotId] ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const segments = new Map<string, ProgressAssignmentSegment>();

  sessions.forEach(session => {
    const current = segments.get(session.assignmentId);
    if (!current) {
      segments.set(session.assignmentId, {
        assignmentId: session.assignmentId,
        slotId,
        exerciseName: session.exerciseName,
        startDate: session.date,
        endDate: session.date,
        sessionCount: 1,
      });
      return;
    }

    current.endDate = session.date > current.endDate ? session.date : current.endDate;
    current.startDate = session.date < current.startDate ? session.date : current.startDate;
    current.sessionCount += 1;
  });

  return Array.from(segments.values()).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function getSlotStallState(slot: ProgramSlot, sessions: SessionLog[]): SlotStallState {
  const summarized = sessions
    .map(session => summarizeAssignmentSession(session, slot.repRange))
    .filter((entry): entry is AssignmentSessionSummary => !!entry);

  if (summarized.length < slot.minSessionsBeforeStall) {
    return {
      isStalled: false,
      stallCount: 0,
      validSessionCount: summarized.length,
      basedOnSessionId: summarized[summarized.length - 1]?.session.id ?? null,
    };
  }

  let bestWeight = 0;
  let topWeightTotalReps = 0;
  let consecutiveNonImproving = 0;

  summarized.forEach((summary, index) => {
    if (index === 0) {
      bestWeight = summary.bestWeight;
      topWeightTotalReps = summary.topWeightTotalReps;
      consecutiveNonImproving = 0;
      return;
    }

    const improved = summary.bestWeight > bestWeight
      || (summary.bestWeight === bestWeight && summary.topWeightTotalReps > topWeightTotalReps);

    if (improved) {
      bestWeight = summary.bestWeight;
      topWeightTotalReps = summary.topWeightTotalReps;
      consecutiveNonImproving = 0;
      return;
    }

    consecutiveNonImproving += 1;
  });

  return {
    isStalled: consecutiveNonImproving >= slot.stallThreshold,
    stallCount: consecutiveNonImproving,
    validSessionCount: summarized.length,
    basedOnSessionId: summarized[summarized.length - 1]?.session.id ?? null,
  };
}

export function getSlotProgressionRecommendation(slot: ProgramSlot, sessions: SessionLog[]): ProgressionRecommendation | null {
  const summarized = sessions
    .map(session => summarizeAssignmentSession(session, slot.repRange))
    .filter((entry): entry is AssignmentSessionSummary => !!entry);

  const latest = summarized[summarized.length - 1];
  if (!latest) return null;

  const stallState = getSlotStallState(slot, sessions);
  if (stallState.isStalled) {
    const suggestedDeloadWeight = latest.bestWeight > 0
      ? roundToNearestFive(latest.bestWeight * slot.deloadFactor)
      : null;

    return {
      status: suggestedDeloadWeight ? 'deload' : 'stall',
      targetWeight: latest.bestWeight || null,
      targetRepRange: slot.repRange,
      reason: suggestedDeloadWeight
        ? `Performance has plateaued for ${stallState.stallCount} straight sessions. Deload this slot and rebuild.`
        : `Performance has plateaued for ${stallState.stallCount} straight sessions on this assignment.`,
      basedOnSessionId: latest.session.id,
      stallCount: stallState.stallCount,
      suggestedDeloadWeight,
    };
  }

  if (latest.allSetsAtTopEnd) {
    return {
      status: 'progress',
      targetWeight: latest.bestWeight > 0 ? latest.bestWeight + slot.loadStep : null,
      targetRepRange: slot.repRange,
      reason: `All logged work sets hit the top of the rep range. Increase load by ${slot.loadStep} next time.`,
      basedOnSessionId: latest.session.id,
      stallCount: stallState.stallCount,
      suggestedDeloadWeight: null,
    };
  }

  return {
    status: 'repeat',
    targetWeight: latest.bestWeight || null,
    targetRepRange: slot.repRange,
    reason: 'Keep the load steady and push reps higher within the target range.',
    basedOnSessionId: latest.session.id,
    stallCount: stallState.stallCount,
    suggestedDeloadWeight: null,
  };
}

export function getSlotTrendSummary(slot: ProgramSlot, sessions: SessionLog[]): TrendSummary {
  const points = sessions
    .map(session => summarizeAssignmentSession(session, slot.repRange))
    .filter((entry): entry is AssignmentSessionSummary => !!entry);

  if (points.length < 2) {
    return { direction: 'insufficient', summary: 'Need more sessions to show a trend.', windowSize: points.length };
  }

  const recent = points.slice(-3);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const firstScore = first.bestWeight * first.topWeightTotalReps;
  const lastScore = last.bestWeight * last.topWeightTotalReps;

  if (lastScore > firstScore) {
    return { direction: 'up', summary: 'Trending up lately.', windowSize: recent.length };
  }
  if (lastScore < firstScore) {
    return { direction: 'down', summary: 'Trending down lately.', windowSize: recent.length };
  }
  return { direction: 'flat', summary: 'Flat lately.', windowSize: recent.length };
}

export function getSlotOverloadInsight(slot: ProgramSlot, sessions: SessionLog[]): OverloadInsight {
  const summarized = sessions
    .map(session => summarizeAssignmentSession(session, slot.repRange))
    .filter((entry): entry is AssignmentSessionSummary => !!entry);

  const validCount = summarized.length;
  const recentWindowSize = Math.min(4, validCount);
  const baselineWindowSize = Math.min(4, Math.max(0, validCount - recentWindowSize));
  const recent = recentWindowSize > 0 ? summarized.slice(-recentWindowSize) : [];
  const baseline = baselineWindowSize > 0 ? summarized.slice(-(recentWindowSize + baselineWindowSize), -recentWindowSize) : [];
  const latest = summarized[validCount - 1] ?? null;
  const previous = summarized[validCount - 2] ?? null;

  const recentAverageE1rm = recent.length
    ? recent.reduce((sum, entry) => sum + entry.bestE1rm, 0) / recent.length
    : null;
  const baselineAverageE1rm = baseline.length
    ? baseline.reduce((sum, entry) => sum + entry.bestE1rm, 0) / baseline.length
    : null;
  const recentBestTopSet = recent.length ? Math.max(...recent.map(entry => entry.bestE1rm), 0) : null;
  const bestAllTimeTopSet = summarized.length ? Math.max(...summarized.map(entry => entry.bestE1rm), 0) : null;
  const topRangeHitRate = recent.length
    ? recent.filter(entry => entry.allSetsAtTopEnd).length / recent.length
    : 0;
  const nonImprovingStreak = getSlotStallState(slot, sessions).stallCount;
  const recentChangePct = recentAverageE1rm && baselineAverageE1rm
    ? (recentAverageE1rm - baselineAverageE1rm) / baselineAverageE1rm
    : null;

  if (validCount === 0) {
    return {
      verdict: 'insufficient',
      confidence: 'insufficient',
      summary: 'No history yet.',
      evidence: 'Log this exercise to build an overload trend.',
      action: 'Complete a few sessions before judging progress.',
      recentWindowSize,
      baselineWindowSize,
      recentAverageE1rm,
      baselineAverageE1rm,
      latestTopSetE1rm: null,
      previousTopSetE1rm: null,
      bestRecentTopSetE1rm: recentBestTopSet,
      bestAllTimeTopSetE1rm: bestAllTimeTopSet,
      topRangeHitRate,
      nonImprovingStreak,
      recentChangePct,
    };
  }

  if (validCount < 3 || !latest) {
    return {
      verdict: 'insufficient',
      confidence: 'insufficient',
      summary: 'Too early to call.',
      evidence: 'There are not enough sessions yet to separate noise from a real trend.',
      action: 'Keep logging this exercise for a few more sessions.',
      recentWindowSize,
      baselineWindowSize,
      recentAverageE1rm,
      baselineAverageE1rm,
      latestTopSetE1rm: latest?.bestE1rm ?? null,
      previousTopSetE1rm: previous?.bestE1rm ?? null,
      bestRecentTopSetE1rm: recentBestTopSet,
      bestAllTimeTopSetE1rm: bestAllTimeTopSet,
      topRangeHitRate,
      nonImprovingStreak,
      recentChangePct,
    };
  }

  const confidence: OverloadConfidence = validCount >= 6 ? 'enough' : 'mixed';
  const latestTopSetE1rm = latest.bestE1rm;
  const previousTopSetE1rm = previous?.bestE1rm ?? null;
  const priorBestTopSet = summarized.slice(0, -1).length
    ? Math.max(...summarized.slice(0, -1).map(entry => entry.bestE1rm), 0)
    : latest.bestE1rm;
  const improvedRecently = recentChangePct !== null && recentChangePct >= 0.025;
  const regressedRecently = recentChangePct !== null && recentChangePct <= -0.035;
  const latestNearBest = priorBestTopSet > 0 ? latestTopSetE1rm >= priorBestTopSet * 0.98 : true;
  const rebuildLike = priorBestTopSet > 0
    && latestTopSetE1rm < priorBestTopSet * 0.94
    && recentBestTopSet !== null
    && recentBestTopSet < priorBestTopSet * 0.97
    && validCount >= 6;
  const stallState = getSlotStallState(slot, sessions);

  let verdict: OverloadVerdict;
  if (rebuildLike) {
    verdict = 'rebuild';
  } else if (stallState.isStalled && !improvedRecently) {
    verdict = 'stalled';
  } else if (improvedRecently || (latestTopSetE1rm >= priorBestTopSet && topRangeHitRate >= 0.5)) {
    verdict = 'improving';
  } else if (regressedRecently && !latestNearBest) {
    verdict = 'regressing';
  } else {
    verdict = 'holding';
  }

  const summaryByVerdict: Record<OverloadVerdict, string> = {
    improving: 'Improving',
    holding: 'Holding steady',
    stalled: 'Probably stalled',
    regressing: 'Trending backward',
    rebuild: 'Deload / rebuild',
    insufficient: 'Too early to call',
  };

  const evidenceByVerdict: Record<OverloadVerdict, string> = {
    improving: baselineAverageE1rm && recentAverageE1rm
      ? `Last ${recentWindowSize} sessions are ${Math.abs(Math.round((recentChangePct ?? 0) * 100))}% above the prior ${baselineWindowSize}.`
      : 'Recent top sets are moving up.',
    holding: baselineAverageE1rm && recentAverageE1rm
      ? `Last ${recentWindowSize} sessions are staying close to the prior ${baselineWindowSize}.`
      : 'Recent sessions are roughly flat.',
    stalled: `Top-end reps are getting harder to close out, and the non-improving streak is ${nonImprovingStreak}.`,
    regressing: baselineAverageE1rm && recentAverageE1rm
      ? `Recent top-set performance is down ${Math.abs(Math.round((recentChangePct ?? 0) * 100))}% from the prior block.`
      : 'Recent top sets have slipped.',
    rebuild: 'Recent sessions sit well below the earlier peak and look like a reset or rebuild block.',
    insufficient: 'Need a few more sessions before this becomes reliable.',
  };

  const actionByVerdict: Record<OverloadVerdict, string> = {
    improving: 'Keep pushing toward the top of the rep range before adding load again.',
    holding: 'Stay patient and keep collecting clean reps before forcing a jump.',
    stalled: 'Consider a load reset, exercise tweak, or extra recovery before pushing harder.',
    regressing: 'Check recovery, form, and fatigue before treating this as a true plateau.',
    rebuild: 'Treat this like a rebuild block and aim to recover prior performance gradually.',
    insufficient: 'Keep logging this exercise so the signal gets stronger.',
  };

  return {
    verdict,
    confidence,
    summary: summaryByVerdict[verdict],
    evidence: evidenceByVerdict[verdict],
    action: actionByVerdict[verdict],
    recentWindowSize,
    baselineWindowSize,
    recentAverageE1rm,
    baselineAverageE1rm,
    latestTopSetE1rm,
    previousTopSetE1rm,
    bestRecentTopSetE1rm: recentBestTopSet,
    bestAllTimeTopSetE1rm: bestAllTimeTopSet,
    topRangeHitRate,
    nonImprovingStreak,
    recentChangePct,
  };
}

function getSessionSignalKey(session: SessionLog): StrengthLiftKey | null {
  if (session.strengthSignalKey && STRENGTH_LIFT_ORDER.includes(session.strengthSignalKey)) {
    return session.strengthSignalKey;
  }

  const normalized = normalizeLabel(session.exerciseName);
  for (const liftKey of STRENGTH_LIFT_ORDER) {
    if (LEGACY_LIFT_NAME_MATCHERS[liftKey].some(pattern => normalized.includes(pattern))) {
      return liftKey;
    }
  }
  return null;
}

export function getStrengthMetricsBySignal(workoutLog: WorkoutLogData): Record<StrengthLiftKey, DerivedStrengthSignalMetric> {
  const metrics = {} as Record<StrengthLiftKey, DerivedStrengthSignalMetric>;

  STRENGTH_LIFT_ORDER.forEach(liftKey => {
    metrics[liftKey] = {
      liftKey,
      label: STRENGTH_LIFT_CONFIG[liftKey].label,
      e1rm: null,
      sessionCount: 0,
    };
  });

  Object.values(workoutLog).forEach(sessions => {
    sessions.forEach(session => {
      const liftKey = getSessionSignalKey(session);
      if (!liftKey) return;

      const current = metrics[liftKey];
      current.sessionCount += 1;

      session.sets.forEach(set => {
        const e1rm = calculateEstimated1RM(set.weight, set.reps);
        if (!e1rm) return;
        if (current.e1rm === null || e1rm > current.e1rm) {
          current.e1rm = e1rm;
        }
      });
    });
  });

  return metrics;
}

export function getWeakPointInsights(workoutLog: WorkoutLogData, options: {
  weakVolumeMuscles?: Array<{ label: string; progress: number }>;
  missingStrengthSignals?: string[];
  stalledSlots?: Array<{ exerciseName: string }>;
}) {
  const insights: WeakPointInsight[] = [];

  options.stalledSlots?.slice(0, 2).forEach((slot, index) => {
    insights.push({
      id: `stall-${index}-${slot.exerciseName}`,
      label: 'Stalled slot',
      message: `${slot.exerciseName} has stalled recently.`,
      severity: 'watch',
    });
  });

  options.weakVolumeMuscles?.slice(0, 2).forEach((muscle, index) => {
    insights.push({
      id: `volume-${index}-${muscle.label}`,
      label: 'Volume watch',
      message: `${muscle.label} is only at ${Math.round(muscle.progress * 100)}% of target this week.`,
      severity: 'watch',
    });
  });

  options.missingStrengthSignals?.slice(0, 2).forEach((label, index) => {
    insights.push({
      id: `signal-${index}-${label}`,
      label: 'Missing signal',
      message: `No ${label.toLowerCase()} signal logged yet.`,
      severity: 'info',
    });
  });

  return insights;
}

export function getHomeCoachingSummary(days: ProgramDay[], slots: ProgramSlot[], workoutLog: WorkoutLogData): CoachingSummary {
  const dayById = new Map(days.map(day => [day.id, day]));
  const scopedWorkoutLog = getScopedWorkoutLogForSlots(workoutLog, slots);
  const recentPrs = getRecentPersonalRecordEvents(scopedWorkoutLog, 4);

  const stalledSlots = slots
    .map(slot => {
      const sessions = getSlotAssignmentSessions(workoutLog, slot.id, slot.assignmentId);
      const recommendation = getSlotProgressionRecommendation(slot, sessions);
      const day = dayById.get(slot.dayId);
      if (!recommendation || (recommendation.status !== 'stall' && recommendation.status !== 'deload')) return null;
      return {
        slotId: slot.id,
        exerciseName: slot.exerciseName,
        dayLabel: day?.label ?? '',
        reason: recommendation.status === 'deload' ? 'Suggested deload' : 'Plateau detected',
      };
    })
    .filter((entry): entry is { slotId: string; exerciseName: string; dayLabel: string; reason: string } => !!entry)
    .slice(0, 3);

  const nextOpportunities = slots
    .map(slot => {
      const sessions = getSlotAssignmentSessions(workoutLog, slot.id, slot.assignmentId);
      const recommendation = getSlotProgressionRecommendation(slot, sessions);
      const day = dayById.get(slot.dayId);
      if (!recommendation) return null;
      if (recommendation.status === 'progress') {
        return {
          slotId: slot.id,
          exerciseName: slot.exerciseName,
          dayLabel: day?.label ?? '',
          message: recommendation.targetWeight ? `Ready for ${recommendation.targetWeight} lbs next.` : 'Ready to add weight next.',
        };
      }
      if (recommendation.status === 'repeat' && recommendation.targetWeight) {
        return {
          slotId: slot.id,
          exerciseName: slot.exerciseName,
          dayLabel: day?.label ?? '',
          message: `Close to a jump at ${recommendation.targetWeight} lbs.`,
        };
      }
      return null;
    })
    .filter((entry): entry is { slotId: string; exerciseName: string; dayLabel: string; message: string } => !!entry)
    .slice(0, 3);

  const weakPoints = getWeakPointInsights(scopedWorkoutLog, {
    stalledSlots: stalledSlots.map(slot => ({ exerciseName: slot.exerciseName })),
  }).slice(0, 2);

  return {
    recentPrs,
    stalledSlots,
    nextOpportunities,
    weakPoints,
  };
}

export function getMuscleVolumeByRange(workoutLog: WorkoutLogData, range: DateRange): Record<string, DerivedMuscleVolume> {
  const totals: Record<string, DerivedMuscleVolume> = {};

  Object.values(workoutLog).forEach(sessions => {
    sessions.forEach(session => {
      if (session.date < range.start || session.date > range.end) return;
      const setCount = session.sets.length;
      if (setCount <= 0) return;

      const primary = (session.primaryMuscles ?? []).filter(Boolean);
      const secondary = (session.secondaryMuscles ?? []).filter(Boolean);

      if (primary.length === 0 && secondary.length === 0) {
        session.muscleGroups.forEach(group => {
          totals[group] = totals[group] ?? { muscleGroup: group, weightedSets: 0, rawSets: 0 };
          totals[group].weightedSets += setCount;
          totals[group].rawSets += setCount;
        });
        return;
      }

      primary.forEach(group => {
        totals[group] = totals[group] ?? { muscleGroup: group, weightedSets: 0, rawSets: 0 };
        totals[group].weightedSets += setCount;
        totals[group].rawSets += setCount;
      });

      secondary.forEach(group => {
        totals[group] = totals[group] ?? { muscleGroup: group, weightedSets: 0, rawSets: 0 };
        totals[group].weightedSets += setCount * 0.5;
        totals[group].rawSets += setCount;
      });
    });
  });

  return totals;
}

export function getProgressSlotOptions(days: ProgramDay[], slots: ProgramSlot[], workoutLog: WorkoutLogData): ProgressSlotOption[] {
  const slotHistory = new Set(Object.keys(workoutLog));
  const dayById = new Map(days.map(day => [day.id, day]));

  return slots
    .slice()
    .sort((a, b) => {
      const dayA = dayById.get(a.dayId)?.sortOrder ?? 0;
      const dayB = dayById.get(b.dayId)?.sortOrder ?? 0;
      if (dayA !== dayB) return dayA - dayB;
      return a.sortOrder - b.sortOrder;
    })
    .map(slot => {
      const day = dayById.get(slot.dayId);
      return {
        slotId: slot.id,
        dayId: slot.dayId,
        dayName: day?.name ?? '',
        dayLabel: day?.label ?? '',
        sessionTitle: day?.session ?? '',
        exerciseName: slot.exerciseName,
        exerciseImageUrl: slot.exerciseImageUrl ?? null,
        hasHistory: slotHistory.has(slot.id),
      };
    });
}
