import {
  MAX_PROGRAM_DAYS,
  createProgramId,
  getProgramUpdatedAt,
  normalizeDayOrders,
  normalizeProgramState,
  type ProgramDay,
  type ProgramState,
} from '@/lib/program';

export type ProgramCreationGoal = 'balanced' | 'hypertrophy' | 'strength' | 'shoulder_focus';
export type ProgramCreationStep = 'basics' | 'structure' | 'day' | 'review';
export const PROGRAM_CREATION_DRAFT_VERSION = 1 as const;

export interface ProgramCreationBasics {
  name: string;
  description: string;
  frequency: number;
  includeRestDays: boolean;
  goal: ProgramCreationGoal;
}

export interface ProgramCreationDraft {
  version: typeof PROGRAM_CREATION_DRAFT_VERSION;
  currentStep: ProgramCreationStep;
  activeDayIndex: number;
  basics: ProgramCreationBasics;
  program: ProgramState;
  updatedAt: string;
}

export interface ProgramCreationGoalOption {
  key: ProgramCreationGoal;
  label: string;
  description: string;
}

export const PROGRAM_CREATION_GOAL_OPTIONS: ProgramCreationGoalOption[] = [
  { key: 'balanced', label: 'Balanced', description: 'A steady mix of compounds and accessories through the week.' },
  { key: 'hypertrophy', label: 'Hypertrophy', description: 'More volume, more muscle-group coverage, and pump-friendly sessions.' },
  { key: 'strength', label: 'Strength', description: 'More main-lift focus with lower reps and simpler session structure.' },
  { key: 'shoulder_focus', label: 'Shoulder Focus', description: 'Extra shoulder volume and placement priority across the week.' },
];

const GOAL_LABELS: Record<ProgramCreationGoal, string> = {
  balanced: 'Balanced',
  hypertrophy: 'Hypertrophy',
  strength: 'Strength',
  shoulder_focus: 'Shoulder Focus',
};

const GOAL_DESCRIPTIONS: Record<ProgramCreationGoal, string> = {
  balanced: 'A balanced weekly split',
  hypertrophy: 'A muscle-building weekly split',
  strength: 'A strength-focused weekly split',
  shoulder_focus: 'A shoulder-priority weekly split',
};

function clampFrequency(value: number) {
  return Math.max(1, Math.min(MAX_PROGRAM_DAYS, Math.round(value || 4)));
}

export function getProgramCreationGoalLabel(goal: ProgramCreationGoal) {
  return GOAL_LABELS[goal];
}

export function createDefaultProgramCreationBasics(): ProgramCreationBasics {
  return {
    name: 'My Program',
    description: '',
    frequency: 4,
    includeRestDays: true,
    goal: 'balanced',
  };
}

function createDayBase(sortOrder: number, session: string, rest: boolean): ProgramDay {
  return {
    id: createProgramId('draft-day'),
    name: '',
    label: '',
    session,
    color: rest ? '#f0ede8' : '#52b8ff',
    tag: rest ? 'Rest Day' : 'Workout Day',
    protocol: '',
    rest,
    sortOrder,
  };
}

export function createDraftProgramState(basics: ProgramCreationBasics): ProgramState {
  const frequency = clampFrequency(basics.frequency);
  const days: ProgramDay[] = [];

  for (let index = 0; index < MAX_PROGRAM_DAYS; index += 1) {
    const isWorkoutDay = index < frequency;
    const session = isWorkoutDay ? '' : 'Rest Day';
    const day = createDayBase(index, session, !isWorkoutDay);
    days.push(day);
  }

  return normalizeProgramState({
    version: 1,
    days,
    slots: [],
    updatedAt: getProgramUpdatedAt(),
  });
}

export function createProgramCreationDraft(partial?: Partial<ProgramCreationBasics>): ProgramCreationDraft {
  const base = createDefaultProgramCreationBasics();
  const basics: ProgramCreationBasics = {
    ...base,
    ...partial,
    frequency: clampFrequency(partial?.frequency ?? base.frequency),
    includeRestDays: true,
  };

  return {
    version: PROGRAM_CREATION_DRAFT_VERSION,
    currentStep: 'basics',
    activeDayIndex: 0,
    basics,
    program: createDraftProgramState(basics),
    updatedAt: getProgramUpdatedAt(),
  };
}

export function listDraftTrainingDays(program: ProgramState) {
  return normalizeDayOrders(program.days).filter(day => !day.rest);
}

export function countDraftExercises(program: ProgramState) {
  return program.slots.length;
}

export function describeGoal(goal: ProgramCreationGoal) {
  return GOAL_DESCRIPTIONS[goal];
}
