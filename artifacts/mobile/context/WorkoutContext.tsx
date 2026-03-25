import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DAYS, MUSCLE_TARGETS } from '@/constants/workoutData';

export interface SetLog {
  weight: number;
  reps: number;
}

export interface SessionLog {
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
  logSession: (dayId: string, exIdx: number, sets: SetLog[], date: string) => void;
  deleteSession: (dayId: string, exIdx: number, date: string) => void;
  markCompleted: (dateKey: string, dayId: string) => void;
  getPrevSessions: (dayId: string, exIdx: number) => SessionLog[];
  getWeeklyVolume: () => Record<string, number>;
}

const WorkoutContext = createContext<WorkoutContextType | null>(null);

const STORAGE_KEY_LOG = 'tl_log_v2';
const STORAGE_KEY_COMPLETED = 'tl_completed_v2';
const STORAGE_KEY_DELOAD = 'tl_deload';

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const [workoutLog, setWorkoutLog] = useState<WorkoutLogData>({});
  const [completedWorkouts, setCompletedWorkouts] = useState<CompletedWorkouts>({});
  const [isDeloadWeek, setIsDeloadWeekState] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [log, completed, deload] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_LOG),
          AsyncStorage.getItem(STORAGE_KEY_COMPLETED),
          AsyncStorage.getItem(STORAGE_KEY_DELOAD),
        ]);
        if (log) setWorkoutLog(JSON.parse(log));
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

  const logSession = useCallback(async (dayId: string, exIdx: number, sets: SetLog[], date: string) => {
    const key = `${dayId}_${exIdx}`;
    setWorkoutLog(prev => {
      const next = { ...prev };
      if (!next[key]) next[key] = [];
      next[key] = [...next[key], { date, sets }];
      AsyncStorage.setItem(STORAGE_KEY_LOG, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const deleteSession = useCallback((dayId: string, exIdx: number, date: string) => {
    const key = `${dayId}_${exIdx}`;
    setWorkoutLog(prev => {
      const next = { ...prev };
      if (!next[key]) return prev;
      next[key] = next[key].filter(s => s.date !== date);
      if (next[key].length === 0) delete next[key];
      AsyncStorage.setItem(STORAGE_KEY_LOG, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const markCompleted = useCallback(async (dateKey: string, dayId: string) => {
    setCompletedWorkouts(prev => {
      const next = { ...prev, [dateKey]: dayId };
      AsyncStorage.setItem(STORAGE_KEY_COMPLETED, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const getPrevSessions = useCallback((dayId: string, exIdx: number): SessionLog[] => {
    const key = `${dayId}_${exIdx}`;
    return (workoutLog[key] || []).slice().reverse();
  }, [workoutLog]);

  const getWeeklyVolume = useCallback((): Record<string, number> => {
    const volume: Record<string, number> = {};
    const today = new Date();
    const dow = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dow + 6) % 7));
    const weekStart = monday.toISOString().split('T')[0];
    const weekEnd = today.toISOString().split('T')[0];

    Object.entries(workoutLog).forEach(([key, sessions]) => {
      const [dayId, exIdxStr] = key.split('_');
      const exIdx = parseInt(exIdxStr);
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
      logSession,
      deleteSession,
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
