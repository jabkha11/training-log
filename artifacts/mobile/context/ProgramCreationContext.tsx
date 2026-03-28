import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { CatalogExercise } from '@/lib/catalog';
import { getDefaultExerciseCatalogLink } from '@/lib/defaultExerciseCatalog';
import {
  DEFAULT_DELOAD_FACTOR,
  DEFAULT_LOAD_STEP,
  DEFAULT_MIN_SESSIONS_BEFORE_STALL,
  DEFAULT_PROGRESSION_MODE,
  DEFAULT_STALL_THRESHOLD,
  createAssignmentId,
  createProgramId,
  getProgramUpdatedAt,
  getSlotsForDay,
  normalizeDayOrders,
  normalizeProgramState,
  type ProgramDay,
  type ProgramSlot,
} from '@/lib/program';
import {
  clearProgramCreationDraft,
  loadOrCreateProgramCreationDraft,
  saveProgramCreationDraft,
} from '@/lib/programCreationStorage';
import {
  createDraftProgramState,
  createProgramCreationDraft,
  listDraftTrainingDays,
  type ProgramCreationBasics,
  type ProgramCreationDraft,
  type ProgramCreationStep,
} from '@/lib/programCreation';
import { useProgram } from '@/context/ProgramContext';

type DayPatch = Partial<Omit<ProgramDay, 'id' | 'sortOrder' | 'name' | 'label'>>;
type SlotPatch = Partial<Omit<ProgramSlot, 'id' | 'dayId' | 'sortOrder'>>;

interface ProgramCreationContextValue {
  isLoaded: boolean;
  draft: ProgramCreationDraft | null;
  trainingDays: ProgramDay[];
  getDaySlots: (dayId: string) => ProgramSlot[];
  ensureDraft: () => Promise<void>;
  updateBasics: (basics: ProgramCreationBasics, step?: ProgramCreationStep) => void;
  setCurrentStep: (step: ProgramCreationStep, dayIndex?: number) => void;
  updateDay: (dayId: string, patch: DayPatch) => void;
  reorderDays: (dayIds: string[]) => void;
  toggleRestDay: (dayId: string, nextRest: boolean) => void;
  addSlot: (dayId: string) => string;
  updateSlot: (slotId: string, patch: SlotPatch) => void;
  removeSlot: (slotId: string) => void;
  moveSlot: (slotId: string, direction: 'up' | 'down') => void;
  assignCatalogExercise: (slotId: string, exercise: CatalogExercise) => void;
  clearCatalogAssignment: (slotId: string) => void;
  setManualExerciseName: (slotId: string, name: string) => void;
  discardDraft: () => Promise<void>;
  finalizeDraft: (makeActive: boolean) => Promise<string | null>;
}

const ProgramCreationContext = createContext<ProgramCreationContextValue | null>(null);

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
    progressionMode: DEFAULT_PROGRESSION_MODE,
    loadStep: Math.max(1, Math.round(slot.loadStep || DEFAULT_LOAD_STEP)),
    minSessionsBeforeStall: Math.max(2, Math.round(slot.minSessionsBeforeStall || DEFAULT_MIN_SESSIONS_BEFORE_STALL)),
    stallThreshold: Math.max(2, Math.round(slot.stallThreshold || DEFAULT_STALL_THRESHOLD)),
    deloadFactor: sanitizeDeloadFactor(slot.deloadFactor ?? DEFAULT_DELOAD_FACTOR),
    exerciseName: slot.exerciseName.trim() || 'New Exercise',
    repRange: sanitizeRepRange(slot.repRange),
    sets: Math.max(1, Math.round(slot.sets)),
    restSeconds: Math.max(0, Math.round(slot.restSeconds)),
    note: slot.note ?? '',
    catalogExerciseId: slot.catalogExerciseId ?? null,
    exerciseSource: slot.exerciseSource === 'wger' ? 'wger' : 'manual',
    exerciseImageUrl: slot.exerciseImageUrl ?? null,
    exerciseCategoryName: slot.exerciseCategoryName ?? null,
    primaryMuscles: slot.primaryMuscles.map(entry => entry.trim()).filter(Boolean),
    secondaryMuscles: slot.secondaryMuscles.map(entry => entry.trim()).filter(Boolean),
    muscleGroups: slot.muscleGroups.map(entry => entry.trim()).filter(Boolean),
  };
}

function createEmptySlot(dayId: string, sortOrder: number): ProgramSlot {
  return sanitizeSlot({
    id: createProgramId('draft-slot'),
    dayId,
    sortOrder,
    assignmentId: createAssignmentId('draft-assignment'),
    strengthSignalKey: null,
    progressionMode: DEFAULT_PROGRESSION_MODE,
    loadStep: DEFAULT_LOAD_STEP,
    minSessionsBeforeStall: DEFAULT_MIN_SESSIONS_BEFORE_STALL,
    stallThreshold: DEFAULT_STALL_THRESHOLD,
    deloadFactor: DEFAULT_DELOAD_FACTOR,
    exerciseName: 'New Exercise',
    catalogExerciseId: null,
    exerciseSource: 'manual',
    exerciseImageUrl: null,
    exerciseCategoryName: null,
    primaryMuscles: [],
    secondaryMuscles: [],
    sets: 3,
    repRange: [8, 12],
    restSeconds: 90,
    failure: false,
    note: '',
    muscleGroups: [],
  });
}

export function ProgramCreationProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<ProgramCreationDraft | null | undefined>(undefined);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const { createProgramFromState } = useProgram();

  const persistDraft = useCallback((nextDraft: ProgramCreationDraft | null) => {
    setDraft(nextDraft);
    writeQueueRef.current = writeQueueRef.current.then(async () => {
      if (nextDraft) {
        await saveProgramCreationDraft(nextDraft);
      } else {
        await clearProgramCreationDraft();
      }
    }).catch(async () => {
      if (nextDraft) {
        await saveProgramCreationDraft(nextDraft);
      } else {
        await clearProgramCreationDraft();
      }
    });
  }, []);

  const mutateDraft = useCallback((updater: (current: ProgramCreationDraft) => ProgramCreationDraft) => {
    setDraft(current => {
      if (!current) return current;
      const nextDraft = updater(current);
      writeQueueRef.current = writeQueueRef.current.then(() => saveProgramCreationDraft(nextDraft)).catch(() => saveProgramCreationDraft(nextDraft));
      return nextDraft;
    });
  }, []);

  const ensureDraft = useCallback(async () => {
    if (draft !== undefined) return;
    try {
      const loaded = await loadOrCreateProgramCreationDraft();
      persistDraft(loaded);
    } catch {
      persistDraft(createProgramCreationDraft());
    }
  }, [draft, persistDraft]);

  const trainingDays = useMemo(() => (draft ? listDraftTrainingDays(draft.program) : []), [draft]);

  const getDaySlots = useCallback((dayId: string) => {
    if (!draft) return [];
    return getSlotsForDay(draft.program.slots, dayId);
  }, [draft]);

  const setCurrentStep = useCallback((step: ProgramCreationStep, dayIndex = 0) => {
    mutateDraft(current => ({
      ...current,
      currentStep: step,
      activeDayIndex: Math.max(0, dayIndex),
      updatedAt: getProgramUpdatedAt(),
    }));
  }, [mutateDraft]);

  const updateBasics = useCallback((basics: ProgramCreationBasics, step: ProgramCreationStep = 'structure') => {
    const nextProgram = createDraftProgramState({
      ...basics,
      includeRestDays: true,
    });
    persistDraft({
      version: 1,
      currentStep: step,
      activeDayIndex: 0,
      basics: {
        ...basics,
        includeRestDays: true,
      },
      program: nextProgram,
      updatedAt: getProgramUpdatedAt(),
    });
  }, [persistDraft]);

  const updateDay = useCallback((dayId: string, patch: DayPatch) => {
    mutateDraft(current => ({
      ...current,
      updatedAt: getProgramUpdatedAt(),
      program: normalizeProgramState({
        ...current.program,
        updatedAt: getProgramUpdatedAt(),
        days: current.program.days.map(day => (
          day.id === dayId
            ? {
                ...day,
                ...patch,
                protocol: patch.protocol ?? day.protocol ?? '',
              }
            : day
        )),
      }),
    }));
  }, [mutateDraft]);

  const reorderDays = useCallback((dayIds: string[]) => {
    mutateDraft(current => {
      const dayMap = new Map(current.program.days.map(day => [day.id, day]));
      const ordered = dayIds
        .map(id => dayMap.get(id))
        .filter((day): day is ProgramDay => !!day)
        .map((day, index) => ({
          ...day,
          sortOrder: index,
        }));
      if (ordered.length !== current.program.days.length) return current;

      return {
        ...current,
        updatedAt: getProgramUpdatedAt(),
        program: normalizeProgramState({
          ...current.program,
          updatedAt: getProgramUpdatedAt(),
          days: normalizeDayOrders(ordered),
        }),
      };
    });
  }, [mutateDraft]);

  const toggleRestDay = useCallback((dayId: string, nextRest: boolean) => {
    mutateDraft(current => {
      const target = current.program.days.find(day => day.id === dayId);
      if (!target || target.rest === nextRest) return current;
      const nextSlots = nextRest
        ? current.program.slots.filter(slot => slot.dayId !== dayId)
        : current.program.slots.length === current.program.slots.filter(slot => slot.dayId !== dayId).length
          ? [...current.program.slots, createEmptySlot(dayId, 0)]
          : current.program.slots;

      return {
        ...current,
        updatedAt: getProgramUpdatedAt(),
        program: normalizeProgramState({
          ...current.program,
          updatedAt: getProgramUpdatedAt(),
          days: current.program.days.map(day => (
            day.id === dayId
              ? {
                  ...day,
                  rest: nextRest,
                  session: nextRest ? 'Rest Day' : (day.session === 'Rest Day' ? 'New Session' : day.session),
                  tag: nextRest ? 'Rest Day' : 'Workout Day',
                  color: nextRest ? '#f0ede8' : '#52b8ff',
                }
              : day
          )),
          slots: nextSlots,
        }),
      };
    });
  }, [mutateDraft]);

  const addSlot = useCallback((dayId: string) => {
    const slotId = createProgramId('draft-slot');
    mutateDraft(current => ({
      ...current,
      updatedAt: getProgramUpdatedAt(),
      program: normalizeProgramState({
        ...current.program,
        updatedAt: getProgramUpdatedAt(),
        slots: [
          ...current.program.slots,
          {
            ...createEmptySlot(dayId, getSlotsForDay(current.program.slots, dayId).length),
            id: slotId,
            assignmentId: createAssignmentId(`assignment-${slotId}`),
          },
        ],
      }),
    }));
    return slotId;
  }, [mutateDraft]);

  const updateSlot = useCallback((slotId: string, patch: SlotPatch) => {
    mutateDraft(current => ({
      ...current,
      updatedAt: getProgramUpdatedAt(),
      program: normalizeProgramState({
        ...current.program,
        updatedAt: getProgramUpdatedAt(),
        slots: current.program.slots.map(slot => (
          slot.id === slotId ? sanitizeSlot({ ...slot, ...patch }) : slot
        )),
      }),
    }));
  }, [mutateDraft]);

  const removeSlot = useCallback((slotId: string) => {
    mutateDraft(current => ({
      ...current,
      updatedAt: getProgramUpdatedAt(),
      program: normalizeProgramState({
        ...current.program,
        updatedAt: getProgramUpdatedAt(),
        slots: current.program.slots.filter(slot => slot.id !== slotId),
      }),
    }));
  }, [mutateDraft]);

  const moveSlot = useCallback((slotId: string, direction: 'up' | 'down') => {
    mutateDraft(current => {
      const target = current.program.slots.find(slot => slot.id === slotId);
      if (!target) return current;
      const daySlots = getSlotsForDay(current.program.slots, target.dayId);
      const index = daySlots.findIndex(slot => slot.id === slotId);
      if (index === -1) return current;
      const nextIndex = direction === 'up' ? index - 1 : index + 1;
      if (nextIndex < 0 || nextIndex >= daySlots.length) return current;
      const ordered = daySlots.slice();
      const [moved] = ordered.splice(index, 1);
      ordered.splice(nextIndex, 0, moved);

      return {
        ...current,
        updatedAt: getProgramUpdatedAt(),
        program: normalizeProgramState({
          ...current.program,
          updatedAt: getProgramUpdatedAt(),
          slots: [
            ...current.program.slots.filter(slot => slot.dayId !== target.dayId),
            ...ordered.map((slot, orderIndex) => ({ ...slot, sortOrder: orderIndex })),
          ],
        }),
      };
    });
  }, [mutateDraft]);

  const assignCatalogExercise = useCallback((slotId: string, exercise: CatalogExercise) => {
    mutateDraft(current => ({
      ...current,
      updatedAt: getProgramUpdatedAt(),
      program: normalizeProgramState({
        ...current.program,
        updatedAt: getProgramUpdatedAt(),
        slots: current.program.slots.map(slot => {
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
      }),
    }));
  }, [mutateDraft]);

  const clearCatalogAssignment = useCallback((slotId: string) => {
    mutateDraft(current => ({
      ...current,
      updatedAt: getProgramUpdatedAt(),
      program: normalizeProgramState({
        ...current.program,
        updatedAt: getProgramUpdatedAt(),
        slots: current.program.slots.map(slot => (
          slot.id === slotId
            ? sanitizeSlot({
                ...slot,
                assignmentId: createAssignmentId(`assignment-${slot.id}`),
                catalogExerciseId: null,
                exerciseSource: 'manual',
                exerciseImageUrl: null,
                exerciseCategoryName: null,
                primaryMuscles: [],
                secondaryMuscles: [],
              })
            : slot
        )),
      }),
    }));
  }, [mutateDraft]);

  const setManualExerciseName = useCallback((slotId: string, name: string) => {
    const catalogLink = getDefaultExerciseCatalogLink(name.trim());
    updateSlot(slotId, {
      exerciseName: name,
      catalogExerciseId: catalogLink?.catalogExerciseId ?? null,
      exerciseSource: catalogLink ? 'wger' : 'manual',
      exerciseCategoryName: catalogLink?.exerciseCategoryName ?? null,
    });
  }, [updateSlot]);

  const discardDraft = useCallback(async () => {
    persistDraft(null);
  }, [persistDraft]);

  const finalizeDraft = useCallback(async (makeActive: boolean) => {
    if (!draft) return null;
    const programId = createProgramFromState(draft.program, {
      name: draft.basics.name.trim() || 'My Program',
      description: draft.basics.description.trim() || `${draft.basics.name.trim() || 'My Program'} built in the guided wizard`,
      origin: 'user',
    }, { setActive: makeActive });
    persistDraft(null);
    return programId;
  }, [createProgramFromState, draft, persistDraft]);

  const value = useMemo<ProgramCreationContextValue>(() => ({
    isLoaded: draft !== undefined,
    draft: draft ?? null,
    trainingDays,
    getDaySlots,
    ensureDraft,
    updateBasics,
    setCurrentStep,
    updateDay,
    reorderDays,
    toggleRestDay,
    addSlot,
    updateSlot,
    removeSlot,
    moveSlot,
    assignCatalogExercise,
    clearCatalogAssignment,
    setManualExerciseName,
    discardDraft,
    finalizeDraft,
  }), [
    addSlot,
    assignCatalogExercise,
    clearCatalogAssignment,
    discardDraft,
    draft,
    ensureDraft,
    finalizeDraft,
    getDaySlots,
    moveSlot,
    reorderDays,
    setCurrentStep,
    setManualExerciseName,
    toggleRestDay,
    trainingDays,
    updateBasics,
    updateDay,
    updateSlot,
    removeSlot,
  ]);

  return <ProgramCreationContext.Provider value={value}>{children}</ProgramCreationContext.Provider>;
}

export function useProgramCreation() {
  const ctx = useContext(ProgramCreationContext);
  if (!ctx) throw new Error('useProgramCreation must be used within ProgramCreationProvider');
  return ctx;
}
