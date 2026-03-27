import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { DAYS } from '@/constants/workoutData';
import { DEFAULT_STRENGTH_LIFTS } from '@/constants/heatmap';
import type { StrengthLiftEntry, StrengthLiftKey, StrengthLifts, StrengthProfile } from '@/constants/heatmap';
import { formatLocalDateKey, getCurrentLocalWeekRange } from '@/lib/date';

export interface SetLog {
  weight: number;
  reps: number;
}

export interface SessionLog {
  id: string;
  date: string;
  sets: SetLog[];
}

export interface DraftSetLog {
  weight: string;
  reps: string;
  completed: boolean;
}

export interface WorkoutDraft {
  date: string;
  exercises: DraftSetLog[][];
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
  logWorkout: (dayId: string, exerciseSets: { exIdx: number; sets: SetLog[] }[], date: string) => void;
  deleteSession: (key: string, sessionId: string) => void;
  updateSession: (key: string, sessionId: string, newSets: SetLog[]) => void;
  clearAllData: () => void;
  markCompleted: (dateKey: string, dayId: string) => void;
  getPrevSessions: (dayId: string, exIdx: number) => SessionLog[];
  getWeeklyVolume: () => Record<string, number>;
}

const WorkoutContext = createContext<WorkoutContextType | null>(null);

const STORAGE_KEY_LOG = 'tl_log_v3';
const STORAGE_KEY_COMPLETED = 'tl_completed_v2';
const STORAGE_KEY_DELOAD = 'tl_deload';
const STORAGE_KEY_STATE = 'tl_state_v1';
const STORAGE_KEY_WEEKLY_VOLUME = 'tl_weekly_volume_v1';

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function computeWeeklyVolume(log: WorkoutLogData, weekStart: string, weekEnd: string) {
  const volume: Record<string, number> = {};

  Object.entries(log).forEach(([key, sessions]) => {
    const parts = key.split('_');
    const dayId = parts[0];
    const exIdx = parseInt(parts[1] ?? '', 10);
    if (!dayId || Number.isNaN(exIdx)) return;

    const day = DAYS.find(d => d.id === dayId);
    if (!day?.exercises) return;

    const ex = day.exercises[exIdx];
    if (!ex) return;

    sessions.forEach(session => {
      if (session.date >= weekStart && session.date <= weekEnd) {
        ex.muscleGroups.forEach(muscle => {
          volume[muscle] = (volume[muscle] || 0) + session.sets.length;
        });
      }
    });
  });

  return volume;
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

  // Ensures AsyncStorage writes don't race each other and corrupt stored state.
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const load = async () => {
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
            workoutLog?: WorkoutLogData;
            completedWorkouts?: CompletedWorkouts;
            isDeloadWeek?: boolean;
            strengthProfile?: StrengthProfile | null;
            strengthLifts?: Partial<StrengthLifts>;
            weightLogs?: WeightLogEntry[];
            workoutDrafts?: WorkoutDrafts;
          };
          nextWorkoutLog = parsed.workoutLog ?? {};
          nextCompletedWorkouts = parsed.completedWorkouts ?? {};
          nextIsDeloadWeek = !!parsed.isDeloadWeek;
          nextStrengthProfile = parsed.strengthProfile ?? null;
          nextStrengthLifts = { ...DEFAULT_STRENGTH_LIFTS, ...(parsed.strengthLifts ?? {}) };
          nextWeightLogs = (parsed.weightLogs ?? []).slice().sort((a, b) => b.date.localeCompare(a.date));
          nextWorkoutDrafts = parsed.workoutDrafts ?? {};
        } else {
          if (log) nextWorkoutLog = JSON.parse(log);
          if (completed) nextCompletedWorkouts = JSON.parse(completed);
          if (deload) nextIsDeloadWeek = JSON.parse(deload);
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
          const parsedWeekly = JSON.parse(weeklyVol) as {
            weekStart?: string;
            weekEnd?: string;
            volume?: Record<string, number>;
          };

          if (parsedWeekly?.weekStart === weekStart && parsedWeekly?.weekEnd === weekEnd && parsedWeekly.volume) {
            setWeeklyVolume(parsedWeekly.volume);
            return;
          }
        }

        // Cache-miss or stale cache: recompute from stored workout logs and persist it.
        const computedWeeklyVolume = computeWeeklyVolume(nextWorkoutLog, weekStart, weekEnd);
        setWeeklyVolume(computedWeeklyVolume);
        AsyncStorage.setItem(
          STORAGE_KEY_WEEKLY_VOLUME,
          JSON.stringify({ weekStart, weekEnd, volume: computedWeeklyVolume, updatedAt: Date.now() }),
        ).catch(() => {});

        // Optional migration: consolidate separate keys into one state blob.
        if (!combinedState) {
          AsyncStorage.setItem(
            STORAGE_KEY_STATE,
            JSON.stringify({
                workoutLog: nextWorkoutLog,
                completedWorkouts: nextCompletedWorkouts,
                isDeloadWeek: nextIsDeloadWeek,
                strengthProfile: nextStrengthProfile,
                strengthLifts: nextStrengthLifts,
                weightLogs: nextWeightLogs,
                workoutDrafts: nextWorkoutDrafts,
              }),
            ).catch(() => {});
        }
      } catch {}
    };
    load();
  }, []);

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
    exerciseSets: { exIdx: number; sets: SetLog[] }[],
    date: string,
  ) => {
    const sessionId = makeId();
    const nextLog = { ...stateRef.current.workoutLog };
    for (const { exIdx, sets } of exerciseSets) {
      if (sets.length === 0) continue;
      const key = `${dayId}_${exIdx}`;
      nextLog[key] = [...(nextLog[key] ?? []), { id: sessionId, date, sets }];
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

    // Update weekly volume cache (derived from workout logs, but stored locally for speed/offline-first).
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
    const dayId = key.split('_')[0];
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
        dayId &&
        nextCompletedWorkouts[removedSession.date] === dayId &&
        !Object.entries(nextLog).some(([entryKey, sessions]) =>
          entryKey.startsWith(`${dayId}_`) && sessions.some(session => session.date === removedSession.date)
        )
      ) {
        // If this day's final session for that date is removed, clear stale completion state.
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

  const getPrevSessions = useCallback((dayId: string, exIdx: number): SessionLog[] => {
    const key = `${dayId}_${exIdx}`;
    return (stateRef.current.workoutLog[key] || []).slice().reverse();
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
