import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createEmptyCatalogState,
  fetchCatalogStateFromWger,
  isCatalogStale,
  loadCatalogState,
  saveCatalogState,
  searchCatalogExercises,
  type CatalogExercise,
  type CatalogFilterState,
  type CatalogState,
} from '@/lib/catalog';

export interface CatalogContextValue {
  isLoaded: boolean;
  catalogState: CatalogState;
  exercises: CatalogExercise[];
  refreshCatalog: (options?: { force?: boolean }) => Promise<void>;
  searchCatalog: (filters: CatalogFilterState) => CatalogExercise[];
  getCatalogExercise: (catalogExerciseId: string | number | null | undefined) => CatalogExercise | null;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

export const DEFAULT_CATALOG_FILTERS: CatalogFilterState = {
  query: '',
  categoryIds: [],
  muscleIds: [],
  equipmentIds: [],
};

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [catalogState, setCatalogState] = useState<CatalogState>(createEmptyCatalogState());
  const [isLoaded, setIsLoaded] = useState(false);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  const stateRef = useRef<CatalogState>(createEmptyCatalogState());

  const persist = useCallback((nextState: CatalogState) => {
    stateRef.current = nextState;
    setCatalogState(nextState);
    writeQueueRef.current = writeQueueRef.current
      .then(() => saveCatalogState(nextState))
      .catch(() => saveCatalogState(nextState));
  }, []);

  const refreshCatalog = useCallback(async (options?: { force?: boolean }) => {
    const currentState = stateRef.current;
    if (syncInFlightRef.current) return syncInFlightRef.current;
    if (!options?.force && currentState.sync.hasSeedData && !isCatalogStale(currentState.sync)) return;

    const syncPromise = (async () => {
      const startedAt = new Date().toISOString();
      const syncingState: CatalogState = {
        ...currentState,
        sync: {
          ...currentState.sync,
          status: 'syncing',
          lastAttemptAt: startedAt,
          error: null,
        },
      };
      persist(syncingState);

      try {
        const nextState = await fetchCatalogStateFromWger();
        persist(nextState);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to refresh exercises right now.';
        persist({
          ...syncingState,
          sync: {
            ...syncingState.sync,
            status: syncingState.sync.hasSeedData ? 'ready' : 'error',
            error: message,
          },
        });
      } finally {
        syncInFlightRef.current = null;
      }
    })();

    syncInFlightRef.current = syncPromise;
    return syncPromise;
  }, [persist]);

  useEffect(() => {
    let mounted = true;

    loadCatalogState()
      .then(state => {
        if (!mounted) return;
        stateRef.current = state;
        setCatalogState(state);
        setIsLoaded(true);
        if (isCatalogStale(state.sync)) {
          void refreshCatalog({ force: false });
        }
      })
      .catch(() => {
        if (!mounted) return;
        const empty = createEmptyCatalogState();
        stateRef.current = empty;
        setCatalogState(empty);
        setIsLoaded(true);
      });

    return () => {
      mounted = false;
    };
  }, [refreshCatalog]);

  const getCatalogExercise = useCallback((catalogExerciseId: string | number | null | undefined) => {
    if (catalogExerciseId === null || catalogExerciseId === undefined) return null;
    const numericId = typeof catalogExerciseId === 'number' ? catalogExerciseId : Number(catalogExerciseId);
    if (!Number.isFinite(numericId)) return null;
    return catalogState.exercises.find(exercise => exercise.wgerId === numericId) ?? null;
  }, [catalogState.exercises]);

  const searchCatalog = useCallback((filters: CatalogFilterState) => {
    return searchCatalogExercises(catalogState.exercises, filters);
  }, [catalogState.exercises]);

  const value = useMemo<CatalogContextValue>(() => ({
    isLoaded,
    catalogState,
    exercises: catalogState.exercises,
    refreshCatalog,
    searchCatalog,
    getCatalogExercise,
  }), [catalogState, getCatalogExercise, isLoaded, refreshCatalog, searchCatalog]);

  return (
    <CatalogContext.Provider value={value}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error('useCatalog must be used within CatalogProvider');
  return ctx;
}
