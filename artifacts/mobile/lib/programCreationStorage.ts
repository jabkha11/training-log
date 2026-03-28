import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createProgramCreationDraft,
  type ProgramCreationDraft,
  type ProgramCreationGoal,
  type ProgramCreationStep,
} from '@/lib/programCreation';
import { normalizeProgramState, type ProgramState } from '@/lib/program';

export const PROGRAM_CREATION_DRAFT_STORAGE_KEY = 'tl_program_create_draft_v1';

function isGoal(value: unknown): value is ProgramCreationGoal {
  return value === 'balanced'
    || value === 'hypertrophy'
    || value === 'strength'
    || value === 'shoulder_focus';
}

function isStep(value: unknown): value is ProgramCreationStep {
  return value === 'basics' || value === 'structure' || value === 'day' || value === 'review';
}

function upgradeProgramState(value: unknown): ProgramState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Record<string, unknown>;
  if (!Array.isArray(state.days) || !Array.isArray(state.slots)) return null;

  try {
    return normalizeProgramState({
      version: 1,
      days: state.days as any,
      slots: state.slots as any,
      updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : new Date().toISOString(),
    });
  } catch {
    return null;
  }
}

function normalizeDraft(value: unknown): ProgramCreationDraft | null {
  if (!value || typeof value !== 'object') return null;
  const draft = value as Record<string, unknown>;
  const basics = draft.basics as Record<string, unknown> | undefined;
  const program = upgradeProgramState(draft.program);
  if (!basics || !program) return null;
  if (!isGoal(basics.goal) || !isStep(draft.currentStep)) return null;

  return {
    version: 1,
    currentStep: draft.currentStep,
    activeDayIndex: typeof draft.activeDayIndex === 'number' ? Math.max(0, Math.round(draft.activeDayIndex)) : 0,
    basics: {
      name: typeof basics.name === 'string' ? basics.name : 'My Program',
      description: typeof basics.description === 'string' ? basics.description : '',
      frequency: typeof basics.frequency === 'number' ? Math.max(1, Math.min(7, Math.round(basics.frequency))) : 4,
      includeRestDays: true,
      goal: basics.goal,
    },
    program,
    updatedAt: typeof draft.updatedAt === 'string' ? draft.updatedAt : new Date().toISOString(),
  };
}

export async function loadProgramCreationDraft() {
  const raw = await AsyncStorage.getItem(PROGRAM_CREATION_DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    return normalizeDraft(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveProgramCreationDraft(draft: ProgramCreationDraft) {
  await AsyncStorage.setItem(PROGRAM_CREATION_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export async function clearProgramCreationDraft() {
  await AsyncStorage.removeItem(PROGRAM_CREATION_DRAFT_STORAGE_KEY);
}

export async function loadOrCreateProgramCreationDraft() {
  return (await loadProgramCreationDraft()) ?? createProgramCreationDraft();
}
