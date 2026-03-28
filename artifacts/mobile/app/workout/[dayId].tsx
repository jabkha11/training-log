import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { useCatalog } from '@/context/CatalogContext';
import { useProgram } from '@/context/ProgramContext';
import { useWorkout } from '@/context/WorkoutContext';
import type {
  DraftSetLog,
  LoggedSlotSessionInput,
  SessionPrescriptionSnapshot,
  WorkoutDraftExercise,
} from '@/context/WorkoutContext';
import type { CatalogExercise } from '@/lib/catalog';
import { confirmAlert } from '@/lib/alerts';
import { getSlotAssignmentSessions, getSlotProgressionRecommendation, type ProgressionRecommendation } from '@/lib/analytics';
import { formatLocalDateKey } from '@/lib/date';
import {
  cancelRestTimerNotification,
  enableRestTimerNotifications,
  getRestTimerNotificationState,
  registerRestTimerServiceWorker,
  scheduleRestTimerNotification,
  type RestTimerNotificationState,
} from '@/lib/restTimerNotifications';

type SetState = { weight: string; reps: string; completed: boolean };
type ExerciseSetState = Record<string, SetState[]>;
type AddExerciseScope = 'session' | 'program';
type PersistedRestTimer = {
  dayId: string;
  endsAt: number;
  timerId: string;
  title: string;
  body: string;
};

type SessionExercise = {
  id: string;
  sourceType: 'program' | 'temporary';
  assignmentId: string;
  strengthSignalKey?: WorkoutDraftExercise['strengthSignalKey'];
  exerciseName: string;
  exerciseSource: 'manual' | 'wger';
  catalogExerciseId: string | number | null;
  exerciseImageUrl?: string | null;
  exerciseCategoryName?: string | null;
  muscleGroups: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  prescription: SessionPrescriptionSnapshot;
};

const DEFAULT_SESSION_PRESCRIPTION: SessionPrescriptionSnapshot = {
  sets: 3,
  repRange: [8, 12],
  restSeconds: 90,
  failure: false,
  note: '',
};
const REST_TIMER_STORAGE_KEY = 'tl-active-rest-timer-v1';

function makeTempExerciseId() {
  return `temp-exercise-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readPersistedRestTimer() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(REST_TIMER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedRestTimer;
  } catch {
    return null;
  }
}

function writePersistedRestTimer(timer: PersistedRestTimer | null) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (!timer) {
    window.localStorage.removeItem(REST_TIMER_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(REST_TIMER_STORAGE_KEY, JSON.stringify(timer));
}

function getRepRangeLabel(repRange: [number, number]) {
  return repRange[0] === repRange[1] ? `${repRange[0]} reps` : `${repRange[0]}-${repRange[1]} reps`;
}

function getEffortLabel(failure: boolean) {
  return failure ? 'To Failure' : '1-2 RIR';
}

function formatWeight(value: number | null) {
  if (!value || !Number.isFinite(value)) return null;
  return Number.isInteger(value) ? `${value}` : `${value.toFixed(1)}`;
}

function createSetRows(count: number, draftRows?: DraftSetLog[]) {
  return Array.from({ length: count }, (_, index) => {
    const current = draftRows?.[index];
    return {
      weight: current?.weight ?? '',
      reps: current?.reps ?? '',
      completed: current?.completed ?? false,
    };
  });
}

function buildExerciseSetState(exercises: SessionExercise[], draftSlots?: Record<string, DraftSetLog[]>) {
  return Object.fromEntries(
    exercises.map(exercise => {
      const draftRows = draftSlots?.[exercise.id];
      const count = Math.max(exercise.prescription.sets, draftRows?.length ?? 0, 1);
      return [exercise.id, createSetRows(count, draftRows)];
    }),
  ) as ExerciseSetState;
}

function isExerciseComplete(exerciseId: string, sets: ExerciseSetState) {
  const rows = sets[exerciseId] ?? [];
  return rows.length > 0 && rows.every(row => row.completed);
}

function firstIncompleteExerciseId(exercises: SessionExercise[], sets: ExerciseSetState) {
  return exercises.find(exercise => !isExerciseComplete(exercise.id, sets))?.id ?? null;
}

function getLoggedSetCount(rows: SetState[]) {
  return rows.filter(row => row.weight || row.reps).length;
}

function getPerformedVolume(rows: SetState[]) {
  return Math.round(rows.reduce((sum, row) => sum + ((parseFloat(row.weight) || 0) * (parseInt(row.reps, 10) || 0)), 0));
}

function getBestSetLabel(rows: SetState[]) {
  const performed = rows
    .map(row => ({
      weight: parseFloat(row.weight) || 0,
      reps: parseInt(row.reps, 10) || 0,
    }))
    .filter(row => row.weight > 0 || row.reps > 0);

  if (performed.length === 0) return 'No logged sets yet';
  const best = performed.reduce((current, row) => (
    row.weight * row.reps >= current.weight * current.reps ? row : current
  ), performed[0]);
  return `${best.weight} x ${best.reps}`;
}

function getProgressionVisuals(recommendation: ProgressionRecommendation | null) {
  if (!recommendation) {
    return {
      icon: 'activity' as const,
      borderColor: Colors.border2,
      backgroundColor: Colors.surface3,
      textColor: Colors.text2,
      title: 'Build your baseline',
      eyebrow: 'Fresh lane',
    };
  }
  if (recommendation.status === 'progress') {
    return {
      icon: 'trending-up' as const,
      borderColor: Colors.successBorder,
      backgroundColor: Colors.successBg,
      textColor: Colors.green,
      title: `Add weight next time${recommendation.targetWeight ? `: ${formatWeight(recommendation.targetWeight)} lbs` : ''}`,
      eyebrow: 'Progress',
    };
  }
  if (recommendation.status === 'deload') {
    return {
      icon: 'rotate-ccw' as const,
      borderColor: Colors.warningBorder,
      backgroundColor: Colors.warningBg,
      textColor: Colors.orange,
      title: `Deload this exercise${recommendation.suggestedDeloadWeight ? `: ${formatWeight(recommendation.suggestedDeloadWeight)} lbs` : ''}`,
      eyebrow: 'Deload',
    };
  }
  if (recommendation.status === 'stall') {
    return {
      icon: 'pause-circle' as const,
      borderColor: Colors.dangerBorder,
      backgroundColor: Colors.dangerBg,
      textColor: Colors.red,
      title: 'Plateau detected',
      eyebrow: 'Stall',
    };
  }
  return {
    icon: 'repeat' as const,
    borderColor: Colors.infoBorder,
    backgroundColor: Colors.infoBg,
    textColor: Colors.blue,
    title: `Repeat and build reps${recommendation.targetWeight ? ` at ${formatWeight(recommendation.targetWeight)} lbs` : ''}`,
    eyebrow: 'Repeat',
  };
}

function makeDraftExerciseFromCatalog(exercise: CatalogExercise, prescription: SessionPrescriptionSnapshot): WorkoutDraftExercise {
  return {
    id: makeTempExerciseId(),
    assignmentId: `assignment-${makeTempExerciseId()}`,
    strengthSignalKey: null,
    catalogExerciseId: exercise.wgerId,
    exerciseSource: 'wger',
    exerciseName: exercise.name,
    exerciseImageUrl: exercise.imageUrls[0] ?? null,
    exerciseCategoryName: exercise.category?.name ?? null,
    muscleGroups: Array.from(new Set([...exercise.mappedPrimaryMuscles, ...exercise.mappedSecondaryMuscles])),
    primaryMuscles: exercise.mappedPrimaryMuscles,
    secondaryMuscles: exercise.mappedSecondaryMuscles,
    prescription: { ...prescription, note: '' },
  };
}

function makeDraftExerciseFromManual(name: string, prescription: SessionPrescriptionSnapshot): WorkoutDraftExercise {
  return {
    id: makeTempExerciseId(),
    assignmentId: `assignment-${makeTempExerciseId()}`,
    strengthSignalKey: null,
    catalogExerciseId: null,
    exerciseSource: 'manual',
    exerciseName: name.trim() || 'New Exercise',
    exerciseImageUrl: null,
    exerciseCategoryName: null,
    muscleGroups: [],
    primaryMuscles: [],
    secondaryMuscles: [],
    prescription: { ...prescription, note: '' },
  };
}

export default function WorkoutScreen() {
  const params = useLocalSearchParams<{ dayId: string; date?: string }>();
  const dayId = Array.isArray(params.dayId) ? params.dayId[0] : params.dayId;
  const requestedDate = Array.isArray(params.date) ? params.date[0] : params.date;
  const insets = useSafeAreaInsets();
  const { days, getDaySlots, addSlot } = useProgram();
  const {
    getPrevSessions,
    getWorkoutDraft,
    saveWorkoutDraft,
    clearWorkoutDraft,
    logWorkout,
    markCompleted,
    isDeloadWeek,
  } = useWorkout();
  const { catalogState, refreshCatalog, searchCatalog } = useCatalog();

  const day = days.find(entry => entry.id === dayId);
  const slots = useMemo(() => (day ? getDaySlots(day.id) : []), [day, getDaySlots]);
  const todayKey = formatLocalDateKey();
  const sessionDateKey = useMemo(() => {
    if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return requestedDate;
    return todayKey;
  }, [requestedDate, todayKey]);
  const topPad = Platform.OS === 'web' ? Math.max(insets.top, 14) : insets.top;

  const [extraExercises, setExtraExercises] = useState<WorkoutDraftExercise[]>([]);
  const [sets, setSets] = useState<ExerciseSetState>({});
  const [expandedExerciseId, setExpandedExerciseId] = useState<string | null>(null);
  const [restSeconds, setRestSeconds] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [restVisible, setRestVisible] = useState(false);
  const [showRestTimerShell, setShowRestTimerShell] = useState(false);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [notificationState, setNotificationState] = useState<RestTimerNotificationState>(() =>
    Platform.OS === 'web'
      ? getRestTimerNotificationState()
      : { status: 'unsupported', message: '', canEnable: false, enabled: false },
  );
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [showScopeModal, setShowScopeModal] = useState(false);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [showManualExercise, setShowManualExercise] = useState(false);
  const [pendingExerciseScope, setPendingExerciseScope] = useState<AddExerciseScope | null>(null);
  const [progressPressedId, setProgressPressedId] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [manualExerciseName, setManualExerciseName] = useState('');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRestTimerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTimerIdRef = useRef<string | null>(null);
  const activeTimerTitleRef = useRef('');
  const activeTimerBodyRef = useRef('');
  const restEndsAtRef = useRef<number | null>(null);
  const progressButtonScale = useRef(new Animated.Value(1)).current;
  const exerciseCardOpacity = useRef(new Animated.Value(1)).current;
  const exerciseCardTranslateY = useRef(new Animated.Value(0)).current;
  const restTimerOpacity = useRef(new Animated.Value(0)).current;
  const restTimerTranslateY = useRef(new Animated.Value(18)).current;
  const autoAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    restEndsAtRef.current = restEndsAt;
  }, [restEndsAt]);

  const reconcileRestTimer = useCallback((fallbackPersisted = true) => {
    const activeEndsAt = restEndsAtRef.current;

    if (activeEndsAt) {
      const remaining = Math.max(0, Math.ceil((activeEndsAt - Date.now()) / 1000));
      setRestSeconds(remaining);
      setRestRunning(remaining > 0);
      setRestVisible(true);

      if (remaining === 0) {
        setRestEndsAt(null);
        if (hideRestTimerTimeoutRef.current) clearTimeout(hideRestTimerTimeoutRef.current);
        hideRestTimerTimeoutRef.current = setTimeout(() => {
          setRestVisible(false);
          writePersistedRestTimer(null);
        }, 2000);
      }
      return;
    }

    if (!fallbackPersisted || Platform.OS !== 'web' || !dayId) return;
    const persisted = readPersistedRestTimer();
    if (!persisted || persisted.dayId !== dayId) return;

    const remaining = Math.max(0, Math.ceil((persisted.endsAt - Date.now()) / 1000));
    activeTimerIdRef.current = persisted.timerId;
    activeTimerTitleRef.current = persisted.title;
    activeTimerBodyRef.current = persisted.body;
    setRestEndsAt(remaining > 0 ? persisted.endsAt : null);
    setRestSeconds(remaining);
    setRestRunning(remaining > 0);
    setRestVisible(true);

    if (remaining === 0) {
      if (hideRestTimerTimeoutRef.current) clearTimeout(hideRestTimerTimeoutRef.current);
      hideRestTimerTimeoutRef.current = setTimeout(() => {
        setRestVisible(false);
        writePersistedRestTimer(null);
      }, 2000);
    }
  }, [dayId]);

  const syncPersistedRestTimer = useCallback(() => {
    reconcileRestTimer(true);
  }, [reconcileRestTimer]);

  const programExercises = useMemo<SessionExercise[]>(() => (
    slots.map(slot => ({
      id: slot.id,
      sourceType: 'program',
      assignmentId: slot.assignmentId,
      strengthSignalKey: slot.strengthSignalKey,
      exerciseName: slot.exerciseName,
      exerciseSource: slot.exerciseSource,
      catalogExerciseId: slot.catalogExerciseId,
      exerciseImageUrl: slot.exerciseImageUrl ?? null,
      exerciseCategoryName: slot.exerciseCategoryName ?? null,
      muscleGroups: slot.muscleGroups,
      primaryMuscles: slot.primaryMuscles,
      secondaryMuscles: slot.secondaryMuscles,
      prescription: {
        sets: slot.sets,
        repRange: slot.repRange,
        restSeconds: slot.restSeconds,
        failure: slot.failure,
        note: slot.note,
      },
    }))
  ), [slots]);

  const sessionExercises = useMemo<SessionExercise[]>(() => (
    [
      ...programExercises,
      ...extraExercises.map(exercise => ({
        id: exercise.id,
        sourceType: 'temporary' as const,
        assignmentId: exercise.assignmentId,
        strengthSignalKey: exercise.strengthSignalKey ?? null,
        exerciseName: exercise.exerciseName,
        exerciseSource: exercise.exerciseSource,
        catalogExerciseId: exercise.catalogExerciseId,
        exerciseImageUrl: exercise.exerciseImageUrl ?? null,
        exerciseCategoryName: exercise.exerciseCategoryName ?? null,
        muscleGroups: exercise.muscleGroups,
        primaryMuscles: exercise.primaryMuscles ?? [],
        secondaryMuscles: exercise.secondaryMuscles ?? [],
        prescription: exercise.prescription,
      })),
    ]
  ), [extraExercises, programExercises]);

  const persistDraft = useCallback((nextSets: ExerciseSetState, nextExtras: WorkoutDraftExercise[]) => {
    if (!dayId) return;
    const exerciseIds = new Set([
      ...programExercises.map(exercise => exercise.id),
      ...nextExtras.map(exercise => exercise.id),
    ]);
    saveWorkoutDraft(dayId, {
      date: sessionDateKey,
      slots: Object.fromEntries(Object.entries(nextSets).filter(([exerciseId]) => exerciseIds.has(exerciseId))),
      extraExercises: nextExtras,
    });
  }, [dayId, programExercises, saveWorkoutDraft, sessionDateKey]);

  useEffect(() => {
    if (!dayId || !day) {
      setExtraExercises([]);
      setSets({});
      setExpandedExerciseId(null);
      return;
    }

    const draft = getWorkoutDraft(dayId);
    if (draft && draft.date !== sessionDateKey) {
      clearWorkoutDraft(dayId);
    }

    const draftForSession = draft?.date === sessionDateKey ? draft : null;
    const nextExtras = draftForSession?.extraExercises ?? [];
    const nextExercises: SessionExercise[] = [
      ...programExercises,
      ...nextExtras.map(exercise => ({
        id: exercise.id,
        sourceType: 'temporary' as const,
        assignmentId: exercise.assignmentId,
        strengthSignalKey: exercise.strengthSignalKey ?? null,
        exerciseName: exercise.exerciseName,
        exerciseSource: exercise.exerciseSource,
        catalogExerciseId: exercise.catalogExerciseId,
        exerciseImageUrl: exercise.exerciseImageUrl ?? null,
        exerciseCategoryName: exercise.exerciseCategoryName ?? null,
        muscleGroups: exercise.muscleGroups,
        primaryMuscles: exercise.primaryMuscles ?? [],
        secondaryMuscles: exercise.secondaryMuscles ?? [],
        prescription: exercise.prescription,
      })),
    ];
    const nextSets = buildExerciseSetState(nextExercises, draftForSession?.slots);

    setExtraExercises(nextExtras);
    setSets(nextSets);
    setExpandedExerciseId(firstIncompleteExerciseId(nextExercises, nextSets));
  }, [clearWorkoutDraft, day, dayId, getWorkoutDraft, programExercises, sessionDateKey]);

  useEffect(() => {
    if (!expandedExerciseId) return;
    if (!sessionExercises.some(exercise => exercise.id === expandedExerciseId)) {
      setExpandedExerciseId(firstIncompleteExerciseId(sessionExercises, sets));
    }
  }, [expandedExerciseId, sessionExercises, sets]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let mounted = true;
    const syncState = () => {
      if (!mounted) return;
      setNotificationState(getRestTimerNotificationState());
      if (document.visibilityState === 'hidden') return;
      syncPersistedRestTimer();
    };
    void registerRestTimerServiceWorker();
    syncState();
    window.addEventListener('focus', syncState);
    window.addEventListener('pageshow', syncState);
    document.addEventListener('visibilitychange', syncState);
    return () => {
      mounted = false;
      window.removeEventListener('focus', syncState);
      window.removeEventListener('pageshow', syncState);
      document.removeEventListener('visibilitychange', syncState);
    };
  }, [syncPersistedRestTimer]);

  useEffect(() => () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!expandedExerciseId) return;
    exerciseCardOpacity.setValue(0.48);
    exerciseCardTranslateY.setValue(22);
    Animated.parallel([
      Animated.timing(exerciseCardOpacity, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.timing(exerciseCardTranslateY, {
        toValue: 0,
        duration: 520,
        easing: Easing.out(Easing.exp),
        useNativeDriver: true,
      }),
    ]).start();
  }, [exerciseCardOpacity, exerciseCardTranslateY, expandedExerciseId]);

  useEffect(() => {
    if (restVisible) {
      setShowRestTimerShell(true);
      restTimerOpacity.setValue(0);
      restTimerTranslateY.setValue(38);
      Animated.parallel([
        Animated.timing(restTimerOpacity, {
          toValue: 1,
          duration: 460,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(restTimerTranslateY, {
          toValue: 0,
          duration: 460,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (!showRestTimerShell) return;
    Animated.parallel([
      Animated.timing(restTimerOpacity, {
        toValue: 0,
        duration: 340,
        easing: Easing.in(Easing.exp),
        useNativeDriver: true,
      }),
      Animated.timing(restTimerTranslateY, {
        toValue: 30,
        duration: 340,
        easing: Easing.in(Easing.exp),
        useNativeDriver: true,
      }),
    ]).start(() => setShowRestTimerShell(false));
  }, [restTimerOpacity, restTimerTranslateY, restVisible, showRestTimerShell]);

  const scheduleActiveRestNotification = useCallback(async (timerId: string, seconds: number, endsAtMs: number, title: string, body: string) => {
    if (Platform.OS !== 'web' || !dayId || seconds <= 0) return;
    try {
      await scheduleRestTimerNotification({
        timerId,
        dayId,
        route: `/workout/${encodeURIComponent(dayId)}`,
        durationSeconds: seconds,
        scheduledFor: new Date(endsAtMs),
        title,
        body,
      });
      setNotificationState(getRestTimerNotificationState());
    } catch {
      setNotificationState({
        status: 'error',
        message: 'Unable to schedule the background rest alert right now.',
        canEnable: notificationState.canEnable,
        enabled: notificationState.enabled,
      });
    }
  }, [dayId, notificationState.canEnable, notificationState.enabled]);

  const cancelActiveRestNotification = useCallback(async (clearActiveTimer = true) => {
    const timerId = activeTimerIdRef.current;
    if (!timerId) return;
    try {
      await cancelRestTimerNotification(timerId);
    } catch {}
    if (clearActiveTimer) {
      activeTimerIdRef.current = null;
      activeTimerTitleRef.current = '';
      activeTimerBodyRef.current = '';
    }
  }, []);

  useEffect(() => {
    if (!restRunning || !restEndsAt) {
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));
      setRestSeconds(remaining);
      if (remaining > 0) return;
      if (timerRef.current) clearInterval(timerRef.current);
      setRestRunning(false);
      setRestEndsAt(null);
      void cancelActiveRestNotification();
      if (hideRestTimerTimeoutRef.current) clearTimeout(hideRestTimerTimeoutRef.current);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      hideRestTimerTimeoutRef.current = setTimeout(() => {
        setRestVisible(false);
        writePersistedRestTimer(null);
      }, 2000);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cancelActiveRestNotification, restEndsAt, restRunning]);

  const startRest = useCallback((seconds: number, exerciseName: string) => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (hideRestTimerTimeoutRef.current) clearTimeout(hideRestTimerTimeoutRef.current);
    void cancelActiveRestNotification(false);
    const endsAtMs = Date.now() + (seconds * 1000);
    const timerId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const title = `${day?.session ?? 'Workout'} rest complete`;
    const body = `Time for your next ${exerciseName} set.`;
    activeTimerIdRef.current = timerId;
    activeTimerTitleRef.current = title;
    activeTimerBodyRef.current = body;
    setRestSeconds(seconds);
    setRestRunning(true);
    setRestVisible(true);
    setRestEndsAt(endsAtMs);
    writePersistedRestTimer({
      dayId,
      endsAt: endsAtMs,
      timerId,
      title,
      body,
    });
    void scheduleActiveRestNotification(timerId, seconds, endsAtMs, title, body);
  }, [cancelActiveRestNotification, day?.session, dayId, scheduleActiveRestNotification]);

  const stopRest = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (hideRestTimerTimeoutRef.current) clearTimeout(hideRestTimerTimeoutRef.current);
    setRestRunning(false);
    setRestVisible(false);
    setRestSeconds(0);
    setRestEndsAt(null);
    writePersistedRestTimer(null);
    void cancelActiveRestNotification();
  }, [cancelActiveRestNotification]);

  const handleOpenProgress = useCallback((exercise: SessionExercise) => {
    if (exercise.sourceType !== 'program') return;
    setProgressPressedId(exercise.id);
    Animated.sequence([
      Animated.timing(progressButtonScale, {
        toValue: 0.96,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.spring(progressButtonScale, {
        toValue: 1,
        speed: 18,
        bounciness: 7,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setProgressPressedId(null);
      router.push({ pathname: '/progress', params: { slotId: exercise.id } });
    });
    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync();
    }
  }, [progressButtonScale]);

  const adjustRest = useCallback((delta: number) => {
    setRestEndsAt(prev => {
      if (!prev) return prev;
      const nextEndsAt = Math.max(Date.now(), prev + (delta * 1000));
      const nextSeconds = Math.max(0, Math.ceil((nextEndsAt - Date.now()) / 1000));
      setRestSeconds(nextSeconds);
      setRestRunning(nextSeconds > 0);
      setRestVisible(nextSeconds > 0);
      if (nextSeconds === 0) {
        writePersistedRestTimer(null);
        void cancelActiveRestNotification();
      } else if (activeTimerIdRef.current) {
        writePersistedRestTimer({
          dayId,
          endsAt: nextEndsAt,
          timerId: activeTimerIdRef.current,
          title: activeTimerTitleRef.current,
          body: activeTimerBodyRef.current,
        });
        void scheduleActiveRestNotification(
          activeTimerIdRef.current,
          nextSeconds,
          nextEndsAt,
          activeTimerTitleRef.current,
          activeTimerBodyRef.current,
        );
      }
      return nextSeconds === 0 ? null : nextEndsAt;
    });
  }, [cancelActiveRestNotification, dayId, scheduleActiveRestNotification]);

  const handleEnableNotifications = useCallback(async () => {
    if (Platform.OS !== 'web') return;
    setNotificationLoading(true);
    try {
      const nextState = await enableRestTimerNotifications();
      setNotificationState(nextState);
      if (nextState.status === 'ready' && restRunning && restEndsAt && activeTimerIdRef.current) {
        const remaining = Math.max(0, Math.ceil((restEndsAt - Date.now()) / 1000));
        if (remaining > 0) {
          await scheduleActiveRestNotification(
            activeTimerIdRef.current,
            remaining,
            restEndsAt,
            activeTimerTitleRef.current,
            activeTimerBodyRef.current,
          );
        }
      }
    } finally {
      setNotificationLoading(false);
    }
  }, [restEndsAt, restRunning, scheduleActiveRestNotification]);

  const getPrevLastSession = useCallback((exercise: SessionExercise) => {
    const assignmentSessions = getSlotAssignmentSessions(
      { [exercise.id]: getPrevSessions(exercise.id) },
      exercise.id,
      exercise.assignmentId,
    );
    return assignmentSessions[assignmentSessions.length - 1] ?? null;
  }, [getPrevSessions]);

  const getPrescriptionTemplate = useCallback((): SessionPrescriptionSnapshot => {
    const current = sessionExercises.find(exercise => exercise.id === expandedExerciseId);
    const fallback = sessionExercises[sessionExercises.length - 1];
    return { ...(current?.prescription ?? fallback?.prescription ?? DEFAULT_SESSION_PRESCRIPTION), note: '' };
  }, [expandedExerciseId, sessionExercises]);

  const updateSetsAndDraft = useCallback((updater: (current: ExerciseSetState) => ExerciseSetState, nextExtras = extraExercises) => {
    setSets(current => {
      const next = updater(current);
      persistDraft(next, nextExtras);
      return next;
    });
  }, [extraExercises, persistDraft]);

  const handleAddSet = useCallback((exerciseId: string) => {
    updateSetsAndDraft(current => ({
      ...current,
      [exerciseId]: [...(current[exerciseId] ?? []), { weight: '', reps: '', completed: false }],
    }));
    setExpandedExerciseId(exerciseId);
  }, [updateSetsAndDraft]);

  const handleRemoveExtraSet = useCallback((exerciseId: string, setIndex: number) => {
    updateSetsAndDraft(current => ({
      ...current,
      [exerciseId]: (current[exerciseId] ?? []).filter((_, index) => index !== setIndex),
    }));
    setExpandedExerciseId(exerciseId);
  }, [updateSetsAndDraft]);

  const updateSet = useCallback((exerciseId: string, setIndex: number, field: 'weight' | 'reps', value: string) => {
    updateSetsAndDraft(current => {
      const nextRows = [...(current[exerciseId] ?? [])];
      nextRows[setIndex] = { ...nextRows[setIndex], [field]: value };
      return {
        ...current,
        [exerciseId]: nextRows,
      };
    });
    setExpandedExerciseId(exerciseId);
  }, [updateSetsAndDraft]);

  const completeSet = useCallback((exercise: SessionExercise, setIndex: number) => {
    const rows = sets[exercise.id] ?? [];
    const currentRow = rows[setIndex];
    if (!currentRow || (!currentRow.weight && !currentRow.reps && !currentRow.completed)) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    let nextExpandedId: string | null = exercise.id;

    updateSetsAndDraft(current => {
      const nextRows = [...(current[exercise.id] ?? [])];
      const wasCompleted = nextRows[setIndex]?.completed ?? false;
      nextRows[setIndex] = { ...nextRows[setIndex], completed: !wasCompleted };
      const nextState = {
        ...current,
        [exercise.id]: nextRows,
      };

      const justCompletedExercise = !wasCompleted && nextRows.every(row => row.completed);
      if (justCompletedExercise) {
        const currentIndex = sessionExercises.findIndex(item => item.id === exercise.id);
        const nextIncomplete = sessionExercises
          .slice(currentIndex + 1)
          .find(item => !isExerciseComplete(item.id, nextState));
        nextExpandedId = nextIncomplete?.id ?? null;
      } else {
        nextExpandedId = exercise.id;
      }

      return nextState;
    });

    if (nextExpandedId !== exercise.id) {
      Animated.parallel([
        Animated.timing(exerciseCardOpacity, {
          toValue: 0,
          duration: 420,
          easing: Easing.inOut(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(exerciseCardTranslateY, {
          toValue: -18,
          duration: 420,
          easing: Easing.inOut(Easing.exp),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setExpandedExerciseId(null);
      });
      autoAdvanceTimeoutRef.current = setTimeout(() => {
        setExpandedExerciseId(nextExpandedId);
        autoAdvanceTimeoutRef.current = null;
      }, 760);
    } else {
      setExpandedExerciseId(exercise.id);
    }

    if (!currentRow.completed) {
      startRest(exercise.prescription.restSeconds, exercise.exerciseName);
    }
  }, [sessionExercises, sets, startRest, updateSetsAndDraft]);

  const closeExerciseFlows = useCallback(() => {
    setShowScopeModal(false);
    setShowExercisePicker(false);
    setShowManualExercise(false);
    setPendingExerciseScope(null);
    setPickerQuery('');
    setManualExerciseName('');
  }, []);

  const addTemporaryExercise = useCallback((draftExercise: WorkoutDraftExercise) => {
    const nextExtras = [...extraExercises, draftExercise];
    setExtraExercises(nextExtras);
    updateSetsAndDraft(current => ({
      ...current,
      [draftExercise.id]: createSetRows(draftExercise.prescription.sets),
    }), nextExtras);
    setExpandedExerciseId(draftExercise.id);
    closeExerciseFlows();
  }, [closeExerciseFlows, extraExercises, updateSetsAndDraft]);

  const addProgramExercise = useCallback((input: {
    exerciseName: string;
    exerciseSource: 'manual' | 'wger';
    catalogExerciseId: string | number | null;
    primaryMuscles: string[];
    secondaryMuscles: string[];
    muscleGroups: string[];
    exerciseImageUrl?: string | null;
    exerciseCategoryName?: string | null;
  }) => {
    if (!day) return;
    const template = getPrescriptionTemplate();
    const slotId = addSlot(day.id, {
      strengthSignalKey: null,
      exerciseName: input.exerciseName,
      exerciseSource: input.exerciseSource,
      catalogExerciseId: input.catalogExerciseId,
      exerciseImageUrl: input.exerciseImageUrl ?? null,
      exerciseCategoryName: input.exerciseCategoryName ?? null,
      primaryMuscles: input.primaryMuscles,
      secondaryMuscles: input.secondaryMuscles,
      muscleGroups: input.muscleGroups,
      sets: template.sets,
      repRange: template.repRange,
      restSeconds: template.restSeconds,
      failure: template.failure,
      note: template.note,
    });
    updateSetsAndDraft(current => ({
      ...current,
      [slotId]: createSetRows(template.sets),
    }));
    setExpandedExerciseId(slotId);
    closeExerciseFlows();
  }, [addSlot, closeExerciseFlows, day, getPrescriptionTemplate, updateSetsAndDraft]);

  const handlePickCatalogExercise = useCallback((exercise: CatalogExercise) => {
    const template = getPrescriptionTemplate();
    if (pendingExerciseScope === 'session') {
      addTemporaryExercise(makeDraftExerciseFromCatalog(exercise, template));
      return;
    }
    if (pendingExerciseScope === 'program') {
      addProgramExercise({
        exerciseName: exercise.name,
        exerciseSource: 'wger',
        catalogExerciseId: exercise.wgerId,
        exerciseImageUrl: exercise.imageUrls[0] ?? null,
        exerciseCategoryName: exercise.category?.name ?? null,
        primaryMuscles: exercise.mappedPrimaryMuscles,
        secondaryMuscles: exercise.mappedSecondaryMuscles,
        muscleGroups: Array.from(new Set([...exercise.mappedPrimaryMuscles, ...exercise.mappedSecondaryMuscles])),
      });
    }
  }, [addProgramExercise, addTemporaryExercise, getPrescriptionTemplate, pendingExerciseScope]);

  const handleSaveManualExercise = useCallback(() => {
    const name = manualExerciseName.trim();
    if (!name) return;
    const template = getPrescriptionTemplate();
    if (pendingExerciseScope === 'session') {
      addTemporaryExercise(makeDraftExerciseFromManual(name, template));
      return;
    }
    if (pendingExerciseScope === 'program') {
      addProgramExercise({
        exerciseName: name,
        exerciseSource: 'manual',
        catalogExerciseId: null,
        primaryMuscles: [],
        secondaryMuscles: [],
        muscleGroups: [],
        exerciseImageUrl: null,
        exerciseCategoryName: null,
      });
    }
  }, [addProgramExercise, addTemporaryExercise, getPrescriptionTemplate, manualExerciseName, pendingExerciseScope]);

  const searchResults = useMemo(() => (
    searchCatalog({ query: pickerQuery, categoryIds: [], muscleIds: [], equipmentIds: [] }).slice(0, 60)
  ), [pickerQuery, searchCatalog]);

  const getTotals = useCallback(() => {
    let totalSets = 0;
    let totalVolume = 0;
    let completedExercises = 0;
    sessionExercises.forEach(exercise => {
      const rows = sets[exercise.id] ?? [];
      totalSets += rows.filter(row => row.weight || row.reps).length;
      totalVolume += getPerformedVolume(rows);
      if (isExerciseComplete(exercise.id, sets)) completedExercises += 1;
    });
    return { totalSets, totalVolume, completedExercises };
  }, [sessionExercises, sets]);

  const confirmFinish = useCallback(() => {
    if (!dayId || !day) return;
    const dateKey = sessionDateKey;
    const sessionLogs: LoggedSlotSessionInput[] = sessionExercises.flatMap(exercise => {
      const loggedSets = (sets[exercise.id] ?? [])
        .map(row => ({
          weight: parseFloat(row.weight) || 0,
          reps: parseInt(row.reps, 10) || 0,
        }))
        .filter(row => row.weight > 0 || row.reps > 0);

      if (loggedSets.length === 0) return [];

      return [{
        slotId: exercise.id,
        assignmentId: exercise.assignmentId,
        strengthSignalKey: exercise.strengthSignalKey ?? null,
        dayName: day.name,
        sessionLabel: day.session,
        catalogExerciseId: exercise.catalogExerciseId,
        exerciseSource: exercise.exerciseSource,
        exerciseName: exercise.exerciseName,
        muscleGroups: exercise.muscleGroups,
        primaryMuscles: exercise.primaryMuscles,
        secondaryMuscles: exercise.secondaryMuscles,
        prescription: exercise.prescription,
        sets: loggedSets,
      }];
    });

    if (sessionLogs.length > 0) {
      logWorkout(dayId, sessionLogs, dateKey);
    }
    void cancelActiveRestNotification();
    clearWorkoutDraft(dayId);
    markCompleted(dateKey, dayId);
    setShowFinishModal(false);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => router.back(), 400);
  }, [cancelActiveRestNotification, clearWorkoutDraft, day, dayId, logWorkout, markCompleted, sessionDateKey, sessionExercises, sets]);

  if (!day) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Workout not found</Text>
      </View>
    );
  }

  if (day.rest) {
    return (
      <View testID="workout-screen" style={[styles.container, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Feather name="arrow-left" size={18} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTag}>{day.name}</Text>
            <Text style={styles.headerTitle}>{day.session}</Text>
          </View>
        </View>
        <View style={styles.center}>
          <Feather name="moon" size={34} color={Colors.orange} />
          <Text style={styles.emptyTitle}>Rest day</Text>
          <Text style={styles.emptySub}>This day is marked as rest in your active program.</Text>
        </View>
      </View>
    );
  }

  const { totalSets, totalVolume, completedExercises } = getTotals();
  const progressText = `${completedExercises}/${sessionExercises.length} exercises complete`;

  return (
    <View testID="workout-screen" style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTag}>{day.name}</Text>
          <Text style={styles.headerTitle}>{day.session}</Text>
        </View>
        <TouchableOpacity style={styles.finishBtn} onPress={() => setShowFinishModal(true)}>
          <Text style={styles.finishBtnText}>Finish</Text>
        </TouchableOpacity>
      </View>

      {isDeloadWeek ? (
        <View style={styles.deloadBanner}>
          <Feather name="battery-charging" size={16} color={Colors.orange} />
          <View style={{ flex: 1 }}>
            <Text style={styles.deloadBannerTitle}>Deload week active</Text>
            <Text style={styles.deloadBannerText}>Use 50-60% of your normal weight and keep technique crisp.</Text>
          </View>
        </View>
      ) : null}

      {sessionExercises.length === 0 ? (
        <View style={styles.center}>
          <Feather name="inbox" size={34} color={Colors.text3} />
          <Text style={styles.emptyTitle}>No exercises yet</Text>
          <Text style={styles.emptySub}>Add exercises to this day in Programs, then come back here to train it.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: 240, paddingTop: 12 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.progressStrip}>
            <Text style={styles.progressStripTitle}>{progressText}</Text>
            <Text style={styles.progressStripMeta}>{totalSets} sets logged</Text>
          </View>

          {!!day.protocol ? (
            <View style={styles.protocolBanner}>
              <Text style={styles.protocolLabel}>Session intent</Text>
              <Text style={styles.protocolText}>{day.protocol}</Text>
            </View>
          ) : null}

          {sessionExercises.map((exercise, index) => {
            const rows = sets[exercise.id] ?? [];
            const isComplete = isExerciseComplete(exercise.id, sets);
            const isExpanded = expandedExerciseId === exercise.id;
            const lastSession = getPrevLastSession(exercise);
            const assignmentSessions = exercise.sourceType === 'program'
              ? getSlotAssignmentSessions({ [exercise.id]: getPrevSessions(exercise.id) }, exercise.id, exercise.assignmentId)
              : [];
            const recommendation = exercise.sourceType === 'program'
              ? getSlotProgressionRecommendation({
                id: exercise.id,
                dayId: day.id,
                sortOrder: index,
                assignmentId: exercise.assignmentId,
                strengthSignalKey: exercise.strengthSignalKey ?? null,
                progressionMode: 'double_progression',
                loadStep: 5,
                minSessionsBeforeStall: 3,
                stallThreshold: 3,
                deloadFactor: 0.9,
                exerciseName: exercise.exerciseName,
                catalogExerciseId: exercise.catalogExerciseId,
                exerciseSource: exercise.exerciseSource,
                exerciseImageUrl: exercise.exerciseImageUrl ?? null,
                exerciseCategoryName: exercise.exerciseCategoryName ?? null,
                primaryMuscles: exercise.primaryMuscles,
                secondaryMuscles: exercise.secondaryMuscles,
                sets: exercise.prescription.sets,
                repRange: exercise.prescription.repRange,
                restSeconds: exercise.prescription.restSeconds,
                failure: exercise.prescription.failure,
                note: exercise.prescription.note,
                muscleGroups: exercise.muscleGroups,
              }, assignmentSessions)
              : null;
            const progressionVisuals = getProgressionVisuals(recommendation);
            const completedSetCount = rows.filter(row => row.completed).length;
            const loggedSetCount = getLoggedSetCount(rows);
            const extraCount = Math.max(0, rows.length - exercise.prescription.sets);

            if (!isExpanded) {
              return (
                <TouchableOpacity
                  key={exercise.id}
                  style={[styles.collapsedCard, isComplete ? styles.collapsedCardDone : styles.collapsedCardUpcoming]}
                  activeOpacity={0.9}
                  onPress={() => setExpandedExerciseId(exercise.id)}
                >
                  <View style={styles.collapsedMain}>
                    <View style={styles.collapsedHeader}>
                      <Text style={styles.collapsedIndex}>{isComplete ? 'Done' : `Exercise ${index + 1}`}</Text>
                      <View style={styles.collapsedBadges}>
                        {exercise.sourceType === 'temporary' ? (
                          <View style={styles.summaryPill}>
                            <Text style={styles.summaryPillText}>Session only</Text>
                          </View>
                        ) : null}
                        {isComplete ? (
                          <View style={[styles.summaryPill, styles.summaryPillDone]}>
                            <Text style={[styles.summaryPillText, styles.summaryPillDoneText]}>Complete</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Text style={styles.collapsedTitle}>{exercise.exerciseName}</Text>
                    <Text style={styles.collapsedMeta}>
                      {exercise.prescription.sets} sets | {getRepRangeLabel(exercise.prescription.repRange)} | {exercise.prescription.restSeconds}s rest
                    </Text>
                    {isComplete ? (
                      <Text style={styles.collapsedSummary}>
                        Best {getBestSetLabel(rows)} | {loggedSetCount} logged sets | {getPerformedVolume(rows).toLocaleString()} lbs volume
                      </Text>
                    ) : (
                      <Text style={styles.collapsedSummary}>
                        {completedSetCount}/{rows.length} sets complete
                      </Text>
                    )}
                  </View>
                  <Feather name="chevron-down" size={18} color={Colors.text3} />
                </TouchableOpacity>
              );
            }

            return (
              <Animated.View
                key={exercise.id}
                style={[
                  styles.exCard,
                  exercise.prescription.failure ? styles.exCardFailure : styles.exCardRIR,
                  { opacity: exerciseCardOpacity, transform: [{ translateY: exerciseCardTranslateY }] },
                ]}
              >
                <View style={styles.exHeader}>
                  <View style={styles.exHeaderMain}>
                    {exercise.exerciseImageUrl ? (
                      <Image source={{ uri: exercise.exerciseImageUrl }} style={styles.exThumb} contentFit="cover" />
                    ) : (
                      <View style={styles.exThumbFallback}>
                        <Feather name="activity" size={18} color={Colors.text3} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={styles.exTitleRow}>
                        <Text style={styles.exName}>{exercise.exerciseName}</Text>
                        {exercise.sourceType === 'temporary' ? (
                          <View style={styles.summaryPill}>
                            <Text style={styles.summaryPillText}>Session only</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.exCategory}>
                        {exercise.exerciseCategoryName ?? getEffortLabel(exercise.prescription.failure)}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.collapseBtn} onPress={() => setExpandedExerciseId(null)}>
                    <Feather name="chevron-up" size={18} color={Colors.text2} />
                  </TouchableOpacity>
                </View>

                <View style={styles.exPrescriptionRow}>
                  <View style={styles.metricPill}>
                    <Text style={styles.metricPillLabel}>Sets</Text>
                    <Text style={styles.metricPillValue}>{exercise.prescription.sets}</Text>
                  </View>
                  <View style={styles.metricPill}>
                    <Text style={styles.metricPillLabel}>Target</Text>
                    <Text style={styles.metricPillValue}>{getRepRangeLabel(exercise.prescription.repRange)}</Text>
                  </View>
                  <View style={styles.metricPill}>
                    <Text style={styles.metricPillLabel}>Rest</Text>
                    <Text style={styles.metricPillValue}>{exercise.prescription.restSeconds}s</Text>
                  </View>
                </View>

                {!!exercise.prescription.note ? (
                  <View style={styles.noteBanner}>
                    <Feather name="zap" size={11} color={Colors.text3} />
                    <View style={styles.noteCopy}>
                      <Text style={styles.noteLabel}>Coaching cue</Text>
                      <Text style={styles.noteText}>{exercise.prescription.note}</Text>
                    </View>
                  </View>
                ) : null}

                <View style={[styles.progressionCard, { borderColor: progressionVisuals.borderColor, backgroundColor: progressionVisuals.backgroundColor }]}>
                  <Text style={[styles.progressionEyebrow, { color: progressionVisuals.textColor }]}>
                    {exercise.sourceType === 'temporary' ? 'Session add-on' : progressionVisuals.eyebrow}
                  </Text>
                  <View style={styles.progressionHeader}>
                    <Feather name={exercise.sourceType === 'temporary' ? 'plus-circle' : progressionVisuals.icon} size={16} color={progressionVisuals.textColor} />
                    <Text style={[styles.progressionTitle, { color: progressionVisuals.textColor }]}>
                      {exercise.sourceType === 'temporary' ? 'Extra work for today' : progressionVisuals.title}
                    </Text>
                  </View>
                  <Text style={styles.progressionBody}>
                    {exercise.sourceType === 'temporary'
                      ? 'This exercise lives in today’s session flow and can be logged like any other exercise.'
                      : recommendation?.reason ?? 'No usable history for this assignment yet. Log today to establish your baseline.'}
                  </Text>
                  {exercise.sourceType === 'program' ? (
                    <View style={styles.progressionActionsRow}>
                      <Animated.View style={progressPressedId === exercise.id ? { transform: [{ scale: progressButtonScale }] } : undefined}>
                        <TouchableOpacity style={styles.progressJumpBtn} onPress={() => handleOpenProgress(exercise)} activeOpacity={0.9}>
                          <Feather name="trending-up" size={13} color={progressionVisuals.textColor} />
                          <Text style={[styles.progressJumpText, { color: progressionVisuals.textColor }]}>See progress</Text>
                          <Feather name="arrow-right" size={13} color={progressionVisuals.textColor} />
                        </TouchableOpacity>
                      </Animated.View>
                    </View>
                  ) : null}
                </View>

                <View style={styles.setsCard}>
                  <View style={styles.setsHeader}>
                    <Text style={styles.setHeaderNum}>#</Text>
                    <Text style={[styles.setHeaderText, { flex: 1 }]}>Weight</Text>
                    <Text style={[styles.setHeaderText, { flex: 1 }]}>Reps</Text>
                    <View style={styles.logBtnSpacer} />
                  </View>

                  {rows.map((set, setIndex) => {
                    const prevWeight = lastSession?.sets[setIndex]?.weight;
                    const prevReps = lastSession?.sets[setIndex]?.reps;
                    const weightPlaceholder = formatWeight(prevWeight ?? null) ?? 'lbs';
                    const isExtraSet = setIndex >= exercise.prescription.sets;

                    return (
                      <View key={`${exercise.id}-${setIndex}`} style={[styles.setRow, set.completed && styles.setRowDone]}>
                        <View style={styles.setIndexWrap}>
                          <Text style={styles.setNum}>{setIndex + 1}</Text>
                          {isExtraSet ? <Text style={styles.extraSetTag}>Extra</Text> : null}
                        </View>
                        <View style={styles.setEntryMain}>
                          <TextInput
                            style={[styles.setInput, styles.weightInput, !set.weight && styles.setInputPlaceholder]}
                            value={set.weight}
                            onChangeText={value => updateSet(exercise.id, setIndex, 'weight', value)}
                            placeholder={weightPlaceholder}
                            placeholderTextColor={Colors.text3}
                            keyboardType="decimal-pad"
                          />
                          <TextInput
                            style={[styles.setInput, styles.repsInput, !set.reps && styles.setInputPlaceholder]}
                            value={set.reps}
                            onChangeText={value => updateSet(exercise.id, setIndex, 'reps', value)}
                            placeholder={prevReps ? `${prevReps}` : 'reps'}
                            placeholderTextColor={Colors.text3}
                            keyboardType="number-pad"
                          />
                          <TouchableOpacity style={[styles.logBtn, set.completed && styles.logBtnDone]} onPress={() => completeSet(exercise, setIndex)}>
                            {set.completed ? (
                              <>
                                <Feather name="check" size={15} color="#081109" />
                                <Text style={styles.logBtnDoneText}>Done</Text>
                              </>
                            ) : (
                              <Text style={styles.logBtnText}>Log</Text>
                            )}
                          </TouchableOpacity>
                          {isExtraSet ? (
                            <TouchableOpacity style={styles.removeSetBtn} onPress={() => handleRemoveExtraSet(exercise.id, setIndex)}>
                              <Feather name="x" size={14} color={Colors.text2} />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}

                  <View style={styles.exerciseActionsRow}>
                    <TouchableOpacity style={styles.inlineActionBtn} onPress={() => handleAddSet(exercise.id)}>
                      <Feather name="plus" size={14} color={Colors.text2} />
                      <Text style={styles.inlineActionText}>Add Set</Text>
                    </TouchableOpacity>
                  </View>

                  {extraCount > 0 ? (
                    <Text style={styles.extraSetHint}>{extraCount} extra set{extraCount === 1 ? '' : 's'} added for this session.</Text>
                  ) : null}
                </View>
              </Animated.View>
            );
          })}

          <TouchableOpacity style={styles.addExerciseCard} onPress={() => setShowScopeModal(true)} activeOpacity={0.9}>
            <View style={styles.addExerciseIcon}>
              <Feather name="plus" size={18} color="#12161d" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.addExerciseTitle}>Add Exercise</Text>
              <Text style={styles.addExerciseText}>Need extra work today? Add a one-off exercise or save one back to this day.</Text>
            </View>
            <Feather name="chevron-right" size={18} color={Colors.text3} />
          </TouchableOpacity>
        </ScrollView>
      )}

      {showRestTimerShell ? (
        <Animated.View
          style={[
            styles.restTimer,
            {
              bottom: insets.bottom + 20,
              opacity: restTimerOpacity,
              transform: [{ translateY: restTimerTranslateY }],
            },
          ]}
        >
          <Text style={styles.restEyebrow}>Rest timer</Text>
          <View style={styles.restTimerMain}>
            <View style={styles.restInfo}>
              <Text style={[styles.restTime, restSeconds === 0 ? styles.restTimeDone : restSeconds <= 15 ? styles.restTimeWarning : undefined]}>
                {restSeconds === 0 ? 'Go!' : `${Math.floor(restSeconds / 60)}:${(restSeconds % 60).toString().padStart(2, '0')}`}
              </Text>
              <Text style={styles.restHint}>{restSeconds === 0 ? 'Time for the next set.' : 'Use this time to reset and set up.'}</Text>
            </View>
            <View style={styles.restBtns}>
              <TouchableOpacity style={styles.restBtn} onPress={() => adjustRest(-30)}>
                <Text style={styles.restBtnText}>-30s</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.restBtn} onPress={() => adjustRest(30)}>
                <Text style={styles.restBtnText}>+30s</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.restBtn, styles.restBtnSkip]} onPress={stopRest}>
                <Text style={[styles.restBtnText, styles.skipText]}>Skip</Text>
              </TouchableOpacity>
            </View>
          </View>
          {Platform.OS === 'web' && notificationState.message ? (
            <View style={styles.notificationBanner}>
              <Text style={styles.notificationBannerText}>{notificationState.message}</Text>
              {notificationState.canEnable ? (
                <TouchableOpacity
                  style={[styles.notificationBannerBtn, notificationLoading && styles.notificationBannerBtnDisabled]}
                  onPress={handleEnableNotifications}
                  disabled={notificationLoading}
                >
                  <Text style={styles.notificationBannerBtnText}>{notificationLoading ? 'Enabling...' : 'Enable Alerts'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      <Modal visible={showScopeModal} transparent animationType="fade" onRequestClose={closeExerciseFlows}>
        <View style={styles.modalOverlay}>
          <View style={styles.choiceModal}>
            <Text style={styles.modalEyebrow}>Add exercise</Text>
            <Text style={styles.modalTitle}>How should this change apply?</Text>
            <TouchableOpacity
              style={styles.choiceButton}
              onPress={() => {
                setPendingExerciseScope('session');
                setShowScopeModal(false);
                setShowExercisePicker(true);
              }}
            >
              <Text style={styles.choiceTitle}>This session only</Text>
              <Text style={styles.choiceText}>Add extra work for today without changing the program.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.choiceButton}
              onPress={() => {
                setPendingExerciseScope('program');
                setShowScopeModal(false);
                setShowExercisePicker(true);
              }}
            >
              <Text style={styles.choiceTitle}>Add to this day permanently</Text>
              <Text style={styles.choiceText}>Save the exercise back to the day so it appears in future workouts too.</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnSecondary} onPress={closeExerciseFlows}>
              <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showExercisePicker} animationType="slide" onRequestClose={closeExerciseFlows}>
        <View style={[styles.container, { paddingTop: topPad }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={closeExerciseFlows}>
              <Feather name="arrow-left" size={18} color={Colors.text} />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.headerTag}>Exercise picker</Text>
              <Text style={styles.headerTitle}>Choose exercise</Text>
            </View>
            <TouchableOpacity style={styles.finishBtn} onPress={() => void refreshCatalog({ force: true })}>
              <Text style={styles.finishBtnText}>{catalogState.sync.status === 'syncing' ? 'Syncing' : 'Refresh'}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 120, paddingTop: 12 }} keyboardShouldPersistTaps="handled">
            <View style={styles.protocolBanner}>
              <Text style={styles.protocolLabel}>Search</Text>
              <TextInput
                style={styles.searchInput}
                value={pickerQuery}
                onChangeText={setPickerQuery}
                placeholder="Bench press, incline cable, rear delt..."
                placeholderTextColor={Colors.text3}
              />
              <Text style={styles.protocolText}>Search by name, alias, muscle, or equipment. Manual entry is available too.</Text>
            </View>

            <TouchableOpacity
              style={styles.addExerciseCard}
              onPress={() => {
                setShowExercisePicker(false);
                setShowManualExercise(true);
              }}
            >
              <View style={styles.addExerciseIcon}>
                <Feather name="edit-3" size={18} color="#12161d" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.addExerciseTitle}>Use manual exercise</Text>
                <Text style={styles.addExerciseText}>Type a custom exercise name if it is not in the catalog.</Text>
              </View>
            </TouchableOpacity>

            {searchResults.length === 0 ? (
              <View style={styles.emptyPickerState}>
                <Text style={styles.emptyTitle}>No matches yet</Text>
                <Text style={styles.emptySub}>Try a shorter search or a broader muscle or equipment term.</Text>
              </View>
            ) : (
              searchResults.map(exercise => (
                <TouchableOpacity key={exercise.wgerId} style={styles.pickerResultCard} onPress={() => handlePickCatalogExercise(exercise)} activeOpacity={0.9}>
                  {exercise.imageUrls[0] ? (
                    <Image source={{ uri: exercise.imageUrls[0] }} style={styles.exThumb} contentFit="cover" />
                  ) : (
                    <View style={styles.exThumbFallback}>
                      <Feather name="image" size={18} color={Colors.text3} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exName}>{exercise.name}</Text>
                    <Text style={styles.exCategory}>
                      {[exercise.category?.name, exercise.equipment.map(item => item.name).join(', ')].filter(Boolean).join(' | ')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showManualExercise} transparent animationType="fade" onRequestClose={closeExerciseFlows}>
        <View style={styles.modalOverlay}>
          <View style={styles.choiceModal}>
            <Text style={styles.modalEyebrow}>Manual exercise</Text>
            <Text style={styles.modalTitle}>Name the exercise</Text>
            <TextInput
              style={styles.manualInput}
              value={manualExerciseName}
              onChangeText={setManualExerciseName}
              placeholder="Cable lateral raise"
              placeholderTextColor={Colors.text3}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnSecondary} onPress={closeExerciseFlows}>
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleSaveManualExercise}>
                <Text style={styles.modalBtnPrimaryText}>Add Exercise</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showFinishModal} transparent animationType="fade" onRequestClose={() => setShowFinishModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalEyebrow}>Session complete</Text>
            <Text style={styles.modalTitle}>Workout done</Text>
            <Text style={styles.modalSub}>{day.session} / {day.tag}</Text>
            <View style={styles.modalStats}>
              {[
                { label: 'Sets Logged', val: totalSets.toString() },
                { label: 'Exercises', val: completedExercises.toString() },
                { label: 'Volume', val: `${Math.round(totalVolume).toLocaleString()} lbs` },
                { label: 'Day', val: day.label },
              ].map(stat => (
                <View key={stat.label} style={styles.modalStat}>
                  <Text style={styles.modalStatLabel}>{stat.label}</Text>
                  <Text style={styles.modalStatVal}>{stat.val}</Text>
                </View>
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setShowFinishModal(false)}>
                <Text style={styles.modalBtnSecondaryText}>Keep Editing</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnPrimary} onPress={confirmFinish}>
                <Text style={styles.modalBtnPrimaryText}>Save and Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  errorText: { fontFamily: 'Inter_400Regular', fontSize: 16, color: Colors.text2, textAlign: 'center', marginTop: 100 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, color: Colors.text, textAlign: 'center' },
  emptySub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: Colors.text2, textAlign: 'center', lineHeight: 20 },
  emptyPickerState: {
    marginHorizontal: 14,
    marginTop: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 18,
    gap: 8,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border2,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: { flex: 1, gap: 2 },
  headerTag: { fontFamily: 'Inter_500Medium', fontSize: 10, color: Colors.text3, letterSpacing: 2.2, textTransform: 'uppercase' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, color: Colors.text, lineHeight: 28 },
  finishBtn: {
    minHeight: 44,
    backgroundColor: Colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishBtnText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#000', letterSpacing: 1.1, textTransform: 'uppercase' },
  deloadBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.warningBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.warningBorder,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  deloadBannerTitle: { fontFamily: 'Inter_700Bold', fontSize: 12, color: Colors.orange, textTransform: 'uppercase', letterSpacing: 1 },
  deloadBannerText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.text2, lineHeight: 18, marginTop: 2 },
  scroll: { flex: 1 },
  progressStrip: {
    marginHorizontal: 14,
    marginBottom: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  progressStripTitle: { fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.text },
  progressStripMeta: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.text2 },
  protocolBanner: {
    marginHorizontal: 14,
    marginBottom: 14,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 16,
  },
  protocolLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: Colors.text3, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 },
  protocolText: { fontFamily: 'Inter_500Medium', fontSize: 14, color: Colors.text2, lineHeight: 21 },
  collapsedCard: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  collapsedCardUpcoming: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  collapsedCardDone: {
    backgroundColor: Colors.successBg,
    borderColor: Colors.successBorder,
  },
  collapsedMain: { flex: 1, gap: 6 },
  collapsedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  collapsedIndex: { fontFamily: 'Inter_700Bold', fontSize: 11, color: Colors.text3, textTransform: 'uppercase', letterSpacing: 1.2 },
  collapsedBadges: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  collapsedTitle: { fontFamily: 'Inter_700Bold', fontSize: 19, color: Colors.text, lineHeight: 24 },
  collapsedMeta: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.text2 },
  collapsedSummary: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.text3, lineHeight: 19 },
  summaryPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border2,
  },
  summaryPillText: { fontFamily: 'Inter_700Bold', fontSize: 10, color: Colors.text2, textTransform: 'uppercase', letterSpacing: 0.8 },
  summaryPillDone: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  summaryPillDoneText: { color: '#10150b' },
  exCard: {
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: Colors.surface,
    padding: 16,
    gap: 14,
  },
  exCardFailure: { borderColor: Colors.warningBorder },
  exCardRIR: { borderColor: Colors.border2 },
  exHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  exHeaderMain: { flex: 1, flexDirection: 'row', gap: 12 },
  exThumb: { width: 58, height: 58, borderRadius: 16, backgroundColor: Colors.surface3 },
  exThumbFallback: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  exName: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 20, color: Colors.text, lineHeight: 24 },
  exCategory: { marginTop: 4, fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.text2, lineHeight: 19 },
  collapseBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  exPrescriptionRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  metricPill: {
    minWidth: 90,
    flex: 1,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  metricPillLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: Colors.text3, textTransform: 'uppercase', letterSpacing: 1.1 },
  metricPillValue: { fontFamily: 'Inter_700Bold', fontSize: 13, color: Colors.text },
  noteBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  noteCopy: { flex: 1, gap: 2 },
  noteLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, color: Colors.text3, textTransform: 'uppercase', letterSpacing: 0.9 },
  noteText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.text2, lineHeight: 17 },
  progressionCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 8,
  },
  progressionEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  progressionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressionTitle: { flex: 1, fontFamily: 'Inter_700Bold', fontSize: 15, lineHeight: 20 },
  progressionBody: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.text2, lineHeight: 19 },
  progressionActionsRow: { paddingTop: 2, alignItems: 'flex-start' },
  progressJumpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  progressJumpText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  setsCard: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 14,
    gap: 12,
  },
  setsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setHeaderNum: { width: 36, fontFamily: 'Inter_700Bold', fontSize: 11, color: Colors.text3, textTransform: 'uppercase', letterSpacing: 1 },
  setHeaderText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: Colors.text3, textTransform: 'uppercase', letterSpacing: 1 },
  logBtnSpacer: { width: 72 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setRowDone: {
    backgroundColor: Colors.successBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.successBorder,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  setIndexWrap: { width: 26, alignItems: 'center', gap: 4 },
  setEntryMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  setNum: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text },
  extraSetTag: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: Colors.blue,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },
  setInput: {
    minWidth: 0,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border2,
    paddingHorizontal: 12,
    paddingVertical: 0,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 18,
    color: Colors.text,
    textAlign: 'center',
  },
  setInputPlaceholder: {},
  weightInput: { flex: 1.15 },
  repsInput: { flex: 0.95 },
  logBtn: {
    width: 62,
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    flexDirection: 'row',
    gap: 4,
  },
  logBtnText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#081109', textTransform: 'uppercase', letterSpacing: 0.7 },
  logBtnDone: { backgroundColor: Colors.green },
  logBtnDoneText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: '#081109', textTransform: 'uppercase', letterSpacing: 0.6 },
  removeSetBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  inlineActionBtn: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: Colors.text2 },
  extraSetHint: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.text3, lineHeight: 18 },
  addExerciseCard: {
    marginHorizontal: 14,
    marginTop: 4,
    borderRadius: 22,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  addExerciseIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addExerciseTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text },
  addExerciseText: { marginTop: 3, fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.text2, lineHeight: 19 },
  restTimer: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border2,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  restEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, color: Colors.text3, textTransform: 'uppercase', letterSpacing: 1.6 },
  restTimerMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  restInfo: { flex: 1, gap: 4 },
  restTime: { fontFamily: 'Inter_700Bold', fontSize: 34, color: Colors.text, lineHeight: 38 },
  restTimeWarning: { color: Colors.orange },
  restTimeDone: { color: Colors.green },
  restHint: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.text2 },
  restBtns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  restBtn: {
    minHeight: 40,
    minWidth: 68,
    borderRadius: 12,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  restBtnText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: Colors.text2, textTransform: 'uppercase', letterSpacing: 0.7 },
  restBtnSkip: { backgroundColor: Colors.accentBg, borderColor: Colors.accentDim },
  skipText: { color: Colors.accent },
  notificationBanner: {
    backgroundColor: Colors.surface2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 10,
  },
  notificationBannerText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: Colors.text2, lineHeight: 18 },
  notificationBannerBtn: {
    minHeight: 38,
    alignSelf: 'flex-start',
    borderRadius: 12,
    backgroundColor: Colors.accent,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  notificationBannerBtnDisabled: { opacity: 0.65 },
  notificationBannerBtnText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: '#091109', textTransform: 'uppercase', letterSpacing: 0.8 },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modal: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border2,
    padding: 20,
    gap: 14,
  },
  choiceModal: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border2,
    padding: 20,
    gap: 12,
  },
  modalEyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, color: Colors.text3, textTransform: 'uppercase', letterSpacing: 1.7 },
  modalTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, color: Colors.text, lineHeight: 28 },
  modalSub: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.text2 },
  modalStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  modalStat: {
    width: '47%',
    backgroundColor: Colors.surface2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    gap: 4,
  },
  modalStatLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, color: Colors.text3, textTransform: 'uppercase', letterSpacing: 1 },
  modalStatVal: { fontFamily: 'Inter_700Bold', fontSize: 15, color: Colors.text },
  modalActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  modalBtnSecondary: {
    minHeight: 46,
    flex: 1,
    borderRadius: 14,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border2,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnSecondaryText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: Colors.text2, textTransform: 'uppercase', letterSpacing: 0.8 },
  modalBtnPrimary: {
    minHeight: 46,
    flex: 1,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnPrimaryText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#081109', textTransform: 'uppercase', letterSpacing: 0.8 },
  choiceButton: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  choiceTitle: { fontFamily: 'Inter_700Bold', fontSize: 16, color: Colors.text },
  choiceText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: Colors.text2, lineHeight: 19 },
  searchInput: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border2,
    paddingHorizontal: 14,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.text,
    marginBottom: 12,
  },
  pickerResultCard: {
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  manualInput: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border2,
    paddingHorizontal: 14,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: Colors.text,
  },
});
