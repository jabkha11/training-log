import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useProgramCreation } from '@/context/ProgramCreationContext';

export default function ProgramCreateEntryScreen() {
  const { isLoaded, draft, ensureDraft } = useProgramCreation();

  useEffect(() => {
    ensureDraft().catch(() => null);
  }, [ensureDraft]);

  useEffect(() => {
    if (!isLoaded || !draft) return;
    const nextRoute = draft.currentStep === 'basics'
      ? '/programs/create/basics'
      : draft.currentStep === 'structure'
        ? '/programs/create/structure'
        : draft.currentStep === 'review'
          ? '/programs/create/review'
          : {
              pathname: '/programs/create/day/[dayIndex]' as const,
              params: { dayIndex: String(draft.activeDayIndex ?? 0) },
            };
    router.replace(nextRoute as any);
  }, [draft, isLoaded]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={Colors.accent} />
    </View>
  );
}
