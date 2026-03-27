import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { DAYS } from '@/constants/workoutData';
import { useWorkout } from '@/context/WorkoutContext';
import type { DraftSetLog, SetLog } from '@/context/WorkoutContext';
import { formatLocalDateKey } from '@/lib/date';
import {
  cancelRestTimerNotification,
  enableRestTimerNotifications,
  getRestTimerNotificationState,
  registerRestTimerServiceWorker,
  scheduleRestTimerNotification,
  type RestTimerNotificationState,
} from '@/lib/restTimerNotifications';


interface SetState {
  weight: string;
  reps: string;
  completed: boolean;
}

function createEmptySets(
  exercises: typeof DAYS[number]['exercises'] | undefined,
): SetState[][] {
  return (exercises ?? []).map(ex =>
    Array.from({ length: ex.sets }, () => ({ weight: '', reps: '', completed: false }))
  );
}

function normalizeDraftSets(
  exercises: typeof DAYS[number]['exercises'] | undefined,
  draftSets?: DraftSetLog[][],
): SetState[][] {
  return (exercises ?? []).map((ex, exIdx) =>
    Array.from({ length: ex.sets }, (_, setIdx) => {
      const existing = draftSets?.[exIdx]?.[setIdx];
      return {
        weight: existing?.weight ?? '',
        reps: existing?.reps ?? '',
        completed: existing?.completed ?? false,
      };
    })
  );
}

export default function WorkoutScreen() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const insets = useSafeAreaInsets();
  const {
    getPrevSessions,
    getWorkoutDraft,
    saveWorkoutDraft,
    clearWorkoutDraft,
    logWorkout,
    markCompleted,
    isDeloadWeek,
  } = useWorkout();

  const day = DAYS.find(d => d.id === dayId);
  const exercises = day?.exercises ?? [];
  const todayKey = formatLocalDateKey();

  const [sets, setSets] = useState<SetState[][]>(() => {
    if (!dayId) return createEmptySets(exercises);
    const draft = getWorkoutDraft(dayId);
    if (draft?.date === todayKey) {
      return normalizeDraftSets(exercises, draft.exercises);
    }
    return createEmptySets(exercises);
  });

  const [restSeconds, setRestSeconds] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [restVisible, setRestVisible] = useState(false);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [notificationState, setNotificationState] = useState<RestTimerNotificationState>(() => (
    Platform.OS === 'web'
      ? getRestTimerNotificationState()
      : {
          status: 'unsupported',
          message: '',
          canEnable: false,
          enabled: false,
        }
  ));
  const [notificationLoading, setNotificationLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRestTimerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTimerIdRef = useRef<string | null>(null);
  const activeTimerTitleRef = useRef<string>('');
  const activeTimerBodyRef = useRef<string>('');

  const [showFinishModal, setShowFinishModal] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  useEffect(() => {
    if (!dayId) {
      setSets(createEmptySets(exercises));
      return;
    }

    const draft = getWorkoutDraft(dayId);
    if (draft?.date === todayKey) {
      setSets(normalizeDraftSets(exercises, draft.exercises));
      return;
    }

    if (draft && draft.date !== todayKey) {
      clearWorkoutDraft(dayId);
    }

    setSets(createEmptySets(exercises));
  }, [clearWorkoutDraft, dayId, exercises, getWorkoutDraft, todayKey]);

  const persistDraft = useCallback((nextSets: SetState[][]) => {
    if (!dayId) return;
    saveWorkoutDraft(dayId, {
      date: todayKey,
      exercises: nextSets,
    });
  }, [dayId, saveWorkoutDraft, todayKey]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let mounted = true;
    const syncState = () => {
      if (mounted) {
        setNotificationState(getRestTimerNotificationState());
      }
    };

    void registerRestTimerServiceWorker();
    syncState();

    window.addEventListener('focus', syncState);
    document.addEventListener('visibilitychange', syncState);

    return () => {
      mounted = false;
      window.removeEventListener('focus', syncState);
      document.removeEventListener('visibilitychange', syncState);
    };
  }, []);

  const scheduleActiveRestNotification = useCallback(async (
    timerId: string,
    seconds: number,
    endsAtMs: number,
    title: string,
    body: string,
  ) => {
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

  // Rest timer
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

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      hideRestTimerTimeoutRef.current = setTimeout(() => setRestVisible(false), 2000);
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

    void scheduleActiveRestNotification(timerId, seconds, endsAtMs, title, body);
  }, [day?.session, scheduleActiveRestNotification]);

  const stopRest = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (hideRestTimerTimeoutRef.current) clearTimeout(hideRestTimerTimeoutRef.current);
    setRestRunning(false);
    setRestVisible(false);
    setRestSeconds(0);
    setRestEndsAt(null);
    void cancelActiveRestNotification();
  }, [cancelActiveRestNotification]);

  const adjustRest = useCallback((delta: number) => {
    setRestEndsAt(prevEndsAt => {
      if (!prevEndsAt) return prevEndsAt;

      const nextEndsAt = Math.max(Date.now(), prevEndsAt + (delta * 1000));
      const nextSeconds = Math.max(0, Math.ceil((nextEndsAt - Date.now()) / 1000));
      setRestSeconds(nextSeconds);
      setRestRunning(nextSeconds > 0);
      setRestVisible(nextSeconds > 0);

      if (nextSeconds === 0) {
        void cancelActiveRestNotification();
      } else if (activeTimerIdRef.current) {
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
  }, [cancelActiveRestNotification, scheduleActiveRestNotification]);

  const handleEnableNotifications = useCallback(async () => {
    if (Platform.OS !== 'web') return;

    setNotificationLoading(true);
    try {
      const nextState = await enableRestTimerNotifications();
      setNotificationState(nextState);

      if (
        nextState.status === 'ready' &&
        restRunning &&
        restEndsAt &&
        activeTimerIdRef.current
      ) {
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

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const completeSet = useCallback((exIdx: number, setIdx: number) => {
    const set = sets[exIdx][setIdx];
    if (!set.weight && !set.reps) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setSets(prev => {
      const next = prev.map(ex => [...ex]);
      next[exIdx] = [...next[exIdx]];
      next[exIdx][setIdx] = { ...next[exIdx][setIdx], completed: true };
      persistDraft(next);
      return next;
    });

    startRest(exercises[exIdx].rest, exercises[exIdx].name);
  }, [sets, exercises, persistDraft, startRest]);

  const updateSet = useCallback((exIdx: number, setIdx: number, field: 'weight' | 'reps', value: string) => {
    setSets(prev => {
      const next = prev.map(ex => [...ex]);
      next[exIdx] = [...next[exIdx]];
      next[exIdx][setIdx] = { ...next[exIdx][setIdx], [field]: value };
      persistDraft(next);
      return next;
    });
  }, [persistDraft]);

  const getPrevLastSession = useCallback((exIdx: number) => {
    const sessions = getPrevSessions(dayId!, exIdx);
    return sessions[0] ?? null;
  }, [getPrevSessions, dayId]);

  const checkOverload = useCallback((exIdx: number) => {
    const lastSession = getPrevLastSession(exIdx);
    if (!lastSession) return false;
    const ex = exercises[exIdx];
    return lastSession.sets.every(s => s.reps >= ex.repRange[1]);
  }, [getPrevLastSession, exercises]);

  const handleFinish = useCallback(() => {
    setShowFinishModal(true);
  }, []);

  const getTotals = () => {
    let totalSets = 0;
    let totalVol = 0;
    let exLogged = 0;
    sets.forEach((exSets, exIdx) => {
      let hasAny = false;
      exSets.forEach(s => {
        if (s.weight || s.reps) {
          totalSets++;
          totalVol += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
          hasAny = true;
        }
      });
      if (hasAny) exLogged++;
    });
    return { totalSets, totalVol, exLogged };
  };

  const confirmFinish = useCallback(() => {
    if (!dayId) return;
    const dateKey = formatLocalDateKey();

    const exerciseSets: { exIdx: number; sets: SetLog[] }[] = [];
    for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
      const loggedSets: SetLog[] = [];
      sets[exIdx].forEach(s => {
        if (s.weight || s.reps) {
          loggedSets.push({ weight: parseFloat(s.weight) || 0, reps: parseInt(s.reps) || 0 });
        }
      });
      if (loggedSets.length > 0) {
        exerciseSets.push({ exIdx, sets: loggedSets });
      }
    }

    if (exerciseSets.length > 0) {
      logWorkout(dayId, exerciseSets, dateKey);
    }

    void cancelActiveRestNotification();
    clearWorkoutDraft(dayId);
    markCompleted(dateKey, dayId);
    setShowFinishModal(false);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setTimeout(() => router.back(), 500);
  }, [cancelActiveRestNotification, clearWorkoutDraft, dayId, exercises, sets, logWorkout, markCompleted]);

  if (!day) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Workout not found</Text>
      </View>
    );
  }

  const { totalSets, totalVol, exLogged } = getTotals();

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={18} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTag}>{day.name}</Text>
          <Text style={styles.headerTitle}>
            {day.session}
            {isDeloadWeek && <Text style={styles.deloadTag}> · DELOAD</Text>}
          </Text>
        </View>
        <TouchableOpacity style={styles.finishBtn} onPress={handleFinish}>
          <Text style={styles.finishBtnText}>Finish</Text>
        </TouchableOpacity>
      </View>

      {isDeloadWeek && (
        <View style={styles.deloadBanner}>
          <Feather name="battery-charging" size={14} color={Colors.orange} />
          <Text style={styles.deloadBannerText}>Use 50-60% of your normal weight</Text>
        </View>
      )}

      {/* Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 200 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Protocol Banner */}
        {day.protocol && (
          <View style={styles.protocolBanner}>
            <Text style={styles.protocolLabel}>Protocol Notes</Text>
            <Text style={styles.protocolText}>{day.protocol}</Text>
          </View>
        )}

        {exercises.map((ex, exIdx) => {
          const lastSession = getPrevLastSession(exIdx);
          const shouldOverload = checkOverload(exIdx);

          return (
            <View
              key={exIdx}
              style={[styles.exCard, ex.failure ? styles.exCardFailure : styles.exCardRIR]}
            >
              <View style={styles.exHeader}>
                <Text style={styles.exName}>{ex.name}</Text>
                <View style={[styles.exBadge, ex.failure ? styles.badgeFailure : styles.badgeRIR]}>
                  <Text style={[styles.exBadgeText, ex.failure ? styles.badgeFailureText : styles.badgeRIRText]}>
                    {ex.failure ? 'To Failure' : '1-2 RIR'}
                  </Text>
                </View>
              </View>

              <Text style={styles.exTarget}>
                {ex.sets} sets · {ex.repRange[0]}{ex.repRange[1] !== ex.repRange[0] ? `–${ex.repRange[1]}` : ''} reps · {ex.rest}s rest
              </Text>

              <View style={styles.noteBanner}>
                <Text style={styles.noteText}>{ex.note}</Text>
              </View>

              {/* Sets */}
              <View style={styles.setsHeader}>
                <Text style={styles.setHeaderNum}>#</Text>
                <Text style={[styles.setHeaderText, { flex: 1 }]}>Weight</Text>
                <Text style={[styles.setHeaderText, { flex: 1 }]}>Reps</Text>
                <View style={styles.logBtnSpacer} />
              </View>

              {sets[exIdx].map((set, setIdx) => {
                const prevWeight = lastSession?.sets[setIdx]?.weight;
                const prevReps = lastSession?.sets[setIdx]?.reps;
                const deloadWeight = isDeloadWeek && prevWeight
                  ? Math.round(prevWeight * 0.55 / 2.5) * 2.5
                  : null;

                return (
                  <View
                    key={setIdx}
                    style={[styles.setRow, set.completed && styles.setRowDone]}
                  >
                    <Text style={styles.setNum}>{setIdx + 1}</Text>
                    <TextInput
                      style={[styles.setInput, !set.weight && styles.setInputPlaceholder]}
                      value={set.weight}
                      onChangeText={v => updateSet(exIdx, setIdx, 'weight', v)}
                      placeholder={
                        isDeloadWeek && deloadWeight
                          ? `${deloadWeight}`
                          : prevWeight
                          ? `${prevWeight}`
                          : 'lbs'
                      }
                      placeholderTextColor={isDeloadWeek && deloadWeight ? Colors.orange + '80' : Colors.text3}
                      keyboardType="decimal-pad"
                    />
                    <TextInput
                      style={[styles.setInput, !set.reps && styles.setInputPlaceholder]}
                      value={set.reps}
                      onChangeText={v => updateSet(exIdx, setIdx, 'reps', v)}
                      placeholder={prevReps ? `${prevReps}` : `${ex.repRange[0]}-${ex.repRange[1]}`}
                      placeholderTextColor={Colors.text3}
                      keyboardType="number-pad"
                    />
                    <TouchableOpacity
                      style={[styles.logBtn, set.completed && styles.logBtnDone]}
                      onPress={() => completeSet(exIdx, setIdx)}
                      disabled={set.completed}
                    >
                      {set.completed
                        ? <Feather name="check" size={14} color={Colors.green} />
                        : <Text style={styles.logBtnText}>Log</Text>
                      }
                    </TouchableOpacity>
                  </View>
                );
              })}

              {shouldOverload && !isDeloadWeek && (
                <View style={styles.overloadSignal}>
                  <Feather name="trending-up" size={14} color={Colors.accent} />
                  <Text style={styles.overloadText}>Hit all reps last time — add weight today</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Rest Timer */}
      {restVisible && (
        <View style={[styles.restTimer, { bottom: insets.bottom + 20 }]}>
          <View style={styles.restTimerMain}>
            <View>
              <Text style={styles.restLabel}>Rest</Text>
              <Text style={[
                styles.restTime,
                restSeconds === 0 ? styles.restTimeDone : restSeconds <= 15 ? styles.restTimeWarning : {}
              ]}>
                {restSeconds === 0 ? 'Go!' : formatTime(restSeconds)}
              </Text>
            </View>
            <View style={styles.restBtns}>
              <TouchableOpacity style={styles.restBtn} onPress={() => adjustRest(-30)}>
                <Text style={styles.restBtnText}>-30s</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.restBtn} onPress={() => adjustRest(30)}>
                <Text style={styles.restBtnText}>+30s</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.restBtn, styles.restBtnSkip]} onPress={stopRest}>
                <Text style={[styles.restBtnText, { color: '#000', fontFamily: 'Inter_700Bold' }]}>Skip</Text>
              </TouchableOpacity>
            </View>
          </View>
          {Platform.OS === 'web' && notificationState.message ? (
            <View style={styles.notificationBanner}>
              <Text style={styles.notificationBannerText}>{notificationState.message}</Text>
              {notificationState.canEnable && (
                <TouchableOpacity
                  style={[styles.notificationBannerBtn, notificationLoading && styles.notificationBannerBtnDisabled]}
                  onPress={handleEnableNotifications}
                  disabled={notificationLoading}
                >
                  <Text style={styles.notificationBannerBtnText}>
                    {notificationLoading ? 'Enabling...' : 'Enable Alerts'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>
      )}

      {/* Finish Modal */}
      <Modal
        visible={showFinishModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFinishModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Workout Done</Text>
            <Text style={styles.modalSub}>{day.session} — {day.tag}</Text>

            <View style={styles.modalStats}>
              {[
                { label: 'Sets Logged', val: totalSets.toString() },
                { label: 'Exercises', val: exLogged.toString() },
                { label: 'Volume', val: Math.round(totalVol).toLocaleString() + ' lbs' },
                { label: 'Day', val: day.name.slice(0, 3).toUpperCase() },
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
                <Text style={styles.modalBtnPrimaryText}>Save & Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: Colors.text2,
    textAlign: 'center',
    marginTop: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  headerTag: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 0.5,
  },
  deloadTag: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.orange,
  },
  finishBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  finishBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: '#000',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  deloadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,159,82,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,159,82,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  deloadBannerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.orange,
  },
  scroll: {
    flex: 1,
  },
  protocolBanner: {
    marginHorizontal: 12,
    marginVertical: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 12,
  },
  protocolLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  protocolText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 20,
  },
  exCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 12,
    gap: 8,
  },
  exCardFailure: {
    borderColor: 'rgba(255,82,82,0.3)',
  },
  exCardRIR: {
    borderColor: 'rgba(82,184,255,0.2)',
  },
  exHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  exName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
    flex: 1,
    lineHeight: 20,
  },
  exBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    marginTop: 2,
  },
  badgeFailure: {
    backgroundColor: 'rgba(255,82,82,0.12)',
  },
  badgeRIR: {
    backgroundColor: 'rgba(82,184,255,0.12)',
  },
  exBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    letterSpacing: 1,
  },
  badgeFailureText: {
    color: Colors.red,
  },
  badgeRIRText: {
    color: Colors.blue,
  },
  exTarget: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.text3,
  },
  noteBanner: {
    backgroundColor: Colors.surface3,
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 2,
    borderLeftColor: Colors.border2,
  },
  noteText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.text3,
    lineHeight: 18,
  },
  setsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingBottom: 2,
  },
  setHeaderNum: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
    width: 20,
    textAlign: 'center',
  },
  setHeaderText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  logBtnSpacer: {
    width: 52,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    borderRadius: 8,
  },
  setRowDone: {
    backgroundColor: 'rgba(76,255,145,0.05)',
  },
  setNum: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.text3,
    width: 20,
    textAlign: 'center',
  },
  setInput: {
    flex: 1,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: Colors.text,
    textAlign: 'center',
    minWidth: 0,
  },
  setInputPlaceholder: {
    borderStyle: 'dashed',
  },
  logBtn: {
    width: 52,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtnDone: {
    backgroundColor: 'rgba(76,255,145,0.1)',
    borderColor: 'rgba(76,255,145,0.3)',
  },
  logBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.text2,
  },
  overloadSignal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(232,255,71,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(232,255,71,0.2)',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  overloadText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.accent,
  },
  restTimer: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 20,
  },
  restTimerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  restLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  restTime: {
    fontFamily: 'Inter_700Bold',
    fontSize: 36,
    color: Colors.accent,
    letterSpacing: 2,
  },
  restTimeWarning: {
    color: Colors.orange,
  },
  restTimeDone: {
    color: Colors.green,
  },
  restBtns: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  restBtn: {
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restBtnSkip: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  restBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.text2,
  },
  notificationBanner: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 12,
    gap: 10,
  },
  notificationBannerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.text2,
    lineHeight: 18,
  },
  notificationBannerBtn: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  notificationBannerBtnDisabled: {
    opacity: 0.7,
  },
  notificationBannerBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: '#000',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    gap: 14,
  },
  modalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: Colors.text,
    letterSpacing: 1,
  },
  modalSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.text2,
    marginTop: -6,
  },
  modalStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  modalStat: {
    flex: 1,
    minWidth: '40%',
    backgroundColor: Colors.surface3,
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  modalStatLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  modalStatVal: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtnSecondary: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border2,
    alignItems: 'center',
  },
  modalBtnSecondaryText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.text2,
  },
  modalBtnPrimary: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: 'center',
  },
  modalBtnPrimaryText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: '#000',
    letterSpacing: 1,
  },
});
