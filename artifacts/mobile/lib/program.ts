import type { StrengthLiftKey } from '@/constants/heatmap';
import { DAYS } from '@/constants/workoutData';
import { getDefaultExerciseCatalogLink } from '@/lib/defaultExerciseCatalog';

export type ProgramBootstrapVersion = 1;
export type ProgressionMode = 'double_progression';

export const DEFAULT_PROGRESSION_MODE: ProgressionMode = 'double_progression';
export const DEFAULT_LOAD_STEP = 5;
export const DEFAULT_MIN_SESSIONS_BEFORE_STALL = 3;
export const DEFAULT_STALL_THRESHOLD = 3;
export const DEFAULT_DELOAD_FACTOR = 0.9;
export const PROGRAM_WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const PROGRAM_WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export const MAX_PROGRAM_DAYS = 7;
export const DEFAULT_SEEDED_PROGRAM_NAME = 'Shoulders Focused Split';
export const DEFAULT_SEEDED_PROGRAM_DESCRIPTION = 'A shoulder-focused weekly split';

export interface SlotPrescription {
  sets: number;
  repRange: [number, number];
  restSeconds: number;
  failure: boolean;
}

export interface ProgramDay {
  id: string;
  name: string;
  label: string;
  session: string;
  color: string;
  tag: string;
  protocol?: string;
  rest: boolean;
  sortOrder: number;
}

export interface ProgramSlot extends SlotPrescription {
  id: string;
  dayId: string;
  sortOrder: number;
  assignmentId: string;
  strengthSignalKey: StrengthLiftKey | null;
  progressionMode: ProgressionMode;
  loadStep: number;
  minSessionsBeforeStall: number;
  stallThreshold: number;
  deloadFactor: number;
  exerciseName: string;
  catalogExerciseId: string | number | null;
  exerciseSource: 'manual' | 'wger';
  exerciseImageUrl?: string | null;
  exerciseCategoryName?: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  note: string;
  muscleGroups: string[];
}

export interface ProgramState {
  version: ProgramBootstrapVersion;
  days: ProgramDay[];
  slots: ProgramSlot[];
  updatedAt: string;
}

export type ProgramsLibraryVersion = 1;

export interface SavedProgram {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  origin: 'seeded' | 'user' | 'duplicate';
  program: ProgramState;
}

export interface ProgramsState {
  version: ProgramsLibraryVersion;
  activeProgramId: string;
  programs: SavedProgram[];
  updatedAt: string;
}

export const PROGRAM_BOOTSTRAP_VERSION: ProgramBootstrapVersion = 1;
export const PROGRAMS_LIBRARY_VERSION: ProgramsLibraryVersion = 1;

export function getProgramUpdatedAt() {
  return new Date().toISOString();
}

export function createProgramId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createAssignmentId(prefix = 'assignment') {
  return createProgramId(prefix);
}

export function createSavedProgramId() {
  return createProgramId('saved-program');
}

export function sortProgramDays(days: ProgramDay[]) {
  return days.slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getProgramWeekdayName(index: number) {
  return PROGRAM_WEEKDAY_NAMES[index] ?? `Day ${index + 1}`;
}

export function getProgramWeekdayLabel(index: number) {
  return PROGRAM_WEEKDAY_LABELS[index] ?? `D${index + 1}`;
}

export function sortProgramSlots(slots: ProgramSlot[]) {
  return slots.slice().sort((a, b) => {
    if (a.dayId !== b.dayId) return a.dayId.localeCompare(b.dayId);
    return a.sortOrder - b.sortOrder;
  });
}

export function getSlotsForDay(slots: ProgramSlot[], dayId: string) {
  return slots
    .filter(slot => slot.dayId === dayId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function normalizeDayOrders(days: ProgramDay[]) {
  return sortProgramDays(days).map((day, index) => ({
    ...day,
    name: getProgramWeekdayName(index),
    label: getProgramWeekdayLabel(index),
    sortOrder: index,
  }));
}

export function normalizeSlotOrders(slots: ProgramSlot[], dayId: string) {
  const daySlots = getSlotsForDay(slots, dayId).map((slot, index) => ({
    ...slot,
    sortOrder: index,
  }));

  return [
    ...slots.filter(slot => slot.dayId !== dayId),
    ...daySlots,
  ];
}

export function normalizeProgramState(state: ProgramState): ProgramState {
  let nextSlots = state.slots.slice();
  for (const day of state.days) {
    nextSlots = normalizeSlotOrders(nextSlots, day.id);
  }

  return {
    ...state,
    days: normalizeDayOrders(state.days),
    slots: sortProgramSlots(nextSlots),
  };
}

export function createBootstrapProgramState(): ProgramState {
  const days: ProgramDay[] = DAYS.map((day, dayIndex) => ({
    id: `bootstrap-${day.id}`,
    name: day.name,
    label: day.label,
    session: day.session,
    color: day.color,
    tag: day.tag,
    protocol: day.protocol,
    rest: !!day.rest,
    sortOrder: dayIndex,
  }));

  const slots: ProgramSlot[] = DAYS.flatMap(day =>
    (day.exercises ?? []).map((exercise, exerciseIndex) => {
      const catalogLink = getDefaultExerciseCatalogLink(exercise.name);
      return {
        id: `bootstrap-${day.id}-${exerciseIndex}`,
        dayId: `bootstrap-${day.id}`,
        sortOrder: exerciseIndex,
        assignmentId: `assignment-bootstrap-${day.id}-${exerciseIndex}`,
        strengthSignalKey: null,
        progressionMode: DEFAULT_PROGRESSION_MODE,
        loadStep: DEFAULT_LOAD_STEP,
        minSessionsBeforeStall: DEFAULT_MIN_SESSIONS_BEFORE_STALL,
        stallThreshold: DEFAULT_STALL_THRESHOLD,
        deloadFactor: DEFAULT_DELOAD_FACTOR,
        exerciseName: exercise.name,
        catalogExerciseId: catalogLink?.catalogExerciseId ?? null,
        exerciseSource: catalogLink ? 'wger' : 'manual',
        exerciseImageUrl: null,
        exerciseCategoryName: catalogLink?.exerciseCategoryName ?? null,
        primaryMuscles: [],
        secondaryMuscles: [],
        sets: exercise.sets,
        repRange: exercise.repRange,
        restSeconds: exercise.rest,
        failure: exercise.failure,
        note: exercise.note,
        muscleGroups: exercise.muscleGroups.slice(),
      };
    })
  );

  return normalizeProgramState({
    version: PROGRAM_BOOTSTRAP_VERSION,
    days,
    slots,
    updatedAt: getProgramUpdatedAt(),
  });
}

export function cloneProgramState(source: ProgramState): ProgramState {
  return normalizeProgramState({
    version: PROGRAM_BOOTSTRAP_VERSION,
    days: source.days.map(day => ({ ...day })),
    slots: source.slots.map(slot => ({
      ...slot,
      primaryMuscles: slot.primaryMuscles.slice(),
      secondaryMuscles: slot.secondaryMuscles.slice(),
      muscleGroups: slot.muscleGroups.slice(),
      repRange: [slot.repRange[0], slot.repRange[1]],
    })),
    updatedAt: source.updatedAt,
  });
}

export function regenerateProgramStructureIds(source: ProgramState): ProgramState {
  const dayIdMap = new Map<string, string>();
  const days = sortProgramDays(source.days).map(day => {
    const nextId = createProgramId('program-day');
    dayIdMap.set(day.id, nextId);
    return {
      ...day,
      id: nextId,
    };
  });

  const slots = sortProgramSlots(source.slots).map(slot => {
    const nextId = createProgramId('program-slot');
    return {
      ...slot,
      id: nextId,
      dayId: dayIdMap.get(slot.dayId) ?? slot.dayId,
      assignmentId: createAssignmentId(`assignment-${nextId}`),
      primaryMuscles: slot.primaryMuscles.slice(),
      secondaryMuscles: slot.secondaryMuscles.slice(),
      muscleGroups: slot.muscleGroups.slice(),
      repRange: [slot.repRange[0], slot.repRange[1]] as [number, number],
    };
  });

  return normalizeProgramState({
    version: PROGRAM_BOOTSTRAP_VERSION,
    days,
    slots,
    updatedAt: getProgramUpdatedAt(),
  });
}

export function createSavedProgram(
  program: ProgramState,
  meta?: Partial<Pick<SavedProgram, 'id' | 'name' | 'description' | 'origin' | 'createdAt'>>,
): SavedProgram {
  const now = getProgramUpdatedAt();
  const normalizedProgram = cloneProgramState(program);
  return {
    id: meta?.id ?? createSavedProgramId(),
    name: meta?.name ?? DEFAULT_SEEDED_PROGRAM_NAME,
    description: meta?.description ?? DEFAULT_SEEDED_PROGRAM_DESCRIPTION,
    createdAt: meta?.createdAt ?? now,
    updatedAt: now,
    origin: meta?.origin ?? 'seeded',
    program: {
      ...normalizedProgram,
      updatedAt: now,
    },
  };
}

export function createBootstrapProgramsState(): ProgramsState {
  const savedProgram = createSavedProgram(createBootstrapProgramState(), {
    name: DEFAULT_SEEDED_PROGRAM_NAME,
    description: DEFAULT_SEEDED_PROGRAM_DESCRIPTION,
    origin: 'seeded',
  });

  return {
    version: PROGRAMS_LIBRARY_VERSION,
    activeProgramId: savedProgram.id,
    programs: [savedProgram],
    updatedAt: getProgramUpdatedAt(),
  };
}
