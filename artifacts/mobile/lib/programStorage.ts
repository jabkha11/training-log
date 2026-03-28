import AsyncStorage from '@react-native-async-storage/async-storage';
import { STRENGTH_LIFT_ORDER } from '@/constants/heatmap';
import type { StrengthLiftKey } from '@/constants/heatmap';
import {
  DEFAULT_DELOAD_FACTOR,
  DEFAULT_SEEDED_PROGRAM_DESCRIPTION,
  DEFAULT_SEEDED_PROGRAM_NAME,
  DEFAULT_LOAD_STEP,
  DEFAULT_MIN_SESSIONS_BEFORE_STALL,
  DEFAULT_PROGRESSION_MODE,
  DEFAULT_STALL_THRESHOLD,
  PROGRAM_BOOTSTRAP_VERSION,
  PROGRAMS_LIBRARY_VERSION,
  createAssignmentId,
  createBootstrapProgramState,
  createBootstrapProgramsState,
  createSavedProgram,
  normalizeProgramState,
  cloneProgramState,
  type ProgramDay,
  type ProgramsState,
  type ProgramSlot,
  type ProgramState,
  type SavedProgram,
} from '@/lib/program';
import { getDefaultExerciseCatalogLink } from '@/lib/defaultExerciseCatalog';

export const PROGRAM_STORAGE_KEY = 'tl_program_v1';
export const PROGRAMS_STORAGE_KEY = 'tl_programs_v1';

function isProgramDay(value: unknown): value is ProgramDay {
  if (!value || typeof value !== 'object') return false;
  const day = value as Record<string, unknown>;
  return typeof day.id === 'string'
    && typeof day.name === 'string'
    && typeof day.label === 'string'
    && typeof day.session === 'string'
    && typeof day.color === 'string'
    && typeof day.tag === 'string'
    && typeof day.rest === 'boolean'
    && typeof day.sortOrder === 'number';
}

function isProgramSlot(value: unknown): value is ProgramSlot {
  if (!value || typeof value !== 'object') return false;
  const slot = value as Record<string, unknown>;
  const repRange = slot.repRange;
  return typeof slot.id === 'string'
    && typeof slot.dayId === 'string'
    && typeof slot.sortOrder === 'number'
    && typeof slot.assignmentId === 'string'
    && (slot.strengthSignalKey === null || (typeof slot.strengthSignalKey === 'string' && STRENGTH_LIFT_ORDER.includes(slot.strengthSignalKey as any)))
    && slot.progressionMode === DEFAULT_PROGRESSION_MODE
    && typeof slot.loadStep === 'number'
    && typeof slot.minSessionsBeforeStall === 'number'
    && typeof slot.stallThreshold === 'number'
    && typeof slot.deloadFactor === 'number'
    && typeof slot.exerciseName === 'string'
    && (slot.catalogExerciseId === null || typeof slot.catalogExerciseId === 'string' || typeof slot.catalogExerciseId === 'number')
    && (slot.exerciseSource === 'manual' || slot.exerciseSource === 'wger')
    && typeof slot.sets === 'number'
    && Array.isArray(repRange)
    && repRange.length === 2
    && typeof repRange[0] === 'number'
    && typeof repRange[1] === 'number'
    && typeof slot.restSeconds === 'number'
    && typeof slot.failure === 'boolean'
    && typeof slot.note === 'string'
    && Array.isArray(slot.primaryMuscles)
    && Array.isArray(slot.secondaryMuscles)
    && Array.isArray(slot.muscleGroups);
}

function upgradeProgramSlot(value: unknown): ProgramSlot | null {
  if (!value || typeof value !== 'object') return null;
  const slot = value as Record<string, unknown>;
  const repRange = Array.isArray(slot.repRange) ? slot.repRange : null;
  if (
    typeof slot.id !== 'string'
    || typeof slot.dayId !== 'string'
    || typeof slot.sortOrder !== 'number'
    || typeof slot.exerciseName !== 'string'
    || typeof slot.sets !== 'number'
    || !repRange
    || repRange.length !== 2
    || typeof repRange[0] !== 'number'
    || typeof repRange[1] !== 'number'
    || typeof slot.restSeconds !== 'number'
    || typeof slot.failure !== 'boolean'
    || typeof slot.note !== 'string'
    || !Array.isArray(slot.muscleGroups)
  ) {
    return null;
  }

  const baseSlot: ProgramSlot = {
    id: slot.id,
    dayId: slot.dayId,
    sortOrder: slot.sortOrder,
    assignmentId: typeof slot.assignmentId === 'string' ? slot.assignmentId : createAssignmentId(`assignment-${slot.id}`),
    strengthSignalKey: typeof slot.strengthSignalKey === 'string' && STRENGTH_LIFT_ORDER.includes(slot.strengthSignalKey as StrengthLiftKey)
      ? slot.strengthSignalKey as StrengthLiftKey
      : null,
    progressionMode: DEFAULT_PROGRESSION_MODE,
    loadStep: typeof slot.loadStep === 'number' ? Math.max(1, Math.round(slot.loadStep)) : DEFAULT_LOAD_STEP,
    minSessionsBeforeStall: typeof slot.minSessionsBeforeStall === 'number'
      ? Math.max(2, Math.round(slot.minSessionsBeforeStall))
      : DEFAULT_MIN_SESSIONS_BEFORE_STALL,
    stallThreshold: typeof slot.stallThreshold === 'number'
      ? Math.max(2, Math.round(slot.stallThreshold))
      : DEFAULT_STALL_THRESHOLD,
    deloadFactor: typeof slot.deloadFactor === 'number'
      ? Math.min(0.95, Math.max(0.7, Math.round(slot.deloadFactor * 100) / 100))
      : DEFAULT_DELOAD_FACTOR,
    exerciseName: slot.exerciseName,
    catalogExerciseId: typeof slot.catalogExerciseId === 'string' || typeof slot.catalogExerciseId === 'number'
      ? slot.catalogExerciseId
      : null,
    exerciseSource: slot.exerciseSource === 'wger' ? 'wger' : 'manual',
    exerciseImageUrl: typeof slot.exerciseImageUrl === 'string' ? slot.exerciseImageUrl : null,
    exerciseCategoryName: typeof slot.exerciseCategoryName === 'string' ? slot.exerciseCategoryName : null,
    primaryMuscles: Array.isArray(slot.primaryMuscles)
      ? slot.primaryMuscles.filter((entry): entry is string => typeof entry === 'string')
      : [],
    secondaryMuscles: Array.isArray(slot.secondaryMuscles)
      ? slot.secondaryMuscles.filter((entry): entry is string => typeof entry === 'string')
      : [],
    sets: slot.sets,
    repRange: [repRange[0], repRange[1]],
    restSeconds: slot.restSeconds,
    failure: slot.failure,
    note: slot.note,
    muscleGroups: slot.muscleGroups.filter((entry): entry is string => typeof entry === 'string'),
  };

  if (baseSlot.exerciseSource === 'manual' && baseSlot.catalogExerciseId === null) {
    const catalogLink = getDefaultExerciseCatalogLink(baseSlot.exerciseName);
    if (catalogLink) {
      return {
        ...baseSlot,
        catalogExerciseId: catalogLink.catalogExerciseId,
        exerciseSource: 'wger',
        exerciseCategoryName: baseSlot.exerciseCategoryName ?? catalogLink.exerciseCategoryName,
      };
    }
  }

  return baseSlot;
}

function upgradeProgramState(value: unknown): ProgramState | null {
  if (!value || typeof value !== 'object') return null;
  const state = value as Record<string, unknown>;
  if (
    state.version !== PROGRAM_BOOTSTRAP_VERSION
    || !Array.isArray(state.days)
    || !state.days.every(isProgramDay)
    || !Array.isArray(state.slots)
    || typeof state.updatedAt !== 'string'
  ) {
    return null;
  }

  const slots = state.slots.map(upgradeProgramSlot);
  if (slots.some(slot => !slot)) return null;

  return normalizeProgramState({
    version: PROGRAM_BOOTSTRAP_VERSION,
    days: state.days,
    slots: slots as ProgramSlot[],
    updatedAt: state.updatedAt,
  });
}

function isProgramState(value: unknown): value is ProgramState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  return state.version === PROGRAM_BOOTSTRAP_VERSION
    && Array.isArray(state.days)
    && state.days.every(isProgramDay)
    && Array.isArray(state.slots)
    && state.slots.every(isProgramSlot)
    && typeof state.updatedAt === 'string';
}

function isSavedProgram(value: unknown): value is SavedProgram {
  if (!value || typeof value !== 'object') return false;
  const program = value as Record<string, unknown>;
  return typeof program.id === 'string'
    && typeof program.name === 'string'
    && typeof program.description === 'string'
    && typeof program.createdAt === 'string'
    && typeof program.updatedAt === 'string'
    && (program.origin === 'seeded' || program.origin === 'user' || program.origin === 'duplicate')
    && isProgramState(program.program);
}

function isProgramsState(value: unknown): value is ProgramsState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  return state.version === PROGRAMS_LIBRARY_VERSION
    && typeof state.activeProgramId === 'string'
    && Array.isArray(state.programs)
    && state.programs.every(isSavedProgram)
    && typeof state.updatedAt === 'string';
}

function normalizeProgramsState(state: ProgramsState): ProgramsState {
  const programs = state.programs.map(program => ({
    ...program,
    name: program.origin === 'seeded' && (program.name === 'Default Program' || !program.name)
      ? DEFAULT_SEEDED_PROGRAM_NAME
      : program.name,
    description: program.origin === 'seeded' && (program.description === 'Your current active split' || !program.description)
      ? DEFAULT_SEEDED_PROGRAM_DESCRIPTION
      : program.description,
    updatedAt: typeof program.updatedAt === 'string' ? program.updatedAt : program.program.updatedAt,
    program: cloneProgramState(program.program),
  }));
  const activeProgramId = programs.some(program => program.id === state.activeProgramId)
    ? state.activeProgramId
    : programs[0]?.id ?? '';

  return {
    version: PROGRAMS_LIBRARY_VERSION,
    activeProgramId,
    programs,
    updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : programs[0]?.updatedAt ?? new Date().toISOString(),
  };
}

export async function hasStoredProgramState() {
  const value = await AsyncStorage.getItem(PROGRAMS_STORAGE_KEY);
  return !!value;
}

export async function saveProgramsState(state: ProgramsState) {
  const normalized = normalizeProgramsState(state);
  await AsyncStorage.setItem(PROGRAMS_STORAGE_KEY, JSON.stringify(normalized));
}

export async function loadProgramsState() {
  const programsValue = await AsyncStorage.getItem(PROGRAMS_STORAGE_KEY);
  if (programsValue) {
    try {
      const parsed = JSON.parse(programsValue);
      if (isProgramsState(parsed)) {
        const normalized = normalizeProgramsState(parsed);
        if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
          await saveProgramsState(normalized);
        }
        return normalized;
      }
    } catch {}
  }

  const singletonValue = await AsyncStorage.getItem(PROGRAM_STORAGE_KEY);
  if (singletonValue) {
    try {
      const parsed = JSON.parse(singletonValue);
      const upgraded = upgradeProgramState(parsed);
      if (upgraded && isProgramState(upgraded)) {
        const migrated = {
          version: PROGRAMS_LIBRARY_VERSION,
          activeProgramId: '',
          programs: [] as SavedProgram[],
          updatedAt: new Date().toISOString(),
        };
        const saved = createSavedProgram(upgraded, {
          name: DEFAULT_SEEDED_PROGRAM_NAME,
          description: DEFAULT_SEEDED_PROGRAM_DESCRIPTION,
          origin: 'seeded',
        });
        migrated.programs = [saved];
        migrated.activeProgramId = saved.id;
        await saveProgramsState(migrated);
        return migrated;
      }
    } catch {}
  }

  const bootstrap = createBootstrapProgramsState();
  await saveProgramsState(bootstrap);
  return bootstrap;
}

export async function loadProgramState() {
  const programsState = await loadProgramsState();
  const active = programsState.programs.find(program => program.id === programsState.activeProgramId) ?? programsState.programs[0];
  return active?.program ?? createBootstrapProgramState();
}

export async function saveProgramState(state: ProgramState) {
  const programsState = await loadProgramsState();
  const activeProgram = programsState.programs.find(program => program.id === programsState.activeProgramId);
  if (!activeProgram) {
    const replacement = createSavedProgram(state, {
      name: DEFAULT_SEEDED_PROGRAM_NAME,
      description: DEFAULT_SEEDED_PROGRAM_DESCRIPTION,
      origin: 'seeded',
    });
    await saveProgramsState({
      version: PROGRAMS_LIBRARY_VERSION,
      activeProgramId: replacement.id,
      programs: [replacement],
      updatedAt: replacement.updatedAt,
    });
    return;
  }

  const nextState = normalizeProgramsState({
    ...programsState,
    updatedAt: new Date().toISOString(),
    programs: programsState.programs.map(program => (
      program.id === activeProgram.id
        ? {
            ...program,
            updatedAt: new Date().toISOString(),
            program: normalizeProgramState(state),
          }
        : program
    )),
  });
  await saveProgramsState(nextState);
}

export async function resetActiveProgramToBootstrap() {
  const programsState = await loadProgramsState();
  const activeProgram = programsState.programs.find(program => program.id === programsState.activeProgramId);
  const bootstrapProgram = createBootstrapProgramState();

  if (!activeProgram) {
    const fallback = createSavedProgram(bootstrapProgram, {
      name: DEFAULT_SEEDED_PROGRAM_NAME,
      description: DEFAULT_SEEDED_PROGRAM_DESCRIPTION,
      origin: 'seeded',
    });
    const nextState = {
      version: PROGRAMS_LIBRARY_VERSION,
      activeProgramId: fallback.id,
      programs: [fallback],
      updatedAt: fallback.updatedAt,
    } satisfies ProgramsState;
    await saveProgramsState(nextState);
    return fallback.program;
  }

  const now = new Date().toISOString();
  const resetProgram = {
    ...activeProgram,
    updatedAt: now,
    program: {
      ...bootstrapProgram,
      updatedAt: now,
    },
  };

  await saveProgramsState({
    ...programsState,
    updatedAt: now,
    programs: programsState.programs.map(program => program.id === activeProgram.id ? resetProgram : program),
  });

  return resetProgram.program;
}

export async function resetProgramStateToBootstrap() {
  const bootstrap = createBootstrapProgramState();
  await saveProgramState(bootstrap);
  return bootstrap;
}
