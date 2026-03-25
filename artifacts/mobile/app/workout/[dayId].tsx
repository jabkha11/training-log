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
  Animated,
  Vibration,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/constants/colors';
import { DAYS } from '@/constants/workoutData';
import { useWorkout } from '@/context/WorkoutContext';
import type { SetLog } from '@/context/WorkoutContext';

interface SetState {
  weight: string;
  reps: string;
  completed: boolean;
}

function getDateKey() {
  return new Date().toISOString().split('T')[0];
}

export default function WorkoutScreen() {
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const insets = useSafeAreaInsets();
  const { getPrevSessions, logSession, markCompleted, isDeloadWeek } = useWorkout();

  const day = DAYS.find(d => d.id === dayId);
  const exercises = day?.exercises ?? [];

  const [sets, setSets] = useState<SetState[][]>(() =>
    exercises.map(ex => Array.from({ length: ex.sets }, () => ({ weight: '', reps: '', completed: false })))
  );

  const [restSeconds, setRestSeconds] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [restVisible, setRestVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showFinishModal, setShowFinishModal] = useState(false);
  const [finished, setFinished] = useState(false);

  const timerFlash = useRef(new Animated.Value(1)).current;

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // Rest timer
  useEffect(() => {
    if (restRunning && restSeconds > 0) {
      timerRef.current = setInterval(() => {
        setRestSeconds(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            setRestRunning(false);
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            setTimeout(() => setRestVisible(false), 2000);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [restRunning]);

  const startRest = useCallback((seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRestSeconds(seconds);
    setRestRunning(true);
    setRestVisible(true);
  }, []);

  const stopRest = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setRestRunning(false);
    setRestVisible(false);
  }, []);

  const adjustRest = useCallback((delta: number) => {
    setRestSeconds(prev => Math.max(0, prev + delta));
  }, []);

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
      return next;
    });

    startRest(exercises[exIdx].rest);
  }, [sets, exercises, startRest]);

  const updateSet = useCallback((exIdx: number, setIdx: number, field: 'weight' | 'reps', value: string) => {
    setSets(prev => {
      const next = prev.map(ex => [...ex]);
      next[exIdx] = [...next[exIdx]];
      next[exIdx][setIdx] = { ...next[exIdx][setIdx], [field]: value };
      return next;
    });
  }, []);

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

  const confirmFinish = useCallback(async () => {
    if (!dayId) return;
    const dateKey = getDateKey();

    for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
      const loggedSets: SetLog[] = [];
      sets[exIdx].forEach(s => {
        if (s.weight || s.reps) {
          loggedSets.push({ weight: parseFloat(s.weight) || 0, reps: parseInt(s.reps) || 0 });
        }
      });
      if (loggedSets.length > 0) {
        await logSession(dayId, exIdx, loggedSets, dateKey);
      }
    }

    markCompleted(dateKey, dayId);
    setShowFinishModal(false);
    setFinished(true);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setTimeout(() => router.back(), 500);
  }, [dayId, exercises, sets, logSession, markCompleted]);

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
                      editable={!set.completed}
                    />
                    <TextInput
                      style={[styles.setInput, !set.reps && styles.setInputPlaceholder]}
                      value={set.reps}
                      onChangeText={v => updateSet(exIdx, setIdx, 'reps', v)}
                      placeholder={prevReps ? `${prevReps}` : `${ex.repRange[0]}-${ex.repRange[1]}`}
                      placeholderTextColor={Colors.text3}
                      keyboardType="number-pad"
                      editable={!set.completed}
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
