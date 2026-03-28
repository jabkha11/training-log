import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_STRENGTH_LIFTS, type StrengthProfile } from '@/constants/heatmap';
import type { SessionLog } from '@/context/WorkoutContext';
import { WORKOUT_STORAGE_KEYS } from '@/context/WorkoutContext';
import { formatLocalDateKey, getCurrentLocalWeekRange, getStartOfLocalWeek } from '@/lib/date';
import { getSlotsForDay, sortProgramDays, type ProgramDay, type ProgramSlot } from '@/lib/program';
import { resetProgramStateToBootstrap } from '@/lib/programStorage';

export interface DevSeedResult {
  workouts: number;
  sessions: number;
  bodyweightEntries: number;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function roundToNearestFive(value: number) {
  return Math.round(value / 5) * 5;
}

function createSeedId(prefix: string, ...parts: Array<string | number>) {
  return `${prefix}-${parts.join('-')}`;
}

function computeWeeklyVolume(log: Record<string, SessionLog[]>, weekStart: string, weekEnd: string) {
  const volume: Record<string, number> = {};
  Object.values(log).forEach(sessions => {
    sessions.forEach(session => {
      if (session.date < weekStart || session.date > weekEnd) return;
      session.muscleGroups.forEach(group => {
        volume[group] = (volume[group] || 0) + session.sets.length;
      });
    });
  });
  return volume;
}

function getPattern(slotIndex: number) {
  return slotIndex % 6;
}

function buildWeekWeight(slot: ProgramSlot, slotIndex: number, weekIndex: number) {
  const base = roundToNearestFive(45 + (slotIndex * 10) + (slot.repRange[0] * 1.5));
  const step = slot.loadStep;
  const pattern = getPattern(slotIndex);
  const block = Math.floor(weekIndex / 4);

  if (pattern === 0) {
    return base + (block * step) + ((weekIndex % 5 === 4) ? 0 : 0);
  }

  if (pattern === 1) {
    return base + (Math.floor(weekIndex / 5) * step);
  }

  if (pattern === 2) {
    if (weekIndex < 5) return base + (Math.floor(weekIndex / 2) * step);
    if (weekIndex < 10) return base + (2 * step);
    if (weekIndex < 13) return base + step;
    return base + (3 * step);
  }

  if (pattern === 3) {
    if (weekIndex < 6) return base + (Math.floor(weekIndex / 3) * step);
    if (weekIndex < 9) return roundToNearestFive((base + step) * 0.9);
    if (weekIndex < 13) return base + step;
    return base + (2 * step);
  }

  if (pattern === 4) {
    const noise = [0, step, 0, -step, step, 0, step, -step][weekIndex % 8] ?? 0;
    return Math.max(25, base + (Math.floor(weekIndex / 6) * step) + noise);
  }

  if (weekIndex < 4) return base + (Math.floor(weekIndex / 2) * step);
  if (weekIndex < 10) return base + step;
  if (weekIndex < 13) return base;
  return base + step;
}

function buildSetReps(slot: ProgramSlot, slotIndex: number, weekIndex: number) {
  const min = slot.repRange[0];
  const max = slot.repRange[1];
  const mid = Math.min(max - 1, min + 2);
  const pattern = getPattern(slotIndex);

  if (pattern === 0) {
    const phase = weekIndex % 4;
    if (phase === 0) return Array.from({ length: slot.sets }, (_, idx) => Math.max(min, min + 1 + (idx % 2)));
    if (phase === 1) return Array.from({ length: slot.sets }, () => mid);
    if (phase === 2) return Array.from({ length: slot.sets }, () => Math.max(min, max - 1));
    return Array.from({ length: slot.sets }, () => max);
  }

  if (pattern === 1) {
    const phase = weekIndex % 5;
    if (phase <= 1) return Array.from({ length: slot.sets }, () => min);
    if (phase === 2) return Array.from({ length: slot.sets }, () => mid);
    if (phase === 3) return Array.from({ length: slot.sets }, () => Math.max(min, max - 1));
    return Array.from({ length: slot.sets }, () => max);
  }

  if (pattern === 2) {
    if (weekIndex < 5) return Array.from({ length: slot.sets }, (_, idx) => Math.max(min, mid + (idx % 2)));
    if (weekIndex < 10) return Array.from({ length: slot.sets }, () => Math.max(min, mid - 1));
    if (weekIndex < 13) return Array.from({ length: slot.sets }, () => min);
    return Array.from({ length: slot.sets }, (_, idx) => Math.min(max, mid + (idx % 2)));
  }

  if (pattern === 3) {
    if (weekIndex < 6) return Array.from({ length: slot.sets }, () => Math.max(min, max - 1));
    if (weekIndex < 9) return Array.from({ length: slot.sets }, () => min);
    if (weekIndex < 13) return Array.from({ length: slot.sets }, (_, idx) => Math.max(min, mid - (idx % 2)));
    return Array.from({ length: slot.sets }, () => Math.max(min, max - 1));
  }

  if (pattern === 4) {
    const wave = [mid, max - 1, min + 1, mid - 1, max, min, mid, max - 1][weekIndex % 8] ?? mid;
    return Array.from({ length: slot.sets }, (_, idx) => Math.max(min, Math.min(max, wave - (idx % 2 === 0 ? 0 : 1))));
  }

  if (weekIndex < 4) return Array.from({ length: slot.sets }, () => Math.max(min, max - 1));
  if (weekIndex < 10) return Array.from({ length: slot.sets }, () => Math.max(min, mid));
  if (weekIndex < 13) return Array.from({ length: slot.sets }, () => Math.max(min, min + 1));
  return Array.from({ length: slot.sets }, () => Math.max(min, mid));
}

function buildSession(slot: ProgramSlot, day: ProgramDay, slotIndex: number, weekIndex: number, date: string, workoutId: string): SessionLog {
  const weight = buildWeekWeight(slot, slotIndex, weekIndex);
  const reps = buildSetReps(slot, slotIndex, weekIndex);

  return {
    id: workoutId,
    slotId: slot.id,
    assignmentId: slot.assignmentId,
    strengthSignalKey: slot.strengthSignalKey,
    dayId: day.id,
    dayName: day.name,
    sessionLabel: day.session,
    date,
    sets: reps.map(rep => ({ weight, reps: rep })),
    catalogExerciseId: slot.catalogExerciseId,
    exerciseSource: slot.exerciseSource,
    exerciseName: slot.exerciseName,
    muscleGroups: slot.muscleGroups.slice(),
    primaryMuscles: slot.primaryMuscles.slice(),
    secondaryMuscles: slot.secondaryMuscles.slice(),
    prescription: {
      sets: slot.sets,
      repRange: slot.repRange,
      restSeconds: slot.restSeconds,
      failure: slot.failure,
      note: slot.note,
    },
  };
}

function buildBodyweightEntries(seedStart: Date) {
  return Array.from({ length: 16 }, (_, index) => {
    const trend = 189.8 - (index * 0.12);
    const wave = [0.3, -0.1, 0.15, -0.35, 0.25, -0.05, 0.2, -0.2][index % 8] ?? 0;
    return {
      id: createSeedId('bodyweight', index),
      date: formatLocalDateKey(addDays(seedStart, (index * 7) + 2)),
      weight: Math.round((trend + wave) * 10) / 10,
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
}

async function writeWorkoutSnapshot(snapshot: {
  workoutLog: Record<string, SessionLog[]>;
  completedWorkouts: Record<string, string>;
  strengthProfile: StrengthProfile;
  weightLogs: Array<{ id: string; date: string; weight: number }>;
}) {
  await AsyncStorage.setItem(
    WORKOUT_STORAGE_KEYS.state,
    JSON.stringify({
      workoutLog: snapshot.workoutLog,
      completedWorkouts: snapshot.completedWorkouts,
      isDeloadWeek: false,
      strengthProfile: snapshot.strengthProfile,
      strengthLifts: DEFAULT_STRENGTH_LIFTS,
      weightLogs: snapshot.weightLogs,
      workoutDrafts: {},
    }),
  );

  const { weekStart, weekEnd } = getCurrentLocalWeekRange();
  await AsyncStorage.setItem(
    WORKOUT_STORAGE_KEYS.weeklyVolume,
    JSON.stringify({
      weekStart,
      weekEnd,
      volume: computeWeeklyVolume(snapshot.workoutLog, weekStart, weekEnd),
      updatedAt: Date.now(),
    }),
  );
}

export async function clearDevSeedData() {
  await resetProgramStateToBootstrap();
  await AsyncStorage.multiRemove(Object.values(WORKOUT_STORAGE_KEYS));
}

export async function seedDevData(): Promise<DevSeedResult> {
  const programState = await resetProgramStateToBootstrap();
  await AsyncStorage.multiRemove(Object.values(WORKOUT_STORAGE_KEYS));

  const days = sortProgramDays(programState.days).filter(day => !day.rest);
  const startOfCurrentWeek = getStartOfLocalWeek();
  const seedStart = addDays(startOfCurrentWeek, -(15 * 7));
  const workoutLog: Record<string, SessionLog[]> = {};
  const completedWorkouts: Record<string, string> = {};
  let workouts = 0;
  let sessions = 0;

  days.forEach(day => {
    const daySlots = getSlotsForDay(programState.slots, day.id);
    daySlots.forEach(slot => { workoutLog[slot.id] = []; });

    for (let weekIndex = 0; weekIndex < 16; weekIndex += 1) {
      const workoutDate = formatLocalDateKey(addDays(seedStart, (weekIndex * 7) + day.sortOrder));
      const workoutId = createSeedId('seed-workout', weekIndex, day.id);
      completedWorkouts[workoutDate] = day.id;
      workouts += 1;

      daySlots.forEach((slot, slotIndex) => {
        const session = buildSession(slot, day, slotIndex + day.sortOrder * 10, weekIndex, workoutDate, workoutId);
        workoutLog[slot.id] = [...(workoutLog[slot.id] ?? []), session];
        sessions += 1;
      });
    }
  });

  const weightLogs = buildBodyweightEntries(seedStart);
  const strengthProfile: StrengthProfile = {
    bodyweightLbs: weightLogs[0]?.weight ?? 188,
    trainingLevel: 'intermediate',
  };

  await writeWorkoutSnapshot({
    workoutLog,
    completedWorkouts,
    strengthProfile,
    weightLogs,
  });

  return {
    workouts,
    sessions,
    bodyweightEntries: weightLogs.length,
  };
}
