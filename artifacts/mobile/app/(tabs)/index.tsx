import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Modal,
  Platform,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useProgram } from '@/context/ProgramContext';
import { useWorkout } from '@/context/WorkoutContext';
import { confirmAlert, showAlert } from '@/lib/alerts';
import { formatLocalDateKey, getStartOfLocalWeek } from '@/lib/date';
import { clearDevSeedData, seedDevData } from '@/lib/devSeed';
import { getHomeCoachingSummary } from '@/lib/analytics';

function getWeekDates(length: number) {
  const monday = getStartOfLocalWeek();
  return Array.from({ length }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getTodayProgramIndex(count: number) {
  if (count <= 0) return 0;
  const weekdayIndex = (new Date().getDay() + 6) % 7;
  if (count <= 7) return Math.min(weekdayIndex, count - 1);
  return weekdayIndex % count;
}

function getRecentDateKeys(length: number) {
  return Array.from({ length }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (length - 1 - index));
    return formatLocalDateKey(date);
  });
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { days, getDaySlots, isLoaded, reloadFromStorage: reloadProgramState, resetProgram } = useProgram();
  const { completedWorkouts, isDeloadWeek, workoutLog, reloadFromStorage: reloadWorkoutState } = useWorkout();
  const [showSettings, setShowSettings] = useState(false);
  const [devActionLoading, setDevActionLoading] = useState(false);
  const [devPassword, setDevPassword] = useState('');
  const [devUnlocked, setDevUnlocked] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;
  const todayIdx = getTodayProgramIndex(days.length);
  const todayId = days[todayIdx]?.id;
  const currentDay = days[todayIdx] ?? null;
  const currentDaySlots = currentDay ? getDaySlots(currentDay.id) : [];
  const weekDates = useMemo(() => getWeekDates(Math.max(days.length, 1)), [days.length]);
  const slots = useMemo(() => days.flatMap(day => getDaySlots(day.id)), [days, getDaySlots]);
  const homeSummary = useMemo(() => getHomeCoachingSummary(days, slots, workoutLog), [days, slots, workoutLog]);
  const latestPr = homeSummary.recentPrs[0] ?? null;
  const nextOpportunity = homeSummary.nextOpportunities[0] ?? null;
  const coachingLead = latestPr
    ? {
        eyebrow: 'Big win',
        title: `${latestPr.exerciseName} is moving.`,
        body: `You set a fresh ${latestPr.recordType} on ${latestPr.date}. Keep that same quality on your next exposure.`,
      }
    : {
        eyebrow: 'Build the base',
        title: 'Your story starts with a few solid sessions.',
        body: 'Log a small stretch of training and this space will start calling out PRs, stalls, and your next best opportunities.',
      };
  const homeSnapshot = useMemo(() => {
    const allSessions = Object.values(workoutLog).flat();
    const trainedDateKeys = new Set(allSessions.map(session => session.date));
    const recentDateKeys = getRecentDateKeys(14);
    const activeDays = recentDateKeys.filter(dateKey => trainedDateKeys.has(dateKey)).length;
    const thisWeekKeys = recentDateKeys.slice(-7);
    const lastWeekKeys = recentDateKeys.slice(0, 7);
    const thisWeekCount = thisWeekKeys.filter(dateKey => trainedDateKeys.has(dateKey)).length;
    const lastWeekCount = lastWeekKeys.filter(dateKey => trainedDateKeys.has(dateKey)).length;
    const recentSessions = allSessions.filter(session => recentDateKeys.includes(session.date));
    const totalSets = recentSessions.reduce((sum, session) => sum + session.sets.length, 0);
    const trainedMuscles = new Set(recentSessions.flatMap(session => session.muscleGroups)).size;
    let streak = 0;

    for (let index = recentDateKeys.length - 1; index >= 0; index -= 1) {
      if (!trainedDateKeys.has(recentDateKeys[index])) break;
      streak += 1;
    }

    const consistencyDays = recentDateKeys.map(dateKey => ({
      date: dateKey,
      trained: trainedDateKeys.has(dateKey),
    }));

    return {
      consistencyDays,
      activeDays,
      streak,
      totalSets,
      trainedMuscles,
      headline: activeDays > 0
        ? `You showed up ${activeDays} day${activeDays === 1 ? '' : 's'} in the last 14 days.`
        : 'Your streak starts with one session.',
      subline: activeDays > 0
        ? thisWeekCount >= lastWeekCount
          ? `You matched or topped last week with ${thisWeekCount} session${thisWeekCount === 1 ? '' : 's'} so far.`
          : `This week is a touch quieter so far, with ${thisWeekCount} session${thisWeekCount === 1 ? '' : 's'} logged.`
        : 'Log your first workout and your momentum will start showing up here.',
    };
  }, [workoutLog]);

  const handleSeedDemoData = async () => {
    const confirmed = await confirmAlert({
      title: 'Seed Demo Data',
      message: 'Reset the program and workout data, then create a fresh 3-week demo history?',
      cancelText: 'Cancel',
      confirmText: 'Seed',
      destructive: true,
    });
    if (!confirmed) return;
    setDevActionLoading(true);
    try {
      const result = await seedDevData();
      await Promise.all([reloadProgramState(), reloadWorkoutState()]);
      setShowSettings(false);
      showAlert('Demo data seeded', `${result.workouts} workouts, ${result.sessions} sessions, ${result.bodyweightEntries} bodyweight entries.`);
    } catch {
      showAlert('Seed failed', 'Unable to create demo data right now.');
    } finally {
      setDevActionLoading(false);
    }
  };

  const handleClearSeededData = async () => {
    const confirmed = await confirmAlert({
      title: 'Clear Seeded Data',
      message: 'Reset the program and remove all workout data?',
      cancelText: 'Cancel',
      confirmText: 'Clear',
      destructive: true,
    });
    if (!confirmed) return;
    setDevActionLoading(true);
    try {
      await clearDevSeedData();
      await Promise.all([reloadProgramState(), reloadWorkoutState()]);
      setShowSettings(false);
      showAlert('Data cleared', 'Program and workout data were reset to a clean state.');
    } catch {
      showAlert('Clear failed', 'Unable to clear demo data right now.');
    } finally {
      setDevActionLoading(false);
    }
  };

  const handleResetProgramOnly = async () => {
    const confirmed = await confirmAlert({
      title: 'Reset Program Only',
      message: 'Restore the bootstrap program without clearing workout history?',
      cancelText: 'Cancel',
      confirmText: 'Reset',
      destructive: true,
    });
    if (!confirmed) return;
    setDevActionLoading(true);
    try {
      await resetProgram();
      await reloadProgramState();
      setShowSettings(false);
      showAlert('Program reset', 'The program was restored to the bootstrap split.');
    } catch {
      showAlert('Reset failed', 'Unable to reset the program right now.');
    } finally {
      setDevActionLoading(false);
    }
  };

  const handleUnlockDevTools = () => {
    if (devPassword.trim() === 'dev') {
      setDevUnlocked(true);
      setDevPassword('');
      return;
    }
    showAlert('Wrong password', 'Use the dev password to unlock seed and reset tools.');
  };

  return (
    <View testID="home-screen" style={[styles.container, { paddingTop: topPad }]}>
      <StatusBar barStyle="light-content" />

      {!isLoaded ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Loading program…</Text>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.cardsScroll}
            contentContainerStyle={[styles.cardsContent, { paddingBottom: bottomPad + 100 }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.logo}>TRAINING LOG</Text>
                  <Text style={styles.subtitle}>Progressive Overload Tracker</Text>
                  <Text style={styles.heroEyebrow}>Today</Text>
                  <Text style={styles.heroTitle}>{currentDay?.session ?? 'No program loaded'}</Text>
                  <Text style={styles.heroSubtitle}>
                    {currentDay
                      ? currentDay.rest
                        ? 'Recovery day in your current split.'
                        : `${currentDay.tag} · ${currentDaySlots.length} exercises`
                      : 'Load your program to see today’s training.'}
                  </Text>
                </View>
                <View style={styles.heroActions}>
                  <TouchableOpacity
                    testID="home-settings-button"
                    accessibilityLabel="Open settings"
                    style={styles.devSettingsBtn}
                    onPress={() => setShowSettings(true)}
                  >
                    <Feather name="settings" size={16} color={Colors.text2} />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.weekStripScroll}
                contentContainerStyle={styles.weekStripContent}
              >
                {days.map((day, i) => {
                  const dateKey = formatLocalDateKey(weekDates[i]);
                  const isToday = day.id === todayId;
                  const isDone = completedWorkouts[dateKey] === day.id;
                  const isRest = day.rest;
                  const label = isRest ? 'Rest' : day.session.split(' ')[0];

                  return (
                    <TouchableOpacity
                      key={day.id}
                      style={[
                        styles.weekDay,
                        isToday && styles.weekDayToday,
                        isDone && styles.weekDayDone,
                        isRest && styles.weekDayRest,
                      ]}
                      onPress={() => !isRest && router.push({ pathname: '/workout/[dayId]', params: { dayId: day.id } })}
                      disabled={isRest}
                    >
                      <Text style={[styles.weekDayName, isToday && styles.weekDayNameActive]}>{day.label}</Text>
                      <Text style={[styles.weekDayLabel, isToday && styles.weekDayLabelActive, isRest && styles.weekDayLabelRest]}>{label}</Text>
                      <Text style={[styles.weekDayState, isDone && styles.weekDayStateDone]}>
                        {isDone ? 'Done' : isRest ? 'Recover' : isToday ? 'Now' : 'Open'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {currentDay && !currentDay.rest ? (
                <TouchableOpacity
                  style={styles.heroPrimaryCard}
                  onPress={() => router.push({ pathname: '/workout/[dayId]', params: { dayId: currentDay.id } })}
                >
                  <View style={[styles.heroPrimaryAccent, { backgroundColor: currentDay.color }]} />
                  <View style={styles.heroPrimaryBody}>
                    <View style={styles.heroPrimaryHeader}>
                      <View>
                        <Text style={styles.heroPrimaryTag}>Ready to train</Text>
                        <Text style={styles.heroPrimaryTitle}>{currentDay.session}</Text>
                      </View>
                      <View style={styles.launchPill}>
                        <Text style={styles.launchPillText}>Start</Text>
                      </View>
                    </View>
                    <View style={styles.heroMetaRow}>
                      <Text style={[styles.heroMetaTag, { color: currentDay.color }]}>{currentDay.tag}</Text>
                      <Text style={styles.heroMetaCount}>{currentDaySlots.length} exercises</Text>
                    </View>
                    {currentDaySlots.length > 0 ? (
                      <View style={styles.chipRow}>
                        {currentDaySlots.slice(0, 3).map(slot => (
                          <View key={slot.id} style={styles.chip}>
                            <Text style={styles.chipText}>{slot.exerciseName.split(' ').slice(0, 2).join(' ')}</Text>
                          </View>
                        ))}
                        {currentDaySlots.length > 3 ? (
                          <View style={styles.chip}>
                            <Text style={styles.chipText}>+{currentDaySlots.length - 3}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ) : currentDay ? (
                <View style={styles.heroRestCard}>
                  <Feather name="moon" size={18} color={Colors.orange} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroRestTitle}>Recovery day</Text>
                    <Text style={styles.heroRestText}>Stay loose, recover well, and come back strong tomorrow.</Text>
                  </View>
                </View>
              ) : null}
            </View>

            {isDeloadWeek ? (
              <View style={styles.deloadBanner}>
                <Feather name="battery-charging" size={16} color={Colors.orange} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.deloadBannerTitle}>Deload active</Text>
                  <Text style={styles.deloadBannerText}>Use 50-60% of normal load and keep your reps crisp.</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.snapshotSection}>
              <View style={styles.momentumSectionHeader}>
                <Text style={styles.momentumSectionEyebrow}>Momentum</Text>
                <Text style={styles.momentumSectionSub}>Keep the rhythm alive</Text>
              </View>

              <View style={styles.snapshotHeroCard}>
                <View style={styles.snapshotHeroTopRow}>
                  <View style={styles.snapshotCopy}>
                    <Text style={styles.momentumCardLabel}>Recent consistency</Text>
                    <Text style={styles.snapshotHeadline}>{homeSnapshot.headline}</Text>
                    <Text style={styles.snapshotSubline}>{homeSnapshot.subline}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.snapshotLinkPill}
                    onPress={() => router.push('/progress')}
                  >
                    <Text style={styles.snapshotLinkText}>Open Progress</Text>
                  </TouchableOpacity>
                </View>

                {homeSnapshot.activeDays > 0 ? (
                  <View style={styles.consistencyBlock}>
                    <View style={styles.consistencyDotRow}>
                      {homeSnapshot.consistencyDays.map(day => (
                        <View
                          key={day.date}
                          style={[
                            styles.consistencyDot,
                            day.trained ? styles.consistencyDotActive : styles.consistencyDotIdle,
                          ]}
                        />
                      ))}
                    </View>
                    <View style={styles.consistencyMetaRow}>
                      <Text style={styles.consistencyMetaText}>Last 14 days</Text>
                      <Text style={styles.consistencyMetaText}>
                        {homeSnapshot.streak > 0
                          ? `${homeSnapshot.streak}-day streak`
                          : 'No active streak'}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.snapshotEmptyCard}>
                    <Feather name="activity" size={16} color={Colors.text3} />
                    <Text style={styles.snapshotEmptyText}>No workouts yet. Log your first session and this row will start lighting up.</Text>
                  </View>
                )}
              </View>

              <View style={styles.snapshotStatRow}>
                <View style={styles.snapshotStatCard}>
                  <Text style={styles.summaryCardLabel}>Active Days</Text>
                  <Text style={styles.snapshotStatValue}>{homeSnapshot.activeDays}</Text>
                  <Text style={styles.snapshotStatText}>Last 14 days</Text>
                </View>
                <View style={styles.snapshotStatCard}>
                  <Text style={styles.summaryCardLabel}>Sets Logged</Text>
                  <Text style={styles.snapshotStatValue}>{homeSnapshot.totalSets}</Text>
                  <Text style={styles.snapshotStatText}>Work you banked</Text>
                </View>
                <View style={styles.snapshotStatCard}>
                  <Text style={styles.summaryCardLabel}>Muscles Hit</Text>
                  <Text style={styles.snapshotStatValue}>{homeSnapshot.trainedMuscles}</Text>
                  <Text style={styles.snapshotStatText}>Coverage lately</Text>
                </View>
              </View>
            </View>

            <View style={styles.summarySection}>
              <View style={styles.coachingSectionHeader}>
                <Text style={styles.coachingSectionEyebrow}>Coaching Summary</Text>
                <Text style={styles.coachingSectionSub}>Here’s where I’d put your attention next</Text>
              </View>

              <View style={styles.coachingLeadCard}>
                <View style={styles.coachingLeadAccent} />
                <View style={styles.coachingLeadBody}>
                  <Text style={styles.coachingLeadEyebrow}>{coachingLead.eyebrow}</Text>
                  <Text style={styles.coachingLeadTitle}>{coachingLead.title}</Text>
                  <Text style={styles.coachingLeadText}>{coachingLead.body}</Text>
                </View>
              </View>

              <View style={styles.coachingCalloutRow}>
                <View style={[styles.coachingMiniCard, styles.coachingMiniCardWarn]}>
                  <Text style={styles.coachingMiniLabel}>Needs a push</Text>
                  <Text style={styles.summaryCardValue}>{homeSummary.stalledSlots.length}</Text>
                  <Text style={styles.summaryMiniText}>{homeSummary.stalledSlots[0]?.exerciseName ?? 'Nothing is waving a red flag right now.'}</Text>
                </View>
                <View style={[styles.coachingMiniCard, styles.coachingMiniCardAccent]}>
                  <Text style={styles.coachingMiniLabel}>Ready soon</Text>
                  <Text style={styles.summaryCardValue}>{homeSummary.nextOpportunities.length}</Text>
                  <Text style={styles.summaryMiniText}>{nextOpportunity?.exerciseName ?? 'Keep stacking clean sessions and the next jump will show up.'}</Text>
                </View>
              </View>

              {homeSummary.weakPoints.length > 0 ? (
                <View style={styles.coachingNotesCard}>
                  <Text style={styles.coachingNotesLabel}>Keep an eye on</Text>
                  {homeSummary.weakPoints.slice(0, 2).map(point => (
                    <Text key={point.id} style={styles.coachingNotesText}>{point.message}</Text>
                  ))}
                </View>
              ) : null}
            </View>
          </ScrollView>
        </>
      )}

      <Modal visible={showSettings} transparent animationType="fade" onRequestClose={() => setShowSettings(false)}>
        <View style={styles.devModalOverlay}>
          <View testID="home-dev-menu" style={styles.devModalCard}>
            <View style={styles.devModalHeader}>
              <View style={styles.devModalHeaderCopy}>
                <Text style={styles.devModalTitle}>Settings</Text>
                <Text style={styles.devModalSub}>Developer tools stay tucked behind a password so regular users do not stumble into them.</Text>
              </View>
              <TouchableOpacity style={styles.devCloseBtn} onPress={() => setShowSettings(false)} disabled={devActionLoading}>
                <Feather name="x" size={18} color={Colors.text2} />
              </TouchableOpacity>
            </View>

            {!devUnlocked ? (
              <View style={styles.settingsCard}>
                <Text style={styles.devActionTitle}>Developer tools</Text>
                <Text style={styles.devActionSub}>Enter the dev password to unlock seed and reset actions.</Text>
                <View style={styles.devUnlockRow}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      value={devPassword}
                      onChangeText={setDevPassword}
                      placeholder="Password"
                      placeholderTextColor={Colors.text3}
                      secureTextEntry
                      style={styles.devPasswordInput}
                    />
                  </View>
                  <TouchableOpacity style={styles.devUnlockBtn} onPress={handleUnlockDevTools} disabled={devActionLoading}>
                    <Text style={styles.devUnlockBtnText}>Unlock</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <TouchableOpacity testID="dev-seed-demo-button" style={styles.devActionBtn} onPress={handleSeedDemoData} disabled={devActionLoading}>
                  <Text style={styles.devActionTitle}>{devActionLoading ? 'Working...' : 'Seed Demo Data'}</Text>
                  <Text style={styles.devActionSub}>Reset program and workout state, then create a realistic 3-week history.</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="dev-clear-seeded-data-button" style={styles.devActionBtn} onPress={handleClearSeededData} disabled={devActionLoading}>
                  <Text style={styles.devActionTitle}>Clear Seeded Data</Text>
                  <Text style={styles.devActionSub}>Wipe workout state and restore the bootstrap program.</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="dev-reset-program-button" style={styles.devActionBtn} onPress={handleResetProgramOnly} disabled={devActionLoading}>
                  <Text style={styles.devActionTitle}>Reset Program Only</Text>
                  <Text style={styles.devActionSub}>Keep workout history, but restore the saved program split.</Text>
                </TouchableOpacity>
              </>
            )}
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
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: Colors.text2,
  },
  cardsScroll: {
    flex: 1,
  },
  cardsContent: {
    paddingHorizontal: 14,
    paddingTop: 6,
    gap: 14,
  },
  logo: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.text,
    letterSpacing: 1.8,
  },
  subtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  heroCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 26,
    padding: 18,
    gap: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  heroActions: {
    gap: 10,
    alignItems: 'flex-end',
  },
  heroEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 12,
  },
  heroTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: Colors.text,
    lineHeight: 34,
    marginTop: 4,
  },
  heroSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 19,
    marginTop: 4,
  },
  devSettingsBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Colors.border2,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekStripScroll: {
    marginHorizontal: -4,
  },
  weekStripContent: {
    paddingHorizontal: 4,
    gap: 10,
  },
  weekDay: {
    width: 84,
    minHeight: 84,
    borderRadius: 18,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: 'space-between',
  },
  weekDayToday: {
    backgroundColor: Colors.surface3,
    borderColor: Colors.accentDim,
  },
  weekDayDone: {
    borderColor: Colors.successBorder,
  },
  weekDayRest: {
    opacity: 0.75,
  },
  weekDayName: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  weekDayNameActive: {
    color: Colors.text2,
  },
  weekDayLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: Colors.text,
  },
  weekDayLabelActive: {
    color: Colors.accent,
  },
  weekDayLabelRest: {
    color: Colors.text2,
  },
  weekDayState: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  weekDayStateDone: {
    color: Colors.green,
  },
  heroPrimaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 22,
    overflow: 'hidden',
  },
  heroPrimaryAccent: {
    width: 5,
  },
  heroPrimaryBody: {
    flex: 1,
    padding: 16,
    gap: 10,
  },
  heroPrimaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  heroPrimaryTag: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  heroPrimaryTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: Colors.text,
    lineHeight: 29,
    marginTop: 4,
  },
  launchPill: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
  },
  launchPillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: '#000',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  heroMetaTag: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  heroMetaCount: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
  },
  heroRestCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: Colors.warningBg,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    borderRadius: 20,
    padding: 16,
  },
  heroRestTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.text,
  },
  heroRestText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 19,
    marginTop: 4,
  },
  deloadBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.warningBg,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
    borderRadius: 18,
    padding: 14,
  },
  deloadBannerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: Colors.orange,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  deloadBannerText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
    lineHeight: 18,
    marginTop: 3,
  },
  summarySection: {
    gap: 14,
  },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  summaryPrimaryCard: {
    backgroundColor: Colors.surface2,
    borderColor: Colors.border2,
  },
  summaryRowCards: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryMiniCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 6,
  },
  summaryCardLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  summaryPrimaryTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.text,
    lineHeight: 28,
  },
  summaryCardValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: Colors.text,
  },
  summaryCardText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 19,
  },
  summaryMiniText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    backgroundColor: Colors.surface3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: Colors.text2,
  },
  snapshotSection: {
    gap: 10,
  },
  momentumSectionHeader: {
    gap: 4,
    paddingHorizontal: 2,
  },
  momentumSectionEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.text,
  },
  momentumSectionSub: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
  },
  snapshotHeroCard: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 22,
    padding: 16,
    gap: 14,
  },
  snapshotHeroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  snapshotCopy: {
    flex: 1,
    gap: 6,
  },
  momentumCardLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: Colors.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  snapshotHeadline: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: Colors.text,
    lineHeight: 30,
  },
  snapshotSubline: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 19,
  },
  snapshotLinkPill: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border2,
    justifyContent: 'center',
  },
  snapshotLinkText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.text2,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  consistencyBlock: {
    gap: 12,
    paddingTop: 4,
  },
  consistencyDotRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'nowrap',
  },
  consistencyDot: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  consistencyDotActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  consistencyDotIdle: {
    backgroundColor: Colors.surface2,
    borderColor: Colors.border,
  },
  consistencyMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  consistencyMetaText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
  },
  snapshotEmptyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    padding: 14,
  },
  snapshotEmptyText: {
    flex: 1,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 19,
  },
  snapshotStatRow: {
    flexDirection: 'row',
    gap: 10,
  },
  snapshotStatCard: {
    flex: 1,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  snapshotStatValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.text,
  },
  snapshotStatText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
  },
  coachingSectionHeader: {
    gap: 4,
    paddingHorizontal: 2,
  },
  coachingSectionEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.text,
  },
  coachingSectionSub: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
  },
  coachingLeadCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 24,
    overflow: 'hidden',
  },
  coachingLeadAccent: {
    width: 6,
    backgroundColor: Colors.accent,
  },
  coachingLeadBody: {
    flex: 1,
    padding: 18,
    gap: 8,
  },
  coachingLeadEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: Colors.accent,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  coachingLeadTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: Colors.text,
    lineHeight: 30,
  },
  coachingLeadText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 20,
  },
  coachingCalloutRow: {
    flexDirection: 'row',
    gap: 12,
  },
  coachingMiniCard: {
    flex: 1,
    borderRadius: 20,
    padding: 16,
    gap: 6,
    borderWidth: 1,
  },
  coachingMiniCardWarn: {
    backgroundColor: Colors.warningBg,
    borderColor: Colors.warningBorder,
  },
  coachingMiniCardAccent: {
    backgroundColor: Colors.accentBg,
    borderColor: Colors.accentDim,
  },
  coachingMiniLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: Colors.text2,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  coachingNotesCard: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 8,
  },
  coachingNotesLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: Colors.text2,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  coachingNotesText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 20,
  },
  devModalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    padding: 24,
  },
  devModalCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border2,
    borderRadius: 24,
    padding: 18,
    gap: 12,
    maxHeight: '78%',
  },
  devModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  devModalHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  devModalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: Colors.text,
  },
  devModalSub: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text3,
    marginTop: 4,
    lineHeight: 18,
  },
  devCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  devActionBtn: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  settingsCard: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  devUnlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  devPasswordInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: Colors.text,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
  devUnlockBtn: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: Colors.surface3,
    borderWidth: 1,
    borderColor: Colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  devUnlockBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  devActionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: Colors.text,
  },
  devActionSub: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
    lineHeight: 18,
  },
});
