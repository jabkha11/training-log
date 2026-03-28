import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { DAYS } from '@/constants/workoutData';
import { DEFAULT_STRENGTH_LIFTS } from '@/constants/heatmap';
import type { StrengthLiftEntry, StrengthLiftKey, StrengthLifts, StrengthProfile } from '@/constants/heatmap';
import { formatLocalDateKey, getCurrentLocalWeekRange } from '@/lib/date';
import { getDefaultExerciseCatalogLink } from '@/lib/defaultExerciseCatalog';

export interface SetLog {
  weight: number;
  reps: number;
}

export interface DraftSetLog {
  weight: string;
  reps: string;
  completed: boolean;
}

export interface WorkoutDraftExercise {
  id: string;
  assignmentId: string;
  strengthSignalKey?: StrengthLiftKey | null;
  catalogExerciseId: string | number | null;
  exerciseSource: 'manual' | 'wger';
  exerciseName: string;
  exerciseImageUrl?: string | null;
  exerciseCategoryName?: string | null;
  muscleGroups: string[];
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  prescription: SessionPrescriptionSnapshot;
}

export interface SessionPrescriptionSnapshot {
  sets: number;
  repRange: [number, number];
  restSeconds: number;
  failure: boolean;
  note: string;
}

export interface SessionLog {
  id: string;
  slotId: string;
  assignmentId: string;
  strengthSignalKey?: StrengthLiftKey | null;
  dayId: string;
  dayName: string;
  sessionLabel: string;
  date: string;
  sets: SetLog[];
  catalogExerciseId: string | number | null;
  exerciseSource: 'manual' | 'wger';
  exerciseName: string;
  muscleGroups: string[];
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  prescription: SessionPrescriptionSnapshot;
}

export interface WorkoutDraft {
  date: string;
  slots: Record<string, DraftSetLog[]>;
  extraExercises?: WorkoutDraftExercise[];
}

export interface LoggedSlotSessionInput {
  slotId: string;
  assignmentId: string;
  strengthSignalKey?: StrengthLiftKey | null;
  dayName: string;
  sessionLabel: string;
  catalogExerciseId: string | number | null;
  exerciseSource: 'manual' | 'wger';
  exerciseName: string;
  muscleGroups: string[];
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  prescription: SessionPrescriptionSnapshot;
  sets: SetLog[];
}

export interface WeightLogEntry {
  id: string;
  date: string;
  weight: number;
}

export type WorkoutLogData = Record<string, SessionLog[]>;
export type CompletedWorkouts = Record<string, string>;
export type WorkoutDrafts = Record<string, WorkoutDraft>;

interface WorkoutContextType {
  workoutLog: WorkoutLogData;
  completedWorkouts: CompletedWorkouts;
  isDeloadWeek: boolean;
  strengthProfile: StrengthProfile | null;
  strengthLifts: StrengthLifts;
  weightLogs: WeightLogEntry[];
  getWorkoutDraft: (dayId: string) => WorkoutDraft | null;
  saveWorkoutDraft: (dayId: string, draft: WorkoutDraft) => void;
  clearWorkoutDraft: (dayId: string) => void;
  setIsDeloadWeek: (v: boolean) => void;
  setStrengthProfile: (profile: StrengthProfile | null) => void;
  updateStrengthLift: (liftKey: StrengthLiftKey, entry: StrengthLiftEntry) => void;
  logBodyweight: (weight: number, date?: string) => void;
  logWorkout: (dayId: string, slotLogs: LoggedSlotSessionInput[], date: string) => void;
  deleteSession: (key: string, sessionId: string) => void;
  updateSession: (key: string, sessionId: string, newSets: SetLog[]) => void;
  clearAllData: () => void;
  markCompleted: (dateKey: string, dayId: string) => void;
  getPrevSessions: (slotId: string) => SessionLog[];
  getWeeklyVolume: () => Record<string, number>;
  reloadFromStorage: () => Promise<void>;
}

const WorkoutContext = createContext<WorkoutContextType | null>(null);

const STORAGE_KEY_LOG = 'tl_log_v3';
const STORAGE_KEY_COMPLETED = 'tl_completed_v2';
const STORAGE_KEY_DELOAD = 'tl_deload';
const STORAGE_KEY_STATE = 'tl_state_v1';
const STORAGE_KEY_WEEKLY_VOLUME = 'tl_weekly_volume_v1';

export const WORKOUT_STORAGE_KEYS = {
  log: STORAGE_KEY_LOG,
  completed: STORAGE_KEY_COMPLETED,
  deload: STORAGE_KEY_DELOAD,
  state: STORAGE_KEY_STATE,
  weeklyVolume: STORAGE_KEY_WEEKLY_VOLUME,
} as const;

type LegacySessionLog = {
  id: string;
  date: string;
  sets: SetLog[];
};

type LegacyWorkoutDraft = {
  date: string;
  exercises: DraftSetLog[][];
};

type LegacyWorkoutLogData = Record<string, LegacySessionLog[]>;
type LegacyWorkoutDrafts = Record<string, LegacyWorkoutDraft>;

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getBootstrapSlotId(dayId: string, exIdx: number) {
  return `bootstrap-${dayId}-${exIdx}`;
}

function getBootstrapDayId(dayId: string) {
  return `bootstrap-${dayId}`;
}

function isNewSessionLog(value: unknown): value is SessionLog {
  if (!value || typeof value !== 'object') return false;
  const session = value as Record<string, unknown>;
  return typeof session.slotId === 'string'
    && typeof session.assignmentId === 'string'
    && (session.strengthSignalKey === undefined || session.strengthSignalKey === null || typeof session.strengthSignalKey === 'string')
    && typeof session.dayId === 'string'
    && typeof session.dayName === 'string'
    && typeof session.sessionLabel === 'string'
    && (session.catalogExerciseId === null || typeof session.catalogExerciseId === 'string' || typeof session.catalogExerciseId === 'number')
    && (session.exerciseSource === 'manual' || session.exerciseSource === 'wger')
    && typeof session.exerciseName === 'string'
    && Array.isArray(session.muscleGroups)
    && typeof session.date === 'string';
}

function isSlotBasedSessionLog(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const session = value as Record<string, unknown>;
  return typeof session.slotId === 'string'
    && typeof session.dayId === 'string'
    && typeof session.dayName === 'string'
    && typeof session.sessionLabel === 'string'
    && typeof session.exerciseName === 'string'
    && Array.isArray(session.muscleGroups)
    && typeof session.date === 'string';
}

function upgradeSessionLog(session: Partial<SessionLog> & {
  slotId: string;
  dayId: string;
  dayName: string;
  sessionLabel: string;
  date: string;
  sets: SetLog[];
  exerciseName: string;
  muscleGroups: string[];
  prescription: SessionPrescriptionSnapshot;
  id: string;
}): SessionLog {
  const upgradedSession: SessionLog = {
    ...session,
    assignmentId: session.assignmentId || `${session.slotId}-legacy`,
    strengthSignalKey: session.strengthSignalKey ?? null,
    catalogExerciseId: session.catalogExerciseId ?? null,
    exerciseSource: session.exerciseSource === 'wger' ? 'wger' : 'manual',
    primaryMuscles: Array.isArray(session.primaryMuscles) ? session.primaryMuscles : [],
    secondaryMuscles: Array.isArray(session.secondaryMuscles) ? session.secondaryMuscles : [],
  };

  if (upgradedSession.exerciseSource === 'manual' && upgradedSession.catalogExerciseId === null) {
    const catalogLink = getDefaultExerciseCatalogLink(upgradedSession.exerciseName);
    if (catalogLink) {
      return {
        ...upgradedSession,
        catalogExerciseId: catalogLink.catalogExerciseId,
        exerciseSource: 'wger',
      };
    }
  }

  return upgradedSession;
}

function computeWeeklyVolume(log: WorkoutLogData, weekStart: string, weekEnd: string) {
  const volume: Record<string, number> = {};

  Object.values(log).forEach(sessions => {
    sessions.forEach(session => {
      if (session.date < weekStart || session.date > weekEnd) return;
      session.muscleGroups.forEach(muscle => {
        volume[muscle] = (volume[muscle] || 0) + session.sets.length;
      });
    });
  });

  return volume;
}

function migrateWorkoutLog(log: WorkoutLogData | LegacyWorkoutLogData): WorkoutLogData {
  const migrated: WorkoutLogData = {};

  Object.entries(log ?? {}).forEach(([key, sessions]) => {
    if (!Array.isArray(sessions) || sessions.length === 0) return;

    if (isNewSessionLog(sessions[0])) {
      migrated[key] = (sessions as SessionLog[]).map(upgradeSessionLog);
      return;
    }

     if (isSlotBasedSessionLog(sessions[0])) {
      migrated[key] = (sessions as Array<Partial<SessionLog> & {
        slotId: string;
        dayId: string;
        dayName: string;
        sessionLabel: string;
        date: string;
        sets: SetLog[];
        exerciseName: string;
        muscleGroups: string[];
        prescription: SessionPrescriptionSnapshot;
        id: string;
      }>).map(upgradeSessionLog);
      return;
    }

    const [legacyDayId, legacyExIdxRaw] = key.split('_');
    const legacyExIdx = Number.parseInt(legacyExIdxRaw ?? '', 10);
    if (!legacyDayId || Number.isNaN(legacyExIdx)) return;

    const day = DAYS.find(entry => entry.id === legacyDayId);
    const exercise = day?.exercises?.[legacyExIdx];
    if (!day || !exercise) return;

    const slotId = getBootstrapSlotId(legacyDayId, legacyExIdx);
    const catalogLink = getDefaultExerciseCatalogLink(exercise.name);
    migrated[slotId] = (sessions as LegacySessionLog[]).map(session => ({
      id: session.id,
      slotId,
      assignmentId: `assignment-${slotId}-legacy`,
      strengthSignalKey: null,
      dayId: getBootstrapDayId(legacyDayId),
      dayName: day.name,
      sessionLabel: day.session,
      date: session.date,
      sets: session.sets,
      catalogExerciseId: catalogLink?.catalogExerciseId ?? null,
      exerciseSource: catalogLink ? 'wger' : 'manual',
      exerciseName: exercise.name,
      muscleGroups: exercise.muscleGroups.slice(),
      primaryMuscles: [],
      secondaryMuscles: [],
      prescription: {
        sets: exercise.sets,
        repRange: exercise.repRange,
        restSeconds: exercise.rest,
        failure: exercise.failure,
        note: exercise.note,
      },
    }));
  });

  return migrated;
}

function migrateCompletedWorkouts(completed: CompletedWorkouts) {
  const migrated: CompletedWorkouts = {};
  Object.entries(completed ?? {}).forEach(([dateKey, dayId]) => {
    migrated[dateKey] = dayId.startsWith('bootstrap-') || dayId.startsWith('program-day-')
      ? dayId
      : getBootstrapDayId(dayId);
  });
  return migrated;
}

function migrateWorkoutDrafts(drafts: WorkoutDrafts | LegacyWorkoutDrafts): WorkoutDrafts {
  const migrated: WorkoutDrafts = {};

  Object.entries(drafts ?? {}).forEach(([dayId, draft]) => {
    if (!draft || typeof draft !== 'object') return;
    const maybeNewDraft = draft as WorkoutDraft;
    if ('slots' in maybeNewDraft && maybeNewDraft.slots) {
      migrated[dayId.startsWith('bootstrap-') || dayId.startsWith('program-day-') ? dayId : getBootstrapDayId(dayId)] = {
        ...maybeNewDraft,
        extraExercises: Array.isArray(maybeNewDraft.extraExercises) ? maybeNewDraft.extraExercises : [],
      };
      return;
    }

    const legacyDraft = draft as LegacyWorkoutDraft;
    const nextDayId = dayId.startsWith('bootstrap-') || dayId.startsWith('program-day-')
      ? dayId
      : getBootstrapDayId(dayId);
    const slots: Record<string, DraftSetLog[]> = {};
    legacyDraft.exercises?.forEach((sets, exIdx) => {
      slots[getBootstrapSlotId(dayId, exIdx)] = sets;
    });

    migrated[nextDayId] = {
      date: legacyDraft.date,
      slots,
      extraExercises: [],
    };
  });

  return migrated;
}

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const [workoutLog, setWorkoutLog] = useState<WorkoutLogData>({});
  const [completedWorkouts, setCompletedWorkouts] = useState<CompletedWorkouts>({});
  const [isDeloadWeek, setIsDeloadWeekState] = useState(false);
  const [weeklyVolume, setWeeklyVolume] = useState<Record<string, number>>({});
  const [strengthProfile, setStrengthProfileState] = useState<StrengthProfile | null>(null);
  const [strengthLifts, setStrengthLifts] = useState<StrengthLifts>(DEFAULT_STRENGTH_LIFTS);
  const [weightLogs, setWeightLogs] = useState<WeightLogEntry[]>([]);
  const [workoutDrafts, setWorkoutDrafts] = useState<WorkoutDrafts>({});

  const stateRef = useRef<{
    workoutLog: WorkoutLogData;
    completedWorkouts: CompletedWorkouts;
    isDeloadWeek: boolean;
    strengthProfile: StrengthProfile | null;
    strengthLifts: StrengthLifts;
    weightLogs: WeightLogEntry[];
    workoutDrafts: WorkoutDrafts;
  }>({
    workoutLog: {},
    completedWorkouts: {},
    isDeloadWeek: false,
    strengthProfile: null,
    strengthLifts: DEFAULT_STRENGTH_LIFTS,
    weightLogs: [],
    workoutDrafts: {},
  });

  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const reloadFromStorage = useCallback(async () => {
    try {
      const [combinedState, log, completed, deload, weeklyVol] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY_STATE),
        AsyncStorage.getItem(STORAGE_KEY_LOG),
        AsyncStorage.getItem(STORAGE_KEY_COMPLETED),
        AsyncStorage.getItem(STORAGE_KEY_DELOAD),
        AsyncStorage.getItem(STORAGE_KEY_WEEKLY_VOLUME),
      ]);

      let nextWorkoutLog: WorkoutLogData = {};
      let nextCompletedWorkouts: CompletedWorkouts = {};
      let nextIsDeloadWeek = false;
      let nextStrengthProfile: StrengthProfile | null = null;
      let nextStrengthLifts: StrengthLifts = DEFAULT_STRENGTH_LIFTS;
      let nextWeightLogs: WeightLogEntry[] = [];
      let nextWorkoutDrafts: WorkoutDrafts = {};

      if (combinedState) {
        const parsed = JSON.parse(combinedState) as {
          workoutLog?: WorkoutLogData | LegacyWorkoutLogData;
          completedWorkouts?: CompletedWorkouts;
          isDeloadWeek?: boolean;
          strengthProfile?: StrengthProfile | null;
          strengthLifts?: Partial<StrengthLifts>;
          weightLogs?: WeightLogEntry[];
          workoutDrafts?: WorkoutDrafts | LegacyWorkoutDrafts;
        };
        nextWorkoutLog = migrateWorkoutLog(parsed.workoutLog ?? {});
        nextCompletedWorkouts = migrateCompletedWorkouts(parsed.completedWorkouts ?? {});
        nextIsDeloadWeek = !!parsed.isDeloadWeek;
        nextStrengthProfile = parsed.strengthProfile ?? null;
        nextStrengthLifts = { ...DEFAULT_STRENGTH_LIFTS, ...(parsed.strengthLifts ?? {}) };
        nextWeightLogs = (parsed.weightLogs ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));
        nextWorkoutDrafts = migrateWorkoutDrafts(parsed.workoutDrafts ?? {});
      } else {
        nextWorkoutLog = migrateWorkoutLog(log ? JSON.parse(log) : {});
        nextCompletedWorkouts = migrateCompletedWorkouts(completed ? JSON.parse(completed) : {});
        nextIsDeloadWeek = deload ? JSON.parse(deload) : false;
      }

      stateRef.current = {
        workoutLog: nextWorkoutLog,
        completedWorkouts: nextCompletedWorkouts,
        isDeloadWeek: nextIsDeloadWeek,
        strengthProfile: nextStrengthProfile,
        strengthLifts: nextStrengthLifts,
        weightLogs: nextWeightLogs,
        workoutDrafts: nextWorkoutDrafts,
      };

      setWorkoutLog(nextWorkoutLog);
      setCompletedWorkouts(nextCompletedWorkouts);
      setIsDeloadWeekState(nextIsDeloadWeek);
      setStrengthProfileState(nextStrengthProfile);
      setStrengthLifts(nextStrengthLifts);
      setWeightLogs(nextWeightLogs);
      setWorkoutDrafts(nextWorkoutDrafts);

      const { weekStart, weekEnd } = getCurrentLocalWeekRange();
      if (weeklyVol) {
        const parsedWeekly = JSON.parse(weeklyVol) as { weekStart?: string; weekEnd?: string; volume?: Record<string, number> };
        if (parsedWeekly?.weekStart === weekStart && parsedWeekly?.weekEnd === weekEnd && parsedWeekly.volume) {
          setWeeklyVolume(parsedWeekly.volume);
        } else {
          setWeeklyVolume(computeWeeklyVolume(nextWorkoutLog, weekStart, weekEnd));
        }
      } else {
        setWeeklyVolume(computeWeeklyVolume(nextWorkoutLog, weekStart, weekEnd));
      }
    } catch {}
  }, []);

  useEffect(() => {
    void reloadFromStorage().then(async () => {
      const { weekStart, weekEnd } = getCurrentLocalWeekRange();
      const snapshot = {
        workoutLog: stateRef.current.workoutLog,
        completedWorkouts: stateRef.current.completedWorkouts,
        isDeloadWeek: stateRef.current.isDeloadWeek,
        strengthProfile: stateRef.current.strengthProfile,
        strengthLifts: stateRef.current.strengthLifts,
        weightLogs: stateRef.current.weightLogs,
        workoutDrafts: stateRef.current.workoutDrafts,
      };
      await AsyncStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(snapshot));
      await AsyncStorage.setItem(
        STORAGE_KEY_WEEKLY_VOLUME,
        JSON.stringify({ weekStart, weekEnd, volume: computeWeeklyVolume(stateRef.current.workoutLog, weekStart, weekEnd), updatedAt: Date.now() }),
      );
    });
  }, [reloadFromStorage]);

  const enqueueWrite = useCallback((fn: () => Promise<void>) => {
    writeQueueRef.current = writeQueueRef.current
      .then(fn)
      .catch(() => fn());
  }, []);

  const createSnapshot = useCallback((overrides: Partial<typeof stateRef.current> = {}) => ({
    ...stateRef.current,
    ...overrides,
  }), []);

  const setIsDeloadWeek = useCallback((v: boolean) => {
    stateRef.current.isDeloadWeek = v;
    setIsDeloadWeekState(v);
    const snapshot = createSnapshot({ isDeloadWeek: v });
    enqueueWrite(async () => {
      await AsyncStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(snapshot));
    });
  }, [createSnapshot, enqueueWrite]);

  const setStrengthProfile = useCallback((profile: StrengthProfile | null) => {
    stateRef.current.strengthProfile = profile;
    setStrengthProfileState(profile);
    const snapshot = createSnapshot({ strengthProfile: profile });
    enqueueWrite(async () => {
      await AsyncStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(snapshot));
    });
  }, [createSnapshot, enqueueWrite]);

  const updateStrengthLift = useCallback((liftKey: StrengthLiftKey, entry: StrengthLiftEntry) => {
    const nextStrengthLifts = {
      ...stateRef.current.strengthLifts,
      [liftKey]: entry,
    };
    stateRef.current = {
      ...stateRef.current,
      strengthLifts: nextStrengthLifts,
    };
    setStrengthLifts(nextStrengthLifts);
    const snapshot = createSnapshot({ strengthLifts: nextStrengthLifts });
    enqueueWrite(async () => {
      await AsyncStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(snapshot));
    });
  }, [createSnapshot, enqueueWrite]);

  const logBodyweight = useCallback((weight: number, date = formatLocalDateKey()) => {
    if (!Number.isFinite(weight) || weight <= 0) return;

    const nextEntry: WeightLogEntry = {
      id: makeId(),
      date,
      weight,
    };

    const dedupedLogs = stateRef.current.weightLogs.filter(entry => entry.date !== date);
    const nextWeightLogs = [nextEntry, ...dedupedLogs].sort((a, b) => b.date.localeCompare(a.date));
    const nextStrengthProfile = stateRef.current.strengthProfile
      ? { ...stateRef.current.strengthProfile, bodyweightLbs: weight }
      : { bodyweightLbs: weight, trainingLevel: 'intermediate' as const };

    stateRef.current = {
      ...stateRef.current,
      weightLogs: nextWeightLogs,
      strengthProfile: nextStrengthProfile,
    };
    setWeightLogs(nextWeightLogs);
    setStrengthProfileState(nextStrengthProfile);

    const snapshot = createSnapshot({
      weightLogs: nextWeightLogs,
      strengthProfile: nextStrengthProfile,
    });

    enqueueWrite(async () => {
      await AsyncStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(snapshot));
    });
  }, [createSnapshot, enqueueWrite]);

  const getWorkoutDraft = useCallback((dayId: string) => {
    return stateRef.current.workoutDrafts[dayId] ?? null;
  }, []);

  const saveWorkoutDraft = useCallback((dayId: string, draft: WorkoutDraft) => {
    const nextWorkoutDrafts = {
      ...stateRef.current.workoutDrafts,
      [dayId]: draft,
    };
    stateRef.current = {
      ...stateRef.current,
      workoutDrafts: nextWorkoutDrafts,
    };
    setWorkoutDrafts(nextWorkoutDrafts);

    const snapshot = createSnapshot({ workoutDrafts: nextWorkoutDrafts });
    enqueueWrite(async () => {
      await AsyncStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(snapshot));
    });
  }, [createSnapshot, enqueueWrite]);

  const clearWorkoutDraft = useCallback((dayId: string) => {
    if (!stateRef.current.workoutDrafts[dayId]) return;

    const nextWorkoutDrafts = { ...stateRef.current.workoutDrafts };
    delete nextWorkoutDrafts[dayId];

    stateRef.current = {
      ...stateRef.current,
      workoutDrafts: nextWorkoutDrafts,
    };
    setWorkoutDrafts(nextWorkoutDrafts);

    const snapshot = createSnapshot({ workoutDrafts: nextWorkoutDrafts });
    enqueueWrite(async () => {
      await AsyncStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(snapshot));
    });
  }, [createSnapshot, enqueueWrite]);

  const logWorkout = useCallback((
    dayId: string,
    slotLogs: LoggedSlotSessionInput[],
    date: string,
  ) => {
    const sessionId = makeId();
    const nextLog = { ...stateRef.current.workoutLog };
    for (const slotLog of slotLogs) {
      if (slotLog.sets.length === 0) continue;
      const key = slotLog.slotId;
      const nextSession: SessionLog = {
        id: sessionId,
        slotId: slotLog.slotId,
        assignmentId: slotLog.assignmentId,
        strengthSignalKey: slotLog.strengthSignalKey ?? null,
        dayId,
        dayName: slotLog.dayName,
        sessionLabel: slotLog.sessionLabel,
        date,
        sets: slotLog.sets,
        catalogExerciseId: slotLog.catalogExerciseId,
        exerciseSource: slotLog.exerciseSource,
        exerciseName: slotLog.exerciseName,
        muscleGroups: slotLog.muscleGroups.slice(),
        primaryMuscles: slotLog.primaryMuscles?.slice() ?? [],
        secondaryMuscles: slotLog.secondaryMuscles?.slice() ?? [],
        prescription: slotLog.prescription,
      };
      nextLog[key] = [...(nextLog[key] ?? []), nextSession];
    }
    stateRef.current = {
      ...stateRef.current,
      workoutLog: nextLog,
      workoutDrafts: Object.fromEntries(
        Object.entries(stateRef.current.workoutDrafts).filter(([draftDayId]) => draftDayId !== dayId)
      ),
    };

    setWorkoutLog(nextLog);
    setWorkoutDrafts(stateRef.current.workoutDrafts);

    const { weekStart, weekEnd } = getCurrentLocalWeekRange();
    const nextWeeklyVolume = computeWeeklyVolume(nextLog, weekStart, weekEnd);
    setWeeklyVolume(nextWeeklyVolume);

    enqueueWrite(async () => {
      await AsyncStorage.setItem(
        STORAGE_KEY_STATE,
        JSON.stringify(createSnapshot({ workoutLog: nextLog, workoutDrafts: stateRef.current.workoutDrafts })),
      );
      await AsyncStorage.setItem(
        STORAGE_KEY_WEEKLY_VOLUME,
        JSON.stringify({ weekStart, weekEnd, volume: nextWeeklyVolume, updatedAt: Date.now() }),
      );
    });
  }, [createSnapshot, enqueueWrite]);

  const deleteSession = useCallback((key: string, sessionId: string) => {
    const prevLog = stateRef.current.workoutLog;
    if (!prevLog[key]) return;
    const removedSession = prevLog[key].find(s => s.id === sessionId);

    const nextLog = { ...prevLog };
    nextLog[key] = nextLog[key].filter(s => s.id !== sessionId);
    if (nextLog[key].length === 0) delete nextLog[key];

    let nextCompletedWorkouts = stateRef.current.completedWorkouts;
    if (removedSession?.date) {
      const hasAnySessionOnDate = Object.values(nextLog).some(sessions =>
        sessions.some(session => session.date === removedSession.date)
      );
      if (!hasAnySessionOnDate && nextCompletedWorkouts[removedSession.date]) {
        nextCompletedWorkouts = { ...nextCompletedWorkouts };
        delete nextCompletedWorkouts[removedSession.date];
      } else if (
        nextCompletedWorkouts[removedSession.date] === removedSession.dayId &&
        !Object.values(nextLog).some(sessions =>
          sessions.some(session => session.dayId === removedSession.dayId && session.date === removedSession.date)
        )
      ) {
        nextCompletedWorkouts = { ...nextCompletedWorkouts };
        delete nextCompletedWorkouts[removedSession.date];
      }
    }

    stateRef.current = {
      ...stateRef.current,
      workoutLog: nextLog,
      completedWorkouts: nextCompletedWorkouts,
    };
    setWorkoutLog(nextLog);
    setCompletedWorkouts(nextCompletedWorkouts);

    const { weekStart, weekEnd } = getCurrentLocalWeekRange();
    const nextWeeklyVolume = computeWeeklyVolume(nextLog, weekStart, weekEnd);
    setWeeklyVolume(nextWeeklyVolume);

    enqueueWrite(async () => {
      await AsyncStorage.setItem(
        STORAGE_KEY_STATE,
        JSON.stringify(createSnapshot({ workoutLog: nextLog, completedWorkouts: nextCompletedWorkouts })),
      );
      await AsyncStorage.setItem(
        STORAGE_KEY_WEEKLY_VOLUME,
        JSON.stringify({ weekStart, weekEnd, volume: nextWeeklyVolume, updatedAt: Date.now() }),
      );
    });
  }, [createSnapshot, enqueueWrite]);

  const updateSession = useCallback((key: string, sessionId: string, newSets: SetLog[]) => {
    const prevLog = stateRef.current.workoutLog;
    if (!prevLog[key]) return;

    const nextLog = { ...prevLog };
    nextLog[key] = nextLog[key].map(s =>
      s.id === sessionId ? { ...s, sets: newSets } : s
    );

    stateRef.current = { ...stateRef.current, workoutLog: nextLog };
    setWorkoutLog(nextLog);

    const { weekStart, weekEnd } = getCurrentLocalWeekRange();
    const nextWeeklyVolume = computeWeeklyVolume(nextLog, weekStart, weekEnd);
    setWeeklyVolume(nextWeeklyVolume);

    enqueueWrite(async () => {
      await AsyncStorage.setItem(
        STORAGE_KEY_STATE,
        JSON.stringify(createSnapshot({ workoutLog: nextLog })),
      );
      await AsyncStorage.setItem(
        STORAGE_KEY_WEEKLY_VOLUME,
        JSON.stringify({ weekStart, weekEnd, volume: nextWeeklyVolume, updatedAt: Date.now() }),
      );
    });
  }, [createSnapshot, enqueueWrite]);

  const clearAllData = useCallback(() => {
    stateRef.current = {
      workoutLog: {},
      completedWorkouts: {},
      isDeloadWeek: false,
      strengthProfile: null,
      strengthLifts: DEFAULT_STRENGTH_LIFTS,
      weightLogs: [],
      workoutDrafts: {},
    };
    setWorkoutLog({});
    setCompletedWorkouts({});
    setIsDeloadWeekState(false);
    setWeeklyVolume({});
    setStrengthProfileState(null);
    setStrengthLifts(DEFAULT_STRENGTH_LIFTS);
    setWeightLogs([]);
    setWorkoutDrafts({});
    enqueueWrite(async () => {
      await AsyncStorage.multiRemove([
        STORAGE_KEY_LOG,
        STORAGE_KEY_COMPLETED,
        STORAGE_KEY_DELOAD,
        STORAGE_KEY_STATE,
        STORAGE_KEY_WEEKLY_VOLUME,
      ]);
    });
  }, [enqueueWrite]);

  const markCompleted = useCallback((dateKey: string, dayId: string) => {
    const next = { ...stateRef.current.completedWorkouts, [dateKey]: dayId };
    stateRef.current = { ...stateRef.current, completedWorkouts: next };
    setCompletedWorkouts(next);

    const snapshot = createSnapshot({ completedWorkouts: next });

    enqueueWrite(async () => {
      await AsyncStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(snapshot));
    });
  }, [createSnapshot, enqueueWrite]);

  const getPrevSessions = useCallback((slotId: string): SessionLog[] => {
    return (stateRef.current.workoutLog[slotId] || [])
      .map(upgradeSessionLog)
      .slice()
      .reverse();
  }, []);

  const getWeeklyVolume = useCallback((): Record<string, number> => weeklyVolume, [weeklyVolume]);

  return (
    <WorkoutContext.Provider value={{
      workoutLog,
      completedWorkouts,
      isDeloadWeek,
      strengthProfile,
      strengthLifts,
      weightLogs,
      getWorkoutDraft,
      saveWorkoutDraft,
      clearWorkoutDraft,
      setIsDeloadWeek,
      setStrengthProfile,
      updateStrengthLift,
      logBodyweight,
      logWorkout,
      deleteSession,
      updateSession,
      clearAllData,
      markCompleted,
      getPrevSessions,
      getWeeklyVolume,
      reloadFromStorage,
    }}>
      {children}
    </WorkoutContext.Provider>
  );
}

export function useWorkout() {
  const ctx = useContext(WorkoutContext);
  if (!ctx) throw new Error('useWorkout must be used within WorkoutProvider');
  return ctx;
}
