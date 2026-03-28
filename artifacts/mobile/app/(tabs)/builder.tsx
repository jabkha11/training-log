import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useProgram } from '@/context/ProgramContext';
import { confirmAlert } from '@/lib/alerts';
import type { SavedProgram } from '@/lib/program';
import { sortProgramDays } from '@/lib/program';

function summarizeProgram(program: SavedProgram) {
  const days = sortProgramDays(program.program.days);
  const restDays = days.filter(day => day.rest).length;
  return {
    days: days.length,
    restDays,
    exerciseCount: program.program.slots.length,
  };
}

function formatProgramDate(program: SavedProgram) {
  return new Date(program.updatedAt || program.createdAt).toLocaleDateString();
}

export default function BuilderScreen() {
  const insets = useSafeAreaInsets();
  const {
    isLoaded,
    programs,
    activeProgram,
    activeProgramId,
    setActiveProgram,
    createProgram,
    duplicateProgram,
    deleteProgram,
  } = useProgram();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const activeSummary = useMemo(() => (activeProgram ? summarizeProgram(activeProgram) : null), [activeProgram]);

  const openProgram = (program: SavedProgram) => {
    if (!program) return;
    router.push({ pathname: '/programs/[programId]' as any, params: { programId: program.id } });
  };

  const handleCreateProgram = () => {
    router.push('/programs/create/basics');
  };

  const handleDeleteProgram = async (program: SavedProgram) => {
    const confirmed = await confirmAlert({
      title: 'Delete Program',
      message: `Delete ${program.name}? This will not change your workout history.`,
      cancelText: 'Cancel',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;
    deleteProgram(program.id);
  };

  const handleDuplicateProgram = (program: SavedProgram) => {
    const duplicatedId = duplicateProgram(program.id);
    if (!duplicatedId) return;
    router.push({ pathname: '/programs/[programId]' as any, params: { programId: duplicatedId } });
  };

  if (!isLoaded) {
    return (
      <View style={[styles.loadingWrap, { paddingTop: topPad }]}>
        <ActivityIndicator color={Colors.accent} />
        <Text style={styles.loadingText}>Loading your programs...</Text>
      </View>
    );
  }

  return (
    <View testID="builder-screen" style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: bottomPad + 120 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Programs</Text>
          <Text style={styles.title}>One active plan. The rest are ready when you are.</Text>
          <Text style={styles.subtitle}>Your active program drives Today, Workouts, Calendar, and Progress. Switch whenever you want for future training.</Text>
        </View>

        {activeProgram && activeSummary ? (
          <View style={styles.activeCard}>
            <View style={styles.activeHeader}>
              <View style={styles.activeHeaderTop}>
                <View style={styles.activeBadge}>
                  <Feather name="zap" size={12} color={Colors.green} />
                  <Text style={styles.activeBadgeText}>Currently Active</Text>
                </View>
                <Text style={styles.updatedText}>Updated {formatProgramDate(activeProgram)}</Text>
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.activeTitle}>{activeProgram.name}</Text>
                <Text style={styles.activeDescription}>{activeProgram.description}</Text>
              </View>
            </View>

            <View style={styles.metricRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{activeSummary.days}</Text>
                <Text style={styles.metricLabel}>Days</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{activeSummary.exerciseCount}</Text>
                <Text style={styles.metricLabel}>Exercises</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricValue}>{activeSummary.restDays}</Text>
                <Text style={styles.metricLabel}>Rest Days</Text>
              </View>
            </View>

            <View style={styles.activeActions}>
              <TouchableOpacity style={styles.primaryAction} onPress={() => openProgram(activeProgram)} activeOpacity={0.9}>
                <Text style={styles.primaryActionText}>Edit Program</Text>
                <Feather name="arrow-up-right" size={16} color="#12161d" />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionEyebrow}>Library</Text>
            <Text style={styles.sectionTitle}>Saved programs</Text>
            <Text style={styles.sectionSubtitle}>Keep alternates here, then switch when you want a different plan active.</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.createBtn} onPress={handleCreateProgram} activeOpacity={0.9}>
          <Feather name="plus" size={16} color="#12161d" />
          <Text style={styles.createBtnText}>Create Program</Text>
        </TouchableOpacity>

        <View style={styles.programList}>
          {programs.map(program => {
            const summary = summarizeProgram(program);
            const isActive = program.id === activeProgramId;
            return (
              <View key={program.id} style={[styles.programCard, isActive && styles.programCardActive]}>
                <View style={styles.programHeader}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.programTitleRow}>
                      <Text style={styles.programName}>{program.name}</Text>
                      {isActive ? (
                        <View style={styles.programPill}>
                          <Text style={styles.programPillText}>Active</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.programDescription}>{program.description}</Text>
                  </View>
                  <Text style={styles.programDate}>Updated {formatProgramDate(program)}</Text>
                </View>

                <View style={styles.programMetaRow}>
                  <Text style={styles.programMeta}>{summary.days} days</Text>
                  <Text style={styles.programMeta}>{summary.exerciseCount} exercises</Text>
                  <Text style={styles.programMeta}>{summary.restDays} rest days</Text>
                </View>

                <View style={styles.programActions}>
                  <View style={styles.programPrimaryRow}>
                    {!isActive ? (
                      <TouchableOpacity style={styles.programActionPrimary} onPress={() => setActiveProgram(program.id)} activeOpacity={0.85}>
                        <Text style={styles.programActionPrimaryText}>Make Active</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.programActionPrimary} onPress={() => openProgram(program)} activeOpacity={0.85}>
                        <Text style={styles.programActionPrimaryText}>Edit Program</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity style={styles.programActionSecondary} onPress={() => openProgram(program)} activeOpacity={0.85}>
                      <Text style={styles.programActionSecondaryText}>Edit Program</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.programUtilityRow}>
                    <TouchableOpacity style={styles.utilityPill} onPress={() => handleDuplicateProgram(program)} activeOpacity={0.85}>
                      <Feather name="copy" size={14} color={Colors.text2} />
                      <Text style={styles.utilityPillText}>Duplicate</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.utilityPill, programs.length <= 1 && styles.iconActionDisabled]}
                      onPress={() => handleDeleteProgram(program)}
                      disabled={programs.length <= 1}
                      activeOpacity={0.85}
                    >
                      <Feather name="trash-2" size={14} color={programs.length <= 1 ? Colors.text3 : Colors.red} />
                      <Text style={[styles.utilityPillText, programs.length <= 1 && styles.utilityPillTextDisabled]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.text2,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    gap: 6,
    marginBottom: 16,
  },
  eyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: Colors.text,
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 20,
  },
  activeCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 26,
    padding: 18,
    gap: 16,
    marginBottom: 18,
  },
  activeHeader: {
    gap: 10,
  },
  activeHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.successBorder,
    backgroundColor: Colors.successBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activeBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.green,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  activeTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: Colors.text,
  },
  activeDescription: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 20,
  },
  updatedText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.text3,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  metricCard: {
    width: '47%',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.text,
  },
  metricLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  activeActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  primaryAction: {
    minWidth: 180,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 16,
    paddingVertical: 14,
  },
  primaryActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#12161d',
  },
  secondaryAction: {
    minWidth: 180,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  secondaryActionText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: Colors.text2,
  },
  sectionHeader: {
    gap: 6,
    marginBottom: 10,
  },
  sectionEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.text3,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.text,
    marginTop: 4,
  },
  sectionSubtitle: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
    lineHeight: 18,
    marginTop: 4,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  createBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: '#12161d',
  },
  programList: {
    gap: 12,
  },
  programCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  programCardActive: {
    borderColor: Colors.successBorder,
  },
  programHeader: {
    gap: 8,
  },
  programTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  programName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.text,
  },
  programPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.successBorder,
    backgroundColor: Colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  programPillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: Colors.green,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  programDescription: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.text2,
    lineHeight: 19,
  },
  programDate: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: Colors.text3,
  },
  programMetaRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  programMeta: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.text2,
  },
  programActions: {
    gap: 10,
  },
  programPrimaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  programUtilityRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  programActionPrimary: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: Colors.surface3,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  programActionPrimaryText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: Colors.text,
  },
  programActionSecondary: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  programActionSecondaryText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    color: Colors.text2,
  },
  utilityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
    paddingHorizontal: 12,
  },
  utilityPillText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: Colors.text2,
  },
  utilityPillTextDisabled: {
    color: Colors.text3,
  },
  iconActionDisabled: {
    opacity: 0.45,
  },
});
