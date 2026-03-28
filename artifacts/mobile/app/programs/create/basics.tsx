import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/colors';
import { ProgramCreationShell } from '@/components/ProgramCreationShell';
import { useProgramCreation } from '@/context/ProgramCreationContext';
import {
  PROGRAM_CREATION_GOAL_OPTIONS,
  createDefaultProgramCreationBasics,
  type ProgramCreationGoal,
} from '@/lib/programCreation';

export default function ProgramCreateBasicsScreen() {
  const { isLoaded, draft, updateBasics, ensureDraft, discardDraft } = useProgramCreation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState(4);
  const [goal, setGoal] = useState<ProgramCreationGoal>('balanced');

  useEffect(() => {
    ensureDraft().catch(() => null);
  }, [ensureDraft]);

  useEffect(() => {
    const basics = draft?.basics ?? createDefaultProgramCreationBasics();
    setName(basics.name);
    setDescription(basics.description);
    setFrequency(basics.frequency);
    setGoal(basics.goal);
  }, [draft?.basics]);

  const handleClose = () => {
    router.replace('/builder');
  };

  const handleDiscard = () => {
    Alert.alert('Discard draft?', 'This will clear the guided setup you’ve built so far.', [
      { text: 'Keep Draft', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discardDraft();
          router.replace('/builder');
        },
      },
    ]);
  };

  const handleNext = () => {
    updateBasics({
      name: name.trim() || 'My Program',
      description: description.trim(),
      frequency,
      includeRestDays: true,
      goal,
    }, 'structure');
    router.push('/programs/create/structure');
  };

  if (!isLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  return (
    <ProgramCreationShell
      step={1}
      title="Start with the shape of your week"
      subtitle="Pick the goal, give the program a name, and choose how many training days you want. We’ll fill the rest of the week with rest days automatically."
      onClose={handleClose}
      footer={
        <View style={styles.footerWrap}>
          <TouchableOpacity style={styles.discardBtn} onPress={handleDiscard} activeOpacity={0.85}>
            <Text style={styles.discardText}>Discard Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleNext} activeOpacity={0.9}>
            <Text style={styles.primaryBtnText}>Next: Structure</Text>
          </TouchableOpacity>
        </View>
      }
    >
      <View testID="program-create-basics-screen" style={styles.section}>
        <Text style={styles.label}>Program name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="My Program"
          placeholderTextColor={Colors.text3}
          style={styles.input}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Short description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Optional"
          placeholderTextColor={Colors.text3}
          style={[styles.input, styles.multiline]}
          multiline
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Training days</Text>
        <View style={styles.stepperRow}>
          <TouchableOpacity style={styles.stepperBtn} onPress={() => setFrequency(value => Math.max(1, value - 1))} activeOpacity={0.85}>
            <Text style={styles.stepperSymbol}>-</Text>
          </TouchableOpacity>
          <View style={styles.stepperValueCard}>
            <Text style={styles.stepperValue}>{frequency}</Text>
            <Text style={styles.stepperCaption}>training days</Text>
          </View>
          <TouchableOpacity style={styles.stepperBtn} onPress={() => setFrequency(value => Math.min(7, value + 1))} activeOpacity={0.85}>
            <Text style={styles.stepperSymbol}>+</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.helper}>The remaining {7 - frequency} day{7 - frequency === 1 ? '' : 's'} will start as rest days.</Text>
        <View style={styles.weekPreview}>
          {Array.from({ length: 7 }).map((_, index) => {
            const live = index < frequency;
            return (
              <View key={index} style={[styles.weekPreviewPill, live ? styles.weekPreviewPillLive : styles.weekPreviewPillRest]}>
                <Text style={[styles.weekPreviewText, live ? styles.weekPreviewTextLive : styles.weekPreviewTextRest]}>
                  {live ? 'Train' : 'Rest'}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Goal emphasis</Text>
        <View style={styles.goalList}>
          {PROGRAM_CREATION_GOAL_OPTIONS.map(option => {
            const isSelected = goal === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.goalCard, isSelected && styles.goalCardSelected]}
                onPress={() => setGoal(option.key)}
                activeOpacity={0.9}
              >
                <Text style={[styles.goalTitle, isSelected && styles.goalTitleSelected]}>{option.label}</Text>
                <Text style={[styles.goalText, isSelected && styles.goalTextSelected]}>{option.description}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
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
  section: {
    gap: 8,
    marginBottom: 18,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: Colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  multiline: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperSymbol: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.text,
  },
  stepperValueCard: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border2,
    backgroundColor: Colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 2,
  },
  stepperValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 30,
    color: Colors.text,
  },
  stepperCaption: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: Colors.text2,
  },
  helper: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    lineHeight: 18,
    color: Colors.text2,
  },
  weekPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  weekPreviewPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  weekPreviewPillLive: {
    backgroundColor: '#191f0b',
    borderColor: '#4e5f11',
  },
  weekPreviewPillRest: {
    backgroundColor: Colors.surface2,
    borderColor: Colors.border,
  },
  weekPreviewText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
  },
  weekPreviewTextLive: {
    color: Colors.accent,
  },
  weekPreviewTextRest: {
    color: Colors.text2,
  },
  goalList: {
    gap: 10,
  },
  goalCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 4,
  },
  goalCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: '#191f0b',
  },
  goalTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: Colors.text,
  },
  goalTitleSelected: {
    color: Colors.accent,
  },
  goalText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 19,
    color: Colors.text2,
  },
  goalTextSelected: {
    color: '#dce79f',
  },
  footerWrap: {
    gap: 10,
  },
  discardBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  discardText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.red,
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
