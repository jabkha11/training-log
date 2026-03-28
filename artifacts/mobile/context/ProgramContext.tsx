import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { STRENGTH_LIFT_ORDER, type StrengthLiftKey } from '@/constants/heatmap';
import type { CatalogExercise } from '@/lib/catalog';
import {
  DEFAULT_DELOAD_FACTOR,
  DEFAULT_LOAD_STEP,
  DEFAULT_MIN_SESSIONS_BEFORE_STALL,
  DEFAULT_PROGRESSION_MODE,
  DEFAULT_STALL_THRESHOLD,
  MAX_PROGRAM_DAYS,
  cloneProgramState,
  createAssignmentId,
  createBootstrapProgramState,
  createProgramId,
  createSavedProgram,
  getProgramUpdatedAt,
  getProgramWeekdayLabel,
  getProgramWeekdayName,
  getSlotsForDay,
  normalizeDayOrders,
  normalizeProgramState,
  regenerateProgramStructureIds,
  sortProgramDays,
  type ProgramDay,
  type ProgramsState,
  type ProgramSlot,
  type ProgramState,
  type SavedProgram,
} from '@/lib/program';
import { loadProgramsState, resetActiveProgramToBootstrap, saveProgramsState } from '@/lib/programStorage';

type DayInput = Partial<Omit<ProgramDay, 'id' | 'sortOrder'>>;
type SlotInput = Partial<Omit<ProgramSlot, 'id' | 'dayId' | 'sortOrder'>>;
type ProgramMetaPatch = Partial<Pick<SavedProgram, 'name' | 'description'>>;

export interface ProgramContextValue {
  isLoaded: boolean;
  programState: ProgramState | null;
  programsState: ProgramsState | null;
  programs: SavedProgram[];
  activeProgram: SavedProgram | null;
  activeProgramId: string | null;
  getProgram: (programId: string) => SavedProgram | null;
  getProgramDays: (programId: string) => ProgramDay[];
  getProgramDaySlots: (programId: string, dayId: string) => ProgramSlot[];
  days: ProgramDay[];
  getDaySlots: (dayId: string) => ProgramSlot[];
  reloadFromStorage: () => Promise<void>;
  setActiveProgram: (programId: string) => void;
  createProgram: (input?: Partial<Pick<SavedProgram, 'name' | 'description'>>) => string;
  createProgramFromState: (
    program: ProgramState,
    input?: Partial<Pick<SavedProgram, 'name' | 'description' | 'origin'>>,
    options?: { setActive?: boolean }
  ) => string;
  updateProgramMeta: (programId: string, patch: ProgramMetaPatch) => void;
  duplicateProgram: (programId: string) => string | null;
  deleteProgram: (programId: string) => void;
  addDayToProgram: (programId: string, input?: DayInput) => string;
  addWorkoutDayToProgram: (programId: string) => string;
  addRestDayToProgram: (programId: string) => string;
  updateProgramDay: (programId: string, dayId: string, patch: DayInput) => void;
  removeProgramDay: (programId: string, dayId: string) => void;
  reorderProgramDays: (programId: string, dayIds: string[]) => void;
  moveProgramDay: (programId: string, dayId: string, direction: 'up' | 'down') => void;
  addProgramSlot: (programId: string, dayId: string, input?: SlotInput) => string;
  updateProgramSlot: (programId: string, slotId: string, patch: SlotInput) => void;
  removeProgramSlot: (programId: string, slotId: string) => void;
  duplicateProgramSlot: (programId: string, slotId: string) => string | null;
  reorderProgramSlots: (programId: string, dayId: string, slotIds: string[]) => void;
  moveProgramSlot: (programId: string, slotId: string, direction: 'up' | 'down') => void;
  assignProgramCatalogExercise: (programId: string, slotId: string, exercise: CatalogExercise) => void;
  clearProgramCatalogAssignment: (programId: string, slotId: string) => void;
  addDay: (input?: DayInput) => string;
  updateDay: (dayId: string, patch: DayInput) => void;
  removeDay: (dayId: string) => void;
  reorderDays: (dayIds: string[]) => void;
  moveDay: (dayId: string, direction: 'up' | 'down') => void;
  addSlot: (dayId: string, input?: SlotInput) => string;
  updateSlot: (slotId: string, patch: SlotInput) => void;
  removeSlot: (slotId: string) => void;
  duplicateSlot: (slotId: string) => string | null;
  reorderSlots: (dayId: string, slotIds: string[]) => void;
  moveSlot: (slotId: string, direction: 'up' | 'down') => void;
  assignCatalogExercise: (slotId: string, exercise: CatalogExercise) => void;
  clearCatalogAssignment: (slotId: string) => void;
  resetProgram: () => Promise<void>;
}

const ProgramContext = createContext<ProgramContextValue | null>(null);

function sanitizeRepRange(repRange: [number, number]): [number, number] {
  const min = Math.max(1, Math.round(repRange[0]));
  const max = Math.max(min, Math.round(repRange[1]));
  return [min, max];
}

function sanitizeDeloadFactor(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_DELOAD_FACTOR;
  return Math.min(0.95, Math.max(0.7, Math.round(value * 100) / 100));
}

function sanitizeSlot(slot: ProgramSlot): ProgramSlot {
  return {
    ...slot,
    assignmentId: slot.assignmentId || createAssignmentId(`assignment-${slot.id}`),
    strengthSignalKey: slot.strengthSignalKey && STRENGTH_LIFT_ORDER.includes(slot.strengthSignalKey)
      ? slot.strengthSignalKey
      : null,
    progressionMode: DEFAULT_PROGRESSION_MODE,
    loadStep: Math.max(1, Math.round(slot.loadStep || DEFAULT_LOAD_STEP)),
    minSessionsBeforeStall: Math.max(2, Math.round(slot.minSessionsBeforeStall || DEFAULT_MIN_SESSIONS_BEFORE_STALL)),
    stallThreshold: Math.max(2, Math.round(slot.stallThreshold || DEFAULT_STALL_THRESHOLD)),
    deloadFactor: sanitizeDeloadFactor(slot.deloadFactor ?? DEFAULT_DELOAD_FACTOR),
    exerciseName: slot.exerciseName.trim() || 'New Exercise',
    sets: Math.max(1, Math.round(slot.sets)),
    repRange: sanitizeRepRange(slot.repRange),
    restSeconds: Math.max(0, Math.round(slot.restSeconds)),
    note: slot.note ?? '',
    catalogExerciseId: slot.catalogExerciseId ?? null,
    exerciseSource: slot.exerciseSource === 'wger' ? 'wger' : 'manual',
    exerciseImageUrl: slot.exerciseImageUrl ?? null,
    exerciseCategoryName: slot.exerciseCategoryName ?? null,
    primaryMuscles: slot.primaryMuscles.map(group => group.trim()).filter(Boolean),
    secondaryMuscles: slot.secondaryMuscles.map(group => group.trim()).filter(Boolean),
    muscleGroups: slot.muscleGroups.map(group => group.trim()).filter(Boolean),
  };
}

function normalizeSavedProgram(program: SavedProgram): SavedProgram {
  const normalizedProgram = normalizeProgramState(program.program);
  return {
    ...program,
    updatedAt: program.updatedAt || normalizedProgram.updatedAt,
    program: normalizedProgram,
  };
}

function withProgramsTimestamp(state: ProgramsState): ProgramsState {
  const updatedAt = getProgramUpdatedAt();
  return {
    ...state,
    updatedAt,
    programs: state.programs.map(program => normalizeSavedProgram(program)),
  };
}

function getActiveProgramRecord(state: ProgramsState | null) {
  if (!state) return null;
  return state.programs.find(program => program.id === state.activeProgramId) ?? state.programs[0] ?? null;
}

function getProgramRecord(state: ProgramsState | null, programId: string) {
  if (!state) return null;
  return state.programs.find(program => program.id === programId) ?? null;
}

function updateProgramById(
  state: ProgramsState,
  programId: string,
  updater: (program: SavedProgram) => SavedProgram,
): ProgramsState {
  const target = getProgramRecord(state, programId);
  if (!target) return state;
  const now = getProgramUpdatedAt();
  return withProgramsTimestamp({
    ...state,
    updatedAt: now,
    programs: state.programs.map(program => (
      program.id === target.id
        ? {
            ...updater(program),
            updatedAt: now,
          }
        : program
    )),
  });
}

function updateActiveProgram(state: ProgramsState, updater: (program: SavedProgram) => SavedProgram): ProgramsState {
  const active = getActiveProgramRecord(state);
  if (!active) return state;
  return updateProgramById(state, active.id, updater);
}

function makeUniqueProgramName(existing: SavedProgram[], base: string) {
  const names = new Set(existing.map(program => program.name));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function applyDaySequence(days: ProgramDay[]) {
  return days.map((day, index) => ({
    ...day,
    name: getProgramWeekdayName(index),
    label: getProgramWeekdayLabel(index),
    sortOrder: index,
  }));
}

export function ProgramProvider({ children }: { children: React.ReactNode }) {
  const [programsState, setProgramsState] = useState<ProgramsState | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const reloadFromStorage = useCallback(async () => {
    const state = await loadProgramsState();
    setProgramsState(state);
  }, []);

  useEffect(() => {
    let mounted = true;
    loadProgramsState().then(state => {
      if (!mounted) return;
      setProgramsState(state);
    }).catch(() => {
      if (!mounted) return;
      setProgramsState(null);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const persistState = useCallback((nextState: ProgramsState) => {
    setProgramsState(nextState);
    writeQueueRef.current = writeQueueRef.current
      .then(() => saveProgramsState(nextState))
      .catch(() => saveProgramsState(nextState));
  }, []);

  const mutateState = useCallback((updater: (current: ProgramsState) => ProgramsState) => {
    setProgramsState(current => {
      if (!current) return current;
      const nextState = updater(current);
      writeQueueRef.current = writeQueueRef.current
        .then(() => saveProgramsState(nextState))
        .catch(() => saveProgramsState(nextState));
      return nextState;
    });
  }, []);

  const activeProgram = useMemo(() => getActiveProgramRecord(programsState), [programsState]);
  const programState = activeProgram?.program ?? null;
  const programs = useMemo(() => programsState?.programs ?? [], [programsState]);
  const days = useMemo(() => (programState ? sortProgramDays(programState.days) : []), [programState]);
  const getProgram = useCallback((programId: string) => getProgramRecord(programsState, programId), [programsState]);

  const getProgramDays = useCallback((programId: string) => {
    const program = getProgramRecord(programsState, programId);
    return program ? sortProgramDays(program.program.days) : [];
  }, [programsState]);

  const getProgramDaySlots = useCallback((programId: string, dayId: string) => {
    const program = getProgramRecord(programsState, programId);
    if (!program) return [];
    return getSlotsForDay(program.program.slots, dayId);
  }, [programsState]);

  const getDaySlots = useCallback((dayId: string) => {
    if (!programState) return [];
    return getSlotsForDay(programState.slots, dayId);
  }, [programState]);

  const setActiveProgram = useCallback((programId: string) => {
    mutateState(current => {
      if (!current.programs.some(program => program.id === programId)) return current;
      return withProgramsTimestamp({
        ...current,
        activeProgramId: programId,
      });
    });
  }, [mutateState]);

  const createProgram = useCallback((input?: Partial<Pick<SavedProgram, 'name' | 'description'>>) => {
    const nextProgramId = createProgramId('saved-program');
    mutateState(current => {
      const program = createSavedProgram(regenerateProgramStructureIds(createBootstrapProgramState()), {
        id: nextProgramId,
        name: makeUniqueProgramName(current.programs, input?.name?.trim() || 'New Program'),
        description: input?.description?.trim() || 'A fresh program you can edit before activating',
        origin: 'user',
      });
      return withProgramsTimestamp({
        ...current,
        programs: [...current.programs, program],
      });
    });
    return nextProgramId;
  }, [mutateState]);

  const createProgramFromState = useCallback((
    programStateInput: ProgramState,
    input?: Partial<Pick<SavedProgram, 'name' | 'description' | 'origin'>>,
    options?: { setActive?: boolean },
  ) => {
    const nextProgramId = createProgramId('saved-program');
    mutateState(current => {
      const program = createSavedProgram(regenerateProgramStructureIds(programStateInput), {
        id: nextProgramId,
        name: makeUniqueProgramName(current.programs, input?.name?.trim() || 'New Program'),
        description: input?.description?.trim() || 'A fresh program you can edit before activating',
        origin: input?.origin ?? 'user',
      });
      return withProgramsTimestamp({
        ...current,
        activeProgramId: options?.setActive ? program.id : current.activeProgramId,
        programs: [...current.programs, program],
      });
    });
    return nextProgramId;
  }, [mutateState]);

  const updateProgramMeta = useCallback((programId: string, patch: ProgramMetaPatch) => {
    mutateState(current => withProgramsTimestamp({
      ...current,
      programs: current.programs.map(program => (
        program.id === programId
          ? {
              ...program,
              name: patch.name?.trim() || program.name,
              description: patch.description?.trim() ?? program.description,
            }
          : program
      )),
    }));
  }, [mutateState]);

  const duplicateProgram = useCallback((programId: string) => {
    let duplicatedId: string | null = null;
    mutateState(current => {
      const target = current.programs.find(program => program.id === programId);
      if (!target) return current;
      duplicatedId = createProgramId('saved-program');
      const duplicated = createSavedProgram(regenerateProgramStructureIds(target.program), {
        id: duplicatedId,
        name: makeUniqueProgramName(current.programs, `${target.name} Copy`),
        description: target.description || 'Duplicated program',
        origin: 'duplicate',
      });
      return withProgramsTimestamp({
        ...current,
        programs: [...current.programs, duplicated],
      });
    });
    return duplicatedId;
  }, [mutateState]);

  const deleteProgram = useCallback((programId: string) => {
    mutateState(current => {
      if (current.programs.length <= 1) return current;
      const targetIndex = current.programs.findIndex(program => program.id === programId);
      if (targetIndex === -1) return current;
      const remaining = current.programs.filter(program => program.id !== programId);
      const nextActiveProgramId = current.activeProgramId === programId
        ? (remaining[targetIndex] ?? remaining[targetIndex - 1] ?? remaining[0]).id
        : current.activeProgramId;
      return withProgramsTimestamp({
        ...current,
        activeProgramId: nextActiveProgramId,
        programs: remaining,
      });
    });
  }, [mutateState]);

  const addDayToProgram = useCallback((programId: string, input?: DayInput) => {
    const dayId = createProgramId('program-day');
    let created = false;
    mutateState(current => updateProgramById(current, programId, program => {
      const orderedDays = sortProgramDays(program.program.days);
      if (orderedDays.length >= MAX_PROGRAM_DAYS) return program;
      const dayCount = orderedDays.length;
      const nextDay: ProgramDay = {
        id: dayId,
        name: input?.name ?? '',
        label: input?.label ?? '',
        session: input?.session ?? `Session ${dayCount + 1}`,
        color: input?.color ?? '#52b8ff',
        tag: input?.tag ?? 'Custom Program Day',
        protocol: input?.protocol ?? '',
        rest: input?.rest ?? false,
        sortOrder: orderedDays.length,
      };
      created = true;
      return {
        ...program,
        program: {
          ...program.program,
          updatedAt: getProgramUpdatedAt(),
          days: normalizeDayOrders([...program.program.days, nextDay]),
        },
      };
    }));
    return created ? dayId : '';
  }, [mutateState]);

  const addWorkoutDayToProgram = useCallback((programId: string) => (
    addDayToProgram(programId, {
      session: 'New Session',
      tag: 'Workout Day',
      color: '#52b8ff',
      rest: false,
    })
  ), [addDayToProgram]);

  const addRestDayToProgram = useCallback((programId: string) => (
    addDayToProgram(programId, {
      session: 'Rest Day',
      tag: 'Rest Day',
      color: '#f0ede8',
      rest: true,
    })
  ), [addDayToProgram]);

  const updateProgramDay = useCallback((programId: string, dayId: string, patch: DayInput) => {
    mutateState(current => updateProgramById(current, programId, program => ({
      ...program,
      program: {
        ...program.program,
        updatedAt: getProgramUpdatedAt(),
        days: program.program.days.map(day => (
          day.id === dayId
            ? { ...day, ...patch, protocol: patch.protocol ?? day.protocol ?? '' }
            : day
        )),
      },
    })));
  }, [mutateState]);

  const removeProgramDay = useCallback((programId: string, dayId: string) => {
    mutateState(current => updateProgramById(current, programId, program => {
      if (program.program.days.length <= 1) return program;
      return {
        ...program,
        program: {
          ...program.program,
          updatedAt: getProgramUpdatedAt(),
          days: normalizeDayOrders(program.program.days.filter(day => day.id !== dayId)),
          slots: program.program.slots.filter(slot => slot.dayId !== dayId),
        },
      };
    }));
  }, [mutateState]);

  const reorderProgramDays = useCallback((programId: string, dayIds: string[]) => {
    mutateState(current => updateProgramById(current, programId, program => {
      const byId = new Map(program.program.days.map(day => [day.id, day]));
      const ordered = dayIds.map(id => byId.get(id)).filter((day): day is ProgramDay => !!day);
      const remainder = program.program.days.filter(day => !dayIds.includes(day.id));
      return {
        ...program,
        program: {
          ...program.program,
          updatedAt: getProgramUpdatedAt(),
          days: applyDaySequence([...ordered, ...sortProgramDays(remainder)]),
        },
      };
    }));
  }, [mutateState]);

  const moveProgramDay = useCallback((programId: string, dayId: string, direction: 'up' | 'down') => {
    mutateState(current => updateProgramById(current, programId, program => {
      const ordered = sortProgramDays(program.program.days);
      const index = ordered.findIndex(day => day.id === dayId);
      if (index === -1) return program;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= ordered.length) return program;
      const next = ordered.slice();
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return {
        ...program,
        program: {
          ...program.program,
          updatedAt: getProgramUpdatedAt(),
          days: applyDaySequence(next),
        },
      };
    }));
  }, [mutateState]);

  const addProgramSlot = useCallback((programId: string, dayId: string, input?: SlotInput) => {
    const slotId = createProgramId('program-slot');
    mutateState(current => updateProgramById(current, programId, program => {
      const daySlots = getSlotsForDay(program.program.slots, dayId);
      const last = daySlots[daySlots.length - 1];
      const nextSlot: ProgramSlot = sanitizeSlot({
        id: slotId,
        dayId,
        sortOrder: daySlots.length,
        assignmentId: input?.assignmentId ?? createAssignmentId(`assignment-${slotId}`),
        strengthSignalKey: input?.strengthSignalKey ?? last?.strengthSignalKey ?? null,
        progressionMode: input?.progressionMode ?? last?.progressionMode ?? DEFAULT_PROGRESSION_MODE,
        loadStep: input?.loadStep ?? last?.loadStep ?? DEFAULT_LOAD_STEP,
        minSessionsBeforeStall: input?.minSessionsBeforeStall ?? last?.minSessionsBeforeStall ?? DEFAULT_MIN_SESSIONS_BEFORE_STALL,
        stallThreshold: input?.stallThreshold ?? last?.stallThreshold ?? DEFAULT_STALL_THRESHOLD,
        deloadFactor: input?.deloadFactor ?? last?.deloadFactor ?? DEFAULT_DELOAD_FACTOR,
        exerciseName: input?.exerciseName ?? 'New Exercise',
        catalogExerciseId: input?.catalogExerciseId ?? null,
        exerciseSource: input?.exerciseSource ?? 'manual',
        exerciseImageUrl: input?.exerciseImageUrl ?? null,
        exerciseCategoryName: input?.exerciseCategoryName ?? null,
        primaryMuscles: input?.primaryMuscles ?? [],
        secondaryMuscles: input?.secondaryMuscles ?? [],
        sets: input?.sets ?? last?.sets ?? 3,
        repRange: input?.repRange ?? last?.repRange ?? [8, 12],
        restSeconds: input?.restSeconds ?? last?.restSeconds ?? 90,
        failure: input?.failure ?? last?.failure ?? false,
        note: input?.note ?? '',
        muscleGroups: input?.muscleGroups ?? [],
      });
      return {
        ...program,
        program: {
          ...program.program,
          updatedAt: getProgramUpdatedAt(),
          slots: normalizeProgramState({
            ...program.program,
            slots: [...program.program.slots, nextSlot],
          }).slots,
        },
      };
    }));
    return slotId;
  }, [mutateState]);

  const updateProgramSlot = useCallback((programId: string, slotId: string, patch: SlotInput) => {
    mutateState(current => updateProgramById(current, programId, program => ({
      ...program,
      program: {
        ...program.program,
        updatedAt: getProgramUpdatedAt(),
        slots: program.program.slots.map(slot => (
          slot.id === slotId ? sanitizeSlot({ ...slot, ...patch }) : slot
        )),
      },
    })));
  }, [mutateState]);

  const removeProgramSlot = useCallback((programId: string, slotId: string) => {
    mutateState(current => updateProgramById(current, programId, program => ({
      ...program,
      program: {
        ...program.program,
        updatedAt: getProgramUpdatedAt(),
        slots: program.program.slots.filter(slot => slot.id !== slotId),
      },
    })));
  }, [mutateState]);

  const duplicateProgramSlot = useCallback((programId: string, slotId: string) => {
    let duplicatedId: string | null = null;
    mutateState(current => updateProgramById(current, programId, program => {
      const slot = program.program.slots.find(entry => entry.id === slotId);
      if (!slot) return program;
      duplicatedId = createProgramId('program-slot');
      const daySlots = getSlotsForDay(program.program.slots, slot.dayId);
      const index = daySlots.findIndex(entry => entry.id === slotId);
      const nextDaySlots = daySlots.slice();
      const clone = sanitizeSlot({
        ...slot,
        id: duplicatedId,
        assignmentId: createAssignmentId(`assignment-${duplicatedId}`),
        exerciseName: `${slot.exerciseName} Copy`,
      });
      nextDaySlots.splice(index + 1, 0, clone);
      return {
        ...program,
        program: {
          ...program.program,
          updatedAt: getProgramUpdatedAt(),
          slots: normalizeProgramState({
            ...program.program,
            slots: [
              ...program.program.slots.filter(entry => entry.dayId !== slot.dayId),
              ...nextDaySlots,
            ],
          }).slots,
        },
      };
    }));
    return duplicatedId;
  }, [mutateState]);

  const reorderProgramSlots = useCallback((programId: string, dayId: string, slotIds: string[]) => {
    mutateState(current => updateProgramById(current, programId, program => {
      const daySlots = getSlotsForDay(program.program.slots, dayId);
      const byId = new Map(daySlots.map(slot => [slot.id, slot]));
      const ordered = slotIds.map(id => byId.get(id)).filter((slot): slot is ProgramSlot => !!slot);
      const remainder = daySlots.filter(slot => !slotIds.includes(slot.id));
      return {
        ...program,
        program: {
          ...program.program,
          updatedAt: getProgramUpdatedAt(),
          slots: normalizeProgramState({
            ...program.program,
            slots: [
              ...program.program.slots.filter(slot => slot.dayId !== dayId),
              ...ordered,
              ...remainder,
            ],
          }).slots,
        },
      };
    }));
  }, [mutateState]);

  const moveProgramSlot = useCallback((programId: string, slotId: string, direction: 'up' | 'down') => {
    mutateState(current => updateProgramById(current, programId, program => {
      const slot = program.program.slots.find(entry => entry.id === slotId);
      if (!slot) return program;
      const daySlots = getSlotsForDay(program.program.slots, slot.dayId);
      const index = daySlots.findIndex(entry => entry.id === slotId);
      if (index === -1) return program;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= daySlots.length) return program;
      const nextDaySlots = daySlots.slice();
      const [moved] = nextDaySlots.splice(index, 1);
      nextDaySlots.splice(targetIndex, 0, moved);
      const resequencedDaySlots = nextDaySlots.map((entry, nextIndex) => ({
        ...entry,
        sortOrder: nextIndex,
      }));
      return {
        ...program,
        program: {
          ...program.program,
          updatedAt: getProgramUpdatedAt(),
          slots: normalizeProgramState({
            ...program.program,
            slots: [
              ...program.program.slots.filter(entry => entry.dayId !== slot.dayId),
              ...resequencedDaySlots,
            ],
          }).slots,
        },
      };
    }));
  }, [mutateState]);

  const assignProgramCatalogExercise = useCallback((programId: string, slotId: string, exercise: CatalogExercise) => {
    mutateState(current => updateProgramById(current, programId, program => ({
      ...program,
      program: {
        ...program.program,
        updatedAt: getProgramUpdatedAt(),
        slots: program.program.slots.map(slot => {
          if (slot.id !== slotId) return slot;
          return sanitizeSlot({
            ...slot,
            assignmentId: createAssignmentId(`assignment-${slot.id}`),
            exerciseName: exercise.name,
            catalogExerciseId: exercise.wgerId,
            exerciseSource: 'wger',
            exerciseImageUrl: exercise.imageUrls[0] ?? null,
            exerciseCategoryName: exercise.category?.name ?? null,
            primaryMuscles: exercise.mappedPrimaryMuscles,
            secondaryMuscles: exercise.mappedSecondaryMuscles,
            muscleGroups: Array.from(new Set([...exercise.mappedPrimaryMuscles, ...exercise.mappedSecondaryMuscles])),
          });
        }),
      },
    })));
  }, [mutateState]);

  const clearProgramCatalogAssignment = useCallback((programId: string, slotId: string) => {
    mutateState(current => updateProgramById(current, programId, program => ({
      ...program,
      program: {
        ...program.program,
        updatedAt: getProgramUpdatedAt(),
        slots: program.program.slots.map(slot => {
          if (slot.id !== slotId) return slot;
          return sanitizeSlot({
            ...slot,
            assignmentId: createAssignmentId(`assignment-${slot.id}`),
            catalogExerciseId: null,
            exerciseSource: 'manual',
            exerciseImageUrl: null,
            exerciseCategoryName: null,
            primaryMuscles: [],
            secondaryMuscles: [],
          });
        }),
      },
    })));
  }, [mutateState]);

  const addDay = useCallback((input?: DayInput) => (
    activeProgram?.id ? addDayToProgram(activeProgram.id, input) : ''
  ), [activeProgram?.id, addDayToProgram]);

  const updateDay = useCallback((dayId: string, patch: DayInput) => {
    if (!activeProgram?.id) return;
    updateProgramDay(activeProgram.id, dayId, patch);
  }, [activeProgram?.id, updateProgramDay]);

  const removeDay = useCallback((dayId: string) => {
    if (!activeProgram?.id) return;
    removeProgramDay(activeProgram.id, dayId);
  }, [activeProgram?.id, removeProgramDay]);

  const reorderDays = useCallback((dayIds: string[]) => {
    if (!activeProgram?.id) return;
    reorderProgramDays(activeProgram.id, dayIds);
  }, [activeProgram?.id, reorderProgramDays]);

  const moveDay = useCallback((dayId: string, direction: 'up' | 'down') => {
    if (!activeProgram?.id) return;
    moveProgramDay(activeProgram.id, dayId, direction);
  }, [activeProgram?.id, moveProgramDay]);

  const addSlot = useCallback((dayId: string, input?: SlotInput) => (
    activeProgram?.id ? addProgramSlot(activeProgram.id, dayId, input) : ''
  ), [activeProgram?.id, addProgramSlot]);

  const updateSlot = useCallback((slotId: string, patch: SlotInput) => {
    if (!activeProgram?.id) return;
    updateProgramSlot(activeProgram.id, slotId, patch);
  }, [activeProgram?.id, updateProgramSlot]);

  const removeSlot = useCallback((slotId: string) => {
    if (!activeProgram?.id) return;
    removeProgramSlot(activeProgram.id, slotId);
  }, [activeProgram?.id, removeProgramSlot]);

  const duplicateSlot = useCallback((slotId: string) => (
    activeProgram?.id ? duplicateProgramSlot(activeProgram.id, slotId) : null
  ), [activeProgram?.id, duplicateProgramSlot]);

  const reorderSlots = useCallback((dayId: string, slotIds: string[]) => {
    if (!activeProgram?.id) return;
    reorderProgramSlots(activeProgram.id, dayId, slotIds);
  }, [activeProgram?.id, reorderProgramSlots]);

  const moveSlot = useCallback((slotId: string, direction: 'up' | 'down') => {
    if (!activeProgram?.id) return;
    moveProgramSlot(activeProgram.id, slotId, direction);
  }, [activeProgram?.id, moveProgramSlot]);

  const assignCatalogExercise = useCallback((slotId: string, exercise: CatalogExercise) => {
    if (!activeProgram?.id) return;
    assignProgramCatalogExercise(activeProgram.id, slotId, exercise);
  }, [activeProgram?.id, assignProgramCatalogExercise]);

  const clearCatalogAssignment = useCallback((slotId: string) => {
    if (!activeProgram?.id) return;
    clearProgramCatalogAssignment(activeProgram.id, slotId);
  }, [activeProgram?.id, clearProgramCatalogAssignment]);

  const resetProgram = useCallback(async () => {
    const bootstrap = await resetActiveProgramToBootstrap();
    setProgramsState(current => {
      if (!current) return current;
      return updateActiveProgram(current, program => ({
        ...program,
        program: bootstrap,
      }));
    });
    const nextState = await loadProgramsState();
    persistState(nextState);
  }, [persistState]);

  const value = useMemo<ProgramContextValue>(() => ({
    isLoaded: !!programsState,
    programState,
    programsState,
    programs,
    activeProgram,
    activeProgramId: activeProgram?.id ?? null,
    getProgram,
    getProgramDays,
    getProgramDaySlots,
    days,
    getDaySlots,
    reloadFromStorage,
    setActiveProgram,
    createProgram,
    createProgramFromState,
    updateProgramMeta,
    duplicateProgram,
    deleteProgram,
    addDayToProgram,
    addWorkoutDayToProgram,
    addRestDayToProgram,
    updateProgramDay,
    removeProgramDay,
    reorderProgramDays,
    moveProgramDay,
    addProgramSlot,
    updateProgramSlot,
    removeProgramSlot,
    duplicateProgramSlot,
    reorderProgramSlots,
    moveProgramSlot,
    assignProgramCatalogExercise,
    clearProgramCatalogAssignment,
    addDay,
    updateDay,
    removeDay,
    reorderDays,
    moveDay,
    addSlot,
    updateSlot,
    removeSlot,
    duplicateSlot,
    reorderSlots,
    moveSlot,
    assignCatalogExercise,
    clearCatalogAssignment,
    resetProgram,
  }), [
    activeProgram,
    addDay,
    addSlot,
    assignCatalogExercise,
    clearCatalogAssignment,
    createProgram,
    createProgramFromState,
    days,
    deleteProgram,
    addRestDayToProgram,
    duplicateProgram,
    duplicateProgramSlot,
    duplicateSlot,
    getProgram,
    getProgramDaySlots,
    getProgramDays,
    getDaySlots,
    moveDay,
    moveProgramDay,
    moveProgramSlot,
    moveSlot,
    addDayToProgram,
    addWorkoutDayToProgram,
    addProgramSlot,
    programState,
    programs,
    programsState,
    reloadFromStorage,
    removeProgramDay,
    removeProgramSlot,
    removeDay,
    removeSlot,
    reorderProgramDays,
    reorderProgramSlots,
    reorderDays,
    reorderSlots,
    resetProgram,
    setActiveProgram,
    assignProgramCatalogExercise,
    clearProgramCatalogAssignment,
    updateDay,
    updateProgramDay,
    updateProgramMeta,
    updateProgramSlot,
    updateSlot,
  ]);

  return <ProgramContext.Provider value={value}>{children}</ProgramContext.Provider>;
}

export function useProgram() {
  const ctx = useContext(ProgramContext);
  if (!ctx) throw new Error('useProgram must be used within ProgramProvider');
  return ctx;
}
