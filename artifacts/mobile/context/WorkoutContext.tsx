import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { DAYS, MUSCLE_TARGETS } from '@/constants/workoutData';

export interface SetLog {
  weight: number;
  reps: number;
}

export interface SessionLog {
  id: string;
  date: string;
  sets: SetLog[];
}

export type WorkoutLogData = Record<string, SessionLog[]>;
export type CompletedWorkouts = Record<string, string>;

interface WorkoutContextType {
  workoutLog: WorkoutLogData;
  completedWorkouts: CompletedWorkouts;
  isDeloadWeek: boolean;
  setIsDeloadWeek: (v: boolean) => void;
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

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function saveLog(data: WorkoutLogData) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY_LOG, JSON.stringify(data));
  } catch {}
}

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const [workoutLog, setWorkoutLog] = useState<WorkoutLogData>({});
  const [completedWorkouts, setCompletedWorkouts] = useState<CompletedWorkouts>({});
  const [isDeloadWeek, setIsDeloadWeekState] = useState(false);
  const logRef = useRef<WorkoutLogData>({});

  useEffect(() => {
    const load = async () => {
      try {
        const [log, completed, deload] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_LOG),
          AsyncStorage.getItem(STORAGE_KEY_COMPLETED),
          AsyncStorage.getItem(STORAGE_KEY_DELOAD),
        ]);
        if (log) {
          const parsed = JSON.parse(log);
          logRef.current = parsed;
          setWorkoutLog(parsed);
        }
        if (completed) setCompletedWorkouts(JSON.parse(completed));
        if (deload) setIsDeloadWeekState(JSON.parse(deload));
      } catch {}
    };
    load();
  }, []);

  const setIsDeloadWeek = useCallback(async (v: boolean) => {
    setIsDeloadWeekState(v);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_DELOAD, JSON.stringify(v));
    } catch {}
  }, []);

  const logWorkout = useCallback((
    dayId: string,
    exerciseSets: { exIdx: number; sets: SetLog[] }[],
    date: string,
  ) => {
    const sessionId = makeId();
    const next = { ...logRef.current };
    for (const { exIdx, sets } of exerciseSets) {
      if (sets.length === 0) continue;
      const key = `${dayId}_${exIdx}`;
      next[key] = [...(next[key] ?? []), { id: sessionId, date, sets }];
    }
    logRef.current = next;
    setWorkoutLog(next);
    saveLog(next);
  }, []);

  const deleteSession = useCallback((key: string, sessionId: string) => {
    const next = { ...logRef.current };
    if (!next[key]) return;
    next[key] = next[key].filter(s => s.id !== sessionId);
    if (next[key].length === 0) delete next[key];
    logRef.current = next;
    setWorkoutLog(next);
    saveLog(next);
  }, []);

  const updateSession = useCallback((key: string, sessionId: string, newSets: SetLog[]) => {
    const next = { ...logRef.current };
    if (!next[key]) return;
    next[key] = next[key].map(s =>
      s.id === sessionId ? { ...s, sets: newSets } : s
    );
    logRef.current = next;
    setWorkoutLog(next);
    saveLog(next);
  }, []);

  const clearAllData = useCallback(async () => {
    logRef.current = {};
    setWorkoutLog({});
    setCompletedWorkouts({});
    try {
      await AsyncStorage.multiRemove([STORAGE_KEY_LOG, STORAGE_KEY_COMPLETED]);
    } catch {}
  }, []);

  const markCompleted = useCallback((dateKey: string, dayId: string) => {
    setCompletedWorkouts(prev => {
      const next = { ...prev, [dateKey]: dayId };
      AsyncStorage.setItem(STORAGE_KEY_COMPLETED, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const getPrevSessions = useCallback((dayId: string, exIdx: number): SessionLog[] => {
    const key = `${dayId}_${exIdx}`;
    return (logRef.current[key] || []).slice().reverse();
  }, []);

  const getWeeklyVolume = useCallback((): Record<string, number> => {
    const volume: Record<string, number> = {};
    const today = new Date();
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dow + 6) % 7));
    const weekStart = monday.toISOString().split('T')[0];
    const weekEnd = today.toISOString().split('T')[0];

    Object.entries(logRef.current).forEach(([key, sessions]) => {
      const parts = key.split('_');
      const dayId = parts[0];
      const exIdx = parseInt(parts[1]);
      const day = DAYS.find(d => d.id === dayId);
      if (!day || !day.exercises) return;
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
  }, [workoutLog]);

  return (
    <WorkoutContext.Provider value={{
      workoutLog,
      completedWorkouts,
      isDeloadWeek,
      setIsDeloadWeek,
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
