import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CatalogMuscle {
  id: number;
  name: string;
  appGroups: string[];
}

export interface CatalogCategory {
  id: number;
  name: string;
}

export interface CatalogEquipment {
  id: number;
  name: string;
}

export interface CatalogExercise {
  wgerId: number;
  uuid: string | null;
  name: string;
  aliases: string[];
  category: CatalogCategory | null;
  equipment: CatalogEquipment[];
  primaryMuscles: CatalogMuscle[];
  secondaryMuscles: CatalogMuscle[];
  imageUrls: string[];
  mappedPrimaryMuscles: string[];
  mappedSecondaryMuscles: string[];
  lastSyncedAt: string;
  searchText: string;
}

export interface CatalogFilterState {
  query: string;
  categoryIds: number[];
  muscleIds: number[];
  equipmentIds: number[];
}

export interface CatalogSyncState {
  status: 'idle' | 'syncing' | 'ready' | 'error';
  lastSuccessfulSyncAt: string | null;
  lastAttemptAt: string | null;
  error: string | null;
  hasSeedData: boolean;
}

export interface CatalogState {
  exercises: CatalogExercise[];
  categories: CatalogCategory[];
  muscles: CatalogMuscle[];
  equipment: CatalogEquipment[];
  sync: CatalogSyncState;
}

interface WgerTranslation {
  language?: number | null;
  name?: string | null;
}

interface WgerNamedEntity {
  id?: number | null;
  name?: string | null;
}

interface WgerImage {
  image?: string | null;
}

interface WgerExerciseInfo {
  id?: number | null;
  uuid?: string | null;
  name?: string | null;
  category?: WgerNamedEntity | null;
  muscles?: WgerNamedEntity[] | null;
  muscles_secondary?: WgerNamedEntity[] | null;
  equipment?: WgerNamedEntity[] | null;
  images?: WgerImage[] | null;
  translations?: WgerTranslation[] | null;
}

interface PagedResponse<T> {
  count?: number;
  next?: string | null;
  results?: T[];
}

export const CATALOG_STORAGE_KEY = 'tl_catalog_v1';
export const CATALOG_STALE_MS = 1000 * 60 * 60 * 24 * 7;
const WGER_BASE_URL = 'https://wger.de/api/v2';
const ENGLISH_LANGUAGE_ID = 2;

function normalizeLabel(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeLabel).filter(Boolean)));
}

function toSearchText(exercise: Pick<CatalogExercise, 'name' | 'aliases' | 'category' | 'equipment' | 'mappedPrimaryMuscles' | 'mappedSecondaryMuscles'>) {
  return [
    exercise.name,
    ...exercise.aliases,
    exercise.category?.name ?? '',
    ...exercise.equipment.map(item => item.name),
    ...exercise.mappedPrimaryMuscles,
    ...exercise.mappedSecondaryMuscles,
  ]
    .join(' ')
    .toLowerCase();
}

export function normalizeAppMuscleGroups(labels: string[]) {
  return Array.from(new Set(labels.map(normalizeLabel).filter(Boolean)));
}

export function mapWgerMuscleNameToAppGroups(name: string) {
  const normalized = name.toLowerCase();
  const groups = new Set<string>();

  if (normalized.includes('lateral deltoid')) groups.add('Lateral Delts');
  if (normalized.includes('posterior deltoid') || normalized.includes('rear deltoid')) groups.add('Back');
  if (normalized.includes('deltoid')) groups.add('Shoulders');
  if (normalized.includes('clavicular') || normalized.includes('upper pectoral')) groups.add('Upper Chest');
  if (normalized.includes('pectoral')) groups.add('Upper Chest');
  if (normalized.includes('triceps') || normalized.includes('anconeus')) groups.add('Long Head Triceps');
  if (normalized.includes('biceps')) groups.add('Biceps');
  if (normalized.includes('brachialis')) groups.add('Biceps');
  if (
    normalized.includes('brachioradialis')
    || normalized.includes('forearm')
    || normalized.includes('wrist')
    || normalized.includes('finger')
    || normalized.includes('extensor')
    || normalized.includes('flexor')
  ) {
    groups.add('Forearms (total)');
  }
  if (normalized.includes('trapezius')) {
    groups.add('Traps');
    groups.add('Back');
  }
  if (
    normalized.includes('latissimus')
    || normalized.includes('rhomboid')
    || normalized.includes('teres')
    || normalized.includes('infraspinatus')
  ) {
    groups.add('Back');
  }
  if (
    normalized.includes('quadriceps')
    || normalized.includes('adductor')
    || normalized.includes('glute')
    || normalized.includes('hamstring')
    || normalized.includes('biceps femoris')
    || normalized.includes('semitendinosus')
    || normalized.includes('semimembranosus')
  ) {
    groups.add('Legs');
  }
  if (normalized.includes('gastrocnemius') || normalized.includes('soleus') || normalized.includes('calf')) {
    groups.add('Calves');
  }
  if (normalized.includes('oblique')) {
    groups.add('Obliques');
  }
  if (normalized.includes('abdom') || normalized.includes('core')) {
    groups.add('Abdominals');
  }

  return Array.from(groups);
}

function normalizeMuscle(entity: WgerNamedEntity | null | undefined): CatalogMuscle | null {
  if (!entity || typeof entity.id !== 'number') return null;
  const name = normalizeLabel(entity.name);
  if (!name) return null;
  return {
    id: entity.id,
    name,
    appGroups: mapWgerMuscleNameToAppGroups(name),
  };
}

function normalizeCategory(entity: WgerNamedEntity | null | undefined): CatalogCategory | null {
  if (!entity || typeof entity.id !== 'number') return null;
  const name = normalizeLabel(entity.name);
  if (!name) return null;
  return { id: entity.id, name };
}

function normalizeEquipment(items: WgerNamedEntity[] | null | undefined) {
  return (items ?? [])
    .map(item => normalizeCategory(item))
    .filter((item): item is CatalogEquipment => !!item);
}

function pickExerciseName(exercise: WgerExerciseInfo) {
  const translations = exercise.translations ?? [];
  const english = translations.find(item => item?.language === ENGLISH_LANGUAGE_ID && normalizeLabel(item.name));
  const fallback = translations.find(item => normalizeLabel(item?.name));
  return normalizeLabel(english?.name) || normalizeLabel(fallback?.name) || normalizeLabel(exercise.name) || 'Unnamed Exercise';
}

function getExerciseAliases(exercise: WgerExerciseInfo, chosenName: string) {
  const translationNames = (exercise.translations ?? []).map(item => normalizeLabel(item.name));
  return uniqueStrings([normalizeLabel(exercise.name), ...translationNames]).filter(name => name !== chosenName);
}

function normalizeExercise(exercise: WgerExerciseInfo, lastSyncedAt: string): CatalogExercise | null {
  if (typeof exercise.id !== 'number') return null;
  const name = pickExerciseName(exercise);
  const category = normalizeCategory(exercise.category);
  const equipment = normalizeEquipment(exercise.equipment);
  const primaryMuscles = (exercise.muscles ?? []).map(normalizeMuscle).filter((item): item is CatalogMuscle => !!item);
  const secondaryMuscles = (exercise.muscles_secondary ?? []).map(normalizeMuscle).filter((item): item is CatalogMuscle => !!item);
  const mappedPrimaryMuscles = normalizeAppMuscleGroups(primaryMuscles.flatMap(item => item.appGroups));
  const mappedSecondaryMuscles = normalizeAppMuscleGroups(secondaryMuscles.flatMap(item => item.appGroups));
  const normalized: CatalogExercise = {
    wgerId: exercise.id,
    uuid: typeof exercise.uuid === 'string' ? exercise.uuid : null,
    name,
    aliases: getExerciseAliases(exercise, name),
    category,
    equipment,
    primaryMuscles,
    secondaryMuscles,
    imageUrls: uniqueStrings((exercise.images ?? []).map(item => item.image)),
    mappedPrimaryMuscles,
    mappedSecondaryMuscles,
    lastSyncedAt,
    searchText: '',
  };
  return {
    ...normalized,
    searchText: toSearchText(normalized),
  };
}

async function fetchAllPages<T>(path: string) {
  const results: T[] = [];
  let nextUrl: string | null = `${WGER_BASE_URL}/${path}${path.includes('?') ? '&' : '?'}limit=200`;

  while (nextUrl) {
    const response = await fetch(nextUrl);
    if (!response.ok) {
      throw new Error(`WGER sync failed (${response.status})`);
    }
    const page = await response.json() as PagedResponse<T>;
    results.push(...(page.results ?? []));
    nextUrl = page.next ?? null;
  }

  return results;
}

export async function fetchCatalogStateFromWger(): Promise<CatalogState> {
  const syncedAt = new Date().toISOString();
  const rawExercises = await fetchAllPages<WgerExerciseInfo>('exerciseinfo/?language=2');
  const exercises = rawExercises
    .map(item => normalizeExercise(item, syncedAt))
    .filter((item): item is CatalogExercise => !!item)
    .sort((a, b) => a.name.localeCompare(b.name));

  const categoryMap = new Map<number, CatalogCategory>();
  const muscleMap = new Map<number, CatalogMuscle>();
  const equipmentMap = new Map<number, CatalogEquipment>();

  exercises.forEach(exercise => {
    if (exercise.category) categoryMap.set(exercise.category.id, exercise.category);
    exercise.primaryMuscles.forEach(item => muscleMap.set(item.id, item));
    exercise.secondaryMuscles.forEach(item => muscleMap.set(item.id, item));
    exercise.equipment.forEach(item => equipmentMap.set(item.id, item));
  });

  return {
    exercises,
    categories: Array.from(categoryMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    muscles: Array.from(muscleMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    equipment: Array.from(equipmentMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    sync: {
      status: 'ready',
      lastSuccessfulSyncAt: syncedAt,
      lastAttemptAt: syncedAt,
      error: null,
      hasSeedData: exercises.length > 0,
    },
  };
}

function isCatalogExercise(value: unknown): value is CatalogExercise {
  if (!value || typeof value !== 'object') return false;
  const exercise = value as Record<string, unknown>;
  return typeof exercise.wgerId === 'number'
    && typeof exercise.name === 'string'
    && Array.isArray(exercise.aliases)
    && Array.isArray(exercise.equipment)
    && Array.isArray(exercise.primaryMuscles)
    && Array.isArray(exercise.secondaryMuscles)
    && Array.isArray(exercise.imageUrls)
    && Array.isArray(exercise.mappedPrimaryMuscles)
    && Array.isArray(exercise.mappedSecondaryMuscles)
    && typeof exercise.lastSyncedAt === 'string'
    && typeof exercise.searchText === 'string';
}

function isCatalogState(value: unknown): value is CatalogState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  const sync = state.sync as Record<string, unknown> | undefined;
  return Array.isArray(state.exercises)
    && state.exercises.every(isCatalogExercise)
    && Array.isArray(state.categories)
    && Array.isArray(state.muscles)
    && Array.isArray(state.equipment)
    && !!sync
    && typeof sync.status === 'string'
    && typeof sync.hasSeedData === 'boolean';
}

export function createEmptyCatalogState(): CatalogState {
  return {
    exercises: [],
    categories: [],
    muscles: [],
    equipment: [],
    sync: {
      status: 'idle',
      lastSuccessfulSyncAt: null,
      lastAttemptAt: null,
      error: null,
      hasSeedData: false,
    },
  };
}

export async function loadCatalogState() {
  const value = await AsyncStorage.getItem(CATALOG_STORAGE_KEY);
  if (!value) return createEmptyCatalogState();

  try {
    const parsed = JSON.parse(value);
    if (isCatalogState(parsed)) {
      return parsed;
    }
  } catch {}

  return createEmptyCatalogState();
}

export async function saveCatalogState(state: CatalogState) {
  await AsyncStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(state));
}

export function isCatalogStale(sync: CatalogSyncState) {
  if (!sync.lastSuccessfulSyncAt) return true;
  const last = new Date(sync.lastSuccessfulSyncAt).getTime();
  if (!Number.isFinite(last)) return true;
  return (Date.now() - last) > CATALOG_STALE_MS;
}

export function searchCatalogExercises(
  exercises: CatalogExercise[],
  filters: CatalogFilterState,
) {
  const query = filters.query.trim().toLowerCase();
  const queryTokens = query.split(/\s+/).filter(Boolean);

  return exercises
    .map(exercise => {
      if (query) {
        const haystack = exercise.searchText;
        const name = exercise.name.toLowerCase();
        const aliases = exercise.aliases.map(alias => alias.toLowerCase());
        const exactName = name === query;
        const nameStartsWith = name.startsWith(query);
        const aliasStartsWith = aliases.some(alias => alias.startsWith(query));
        const fullIncludes = haystack.includes(query);
        const tokenMatches = queryTokens.filter(token => haystack.includes(token)).length;

        if (tokenMatches === 0 && !fullIncludes && !nameStartsWith && !aliasStartsWith && !exactName) {
          return null;
        }

        let searchScore = tokenMatches;
        if (fullIncludes) searchScore += 3;
        if (nameStartsWith) searchScore += 4;
        if (aliasStartsWith) searchScore += 2;
        if (exactName) searchScore += 6;

        return { exercise, searchScore };
      }

      return { exercise, searchScore: 0 };
    })
    .filter((entry): entry is { exercise: CatalogExercise; searchScore: number } => !!entry)
    .filter(({ exercise }) => {

      if (filters.categoryIds.length > 0) {
        const categoryId = exercise.category?.id ?? null;
        if (!categoryId || !filters.categoryIds.includes(categoryId)) return false;
      }

      if (filters.equipmentIds.length > 0) {
        const equipmentIds = exercise.equipment.map(item => item.id);
        if (!filters.equipmentIds.every(id => equipmentIds.includes(id))) return false;
      }

      if (filters.muscleIds.length > 0) {
        const muscleIds = [
          ...exercise.primaryMuscles.map(item => item.id),
          ...exercise.secondaryMuscles.map(item => item.id),
        ];
        if (!filters.muscleIds.every(id => muscleIds.includes(id))) return false;
      }

      return true;
    })
    .sort((a, b) => {
      if (b.searchScore !== a.searchScore) return b.searchScore - a.searchScore;
      return a.exercise.name.localeCompare(b.exercise.name);
    })
    .map(entry => entry.exercise);
}
