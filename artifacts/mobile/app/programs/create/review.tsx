import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { ProgramCreationShell } from '@/components/ProgramCreationShell';
import { useProgramCreation } from '@/context/ProgramCreationContext';
import { countDraftExercises, describeGoal, getProgramCreationGoalLabel } from '@/lib/programCreation';
import { getProgramWeekdayName, sortProgramDays } from '@/lib/program';

export default function ProgramCreateReviewScreen() {
  const { isLoaded, draft, trainingDays, getDaySlots, finalizeDraft, setCurrentStep } = useProgramCreation();

  const summary = useMemo(() => {
    if (!draft) return null;
    const orderedDays = sortProgramDays(draft.program.days);
    const restDays = orderedDays.filter(day => day.rest).length;
    return {
      orderedDays,
      restDays,
      exerciseCount: countDraftExercises(draft.program),
    };
  }, [draft]);

  const handleClose = () => {
    router.replace('/builder');
  };

  const finish = async (makeActive: boolean) => {
    const programId = await finalizeDraft(makeActive);
    if (!programId) return;
    router.replace('/builder');
    setTimeout(() => {
      router.push({ pathname: '/programs/[programId]' as const, params: { programId } });
    }, 0);
  };

  if (!isLoaded || !draft || !summary) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  return (
    <ProgramCreationShell
      step={4}
      title="Review the full week before you save it"
      subtitle="This is the last pass before the program becomes a saved plan. You can jump back into any part of the flow and tighten it up."
      onBack={() => router.back()}
      onClose={handleClose}
      footer={
        <View style={styles.footerWrap}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => finish(false)} activeOpacity={0.85}>
            <Text style={styles.secondaryBtnText}>Save for Later</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => finish(true)} activeOpacity={0.9}>
            <Text style={styles.primaryBtnText}>Make Active Now</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View testID="program-create-review-screen" style={styles.heroCard}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.programName}>{draft.basics.name}</Text>
          <Text style={styles.programDescription}>{draft.basics.description || describeGoal(draft.basics.goal)}</Text>
        </View>
        <View style={styles.goalPill}>
          <Text style={styles.goalPillText}>{getProgramCreationGoalLabel(draft.basics.goal)}</Text>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>7</Text>
          <Text style={styles.summaryLabel}>Days</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{trainingDays.length}</Text>
          <Text style={styles.summaryLabel}>Workout Days</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{summary.exerciseCount}</Text>
          <Text style={styles.summaryLabel}>Exercises</Text>
        </View>
      </View>

      <View style={styles.editRow}>
        <TouchableOpacity style={styles.inlineEditBtn} onPress={() => { setCurrentStep('basics'); router.push('/programs/create/basics'); }} activeOpacity={0.85}>
          <Feather name="edit-2" size={14} color={Colors.text2} />
          <Text style={styles.inlineEditText}>Edit basics</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.inlineEditBtn} onPress={() => { setCurrentStep('structure'); router.push('/programs/create/structure'); }} activeOpacity={0.85}>
          <Feather name="calendar" size={14} color={Colors.text2} />
          <Text style={styles.inlineEditText}>Edit structure</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.weekList}>
        {summary.orderedDays.map(day => {
          const slots = getDaySlots(day.id);
          return (
            <View key={day.id} style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.dayTitle}>{getProgramWeekdayName(day.sortOrder)}</Text>
                  <Text style={styles.daySubtitle}>{day.rest ? 'Rest Day' : day.session}</Text>
                </View>
                {!day.rest ? (
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => {
                      const index = trainingDays.findIndex(entry => entry.id === day.id);
                      setCurrentStep('day', Math.max(0, index));
                      router.push({ pathname: '/programs/create/day/[dayIndex]' as const, params: { dayIndex: String(Math.max(0, index)) } });
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {day.rest ? (
                <Text style={styles.restText}>Recovery day stays in the weekly layout so the program lands as a full 7-day schedule.</Text>
              ) : (
                <View style={styles.exercisePreviewList}>
                  <Text style={styles.exercisePreviewCount}>{slots.length} exercise{slots.length === 1 ? '' : 's'}</Text>
                  <Text style={styles.exercisePreviewText}>{slots.map(slot => slot.exerciseName).slice(0, 4).join(' • ')}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ProgramCreationShell>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.border2,
    backgroundColor: Colors.surface,
    padding: 18,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  programName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.text,
  },
  programDescription: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 19,
    color: Colors.text2,
  },
  goalPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#191f0b',
    borderWidth: 1,
    borderColor: '#425108',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  goalPillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: Colors.accent,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
  },
  summaryValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: Colors.text,
  },
  summaryLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.text2,
  },
  editRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  inlineEditBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  inlineEditText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.text2,
  },
  weekList: {
    gap: 12,
  },
  dayCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 16,
    gap: 10,
  },
  dayHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  dayTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.text,
  },
  daySubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
  },
  editBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  editBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.text2,
  },
  restText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 18,
    color: Colors.text2,
  },
  exercisePreviewList: {
    gap: 4,
  },
  exercisePreviewCount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.accent,
  },
  exercisePreviewText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 19,
    color: Colors.text2,
  },
  footerWrap: {
    gap: 10,
  },
  secondaryBtn: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: Colors.text,
  },
  primaryBtn: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#12161d',
  },
});
