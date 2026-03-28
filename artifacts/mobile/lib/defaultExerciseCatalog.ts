export interface DefaultExerciseCatalogLink {
  catalogExerciseId: number;
  exerciseCategoryName: string | null;
}

type CatalogLinkDefinition = DefaultExerciseCatalogLink & {
  names: string[];
};

function normalizeExerciseLookupName(value: string) {
  return value
    .toLowerCase()
    .replace(/db/g, 'dumbbell')
    .replace(/ez/g, 'ez bar')
    .replace(/@/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const DEFAULT_EXERCISE_CATALOG_DEFINITIONS: CatalogLinkDefinition[] = [
  { names: ['Seated DB Shoulder Press'], catalogExerciseId: 567, exerciseCategoryName: 'Shoulders' },
  { names: ['Cable Lateral Raises'], catalogExerciseId: 1378, exerciseCategoryName: 'Shoulders' },
  { names: ['Incline Barbell Press @ 30°', 'Incline Barbell Press @ 30Â°'], catalogExerciseId: 538, exerciseCategoryName: 'Chest' },
  { names: ['Cable Fly (Low to High, Incline)'], catalogExerciseId: 1270, exerciseCategoryName: 'Chest' },
  { names: ['Dumbbell Lateral Raises'], catalogExerciseId: 348, exerciseCategoryName: 'Shoulders' },
  { names: ['Wrist Curls — Barbell', 'Wrist Curls Barbell'], catalogExerciseId: 51, exerciseCategoryName: 'Arms' },
  { names: ['Weighted Pull-Ups / Lat Pulldown', 'Weighted Pull Ups Lat Pulldown'], catalogExerciseId: 475, exerciseCategoryName: 'Back' },
  { names: ['Seated Cable Row'], catalogExerciseId: 1117, exerciseCategoryName: 'Back' },
  { names: ['Hammer Curls', 'Hammer Curls — Heavy', 'Hammer Curls Heavy'], catalogExerciseId: 272, exerciseCategoryName: 'Arms' },
  { names: ['Reverse Curls — EZ Bar', 'Reverse Curls EZ Bar'], catalogExerciseId: 495, exerciseCategoryName: 'Arms' },
  { names: ['Reverse Wrist Curls — Dumbbell', 'Reverse Wrist Curls Dumbbell', 'Reverse Wrist Curls'], catalogExerciseId: 48, exerciseCategoryName: 'Arms' },
  { names: ['Face Pulls'], catalogExerciseId: 222, exerciseCategoryName: 'Shoulders' },
  { names: ['Hack Squat / Leg Press', 'Hack Squat Leg Press'], catalogExerciseId: 375, exerciseCategoryName: 'Legs' },
  { names: ['Romanian Deadlift'], catalogExerciseId: 507, exerciseCategoryName: 'Legs' },
  { names: ['Leg Extension'], catalogExerciseId: 369, exerciseCategoryName: 'Legs' },
  { names: ['Standing Calf Raises'], catalogExerciseId: 622, exerciseCategoryName: 'Calves' },
  { names: ['Seated Calf Raises'], catalogExerciseId: 1365, exerciseCategoryName: 'Calves' },
  { names: ['Overhead Press — Barbell', 'Overhead Press Barbell'], catalogExerciseId: 1893, exerciseCategoryName: 'Shoulders' },
  { names: ['Cable Overhead Tricep Extension', 'Cable Overhead Triceps Extension'], catalogExerciseId: 1513, exerciseCategoryName: 'Arms' },
  { names: ['Skull Crushers — EZ Bar', 'Skull Crushers EZ Bar'], catalogExerciseId: 246, exerciseCategoryName: 'Arms' },
  { names: ['Incline DB Press @ 30-45°', 'Incline DB Press @ 30-45Â°', 'Incline Dumbbell Press'], catalogExerciseId: 537, exerciseCategoryName: 'Chest' },
  { names: ['Wrist Curls — Dumbbell', 'Wrist Curls Dumbbell'], catalogExerciseId: 1205, exerciseCategoryName: 'Arms' },
  { names: ['Incline Dumbbell Curl'], catalogExerciseId: 204, exerciseCategoryName: 'Arms' },
  { names: ['Reverse Curls — Cable', 'Reverse Curls Cable'], catalogExerciseId: 914, exerciseCategoryName: 'Arms' },
  { names: ['Wrist Curls — Behind-the-Back', 'Wrist Curls Behind the Back'], catalogExerciseId: 51, exerciseCategoryName: 'Arms' },
];

const DEFAULT_EXERCISE_CATALOG_MAP = new Map<string, DefaultExerciseCatalogLink>();

DEFAULT_EXERCISE_CATALOG_DEFINITIONS.forEach(definition => {
  definition.names.forEach(name => {
    DEFAULT_EXERCISE_CATALOG_MAP.set(normalizeExerciseLookupName(name), {
      catalogExerciseId: definition.catalogExerciseId,
      exerciseCategoryName: definition.exerciseCategoryName,
    });
  });
});

export function getDefaultExerciseCatalogLink(exerciseName: string): DefaultExerciseCatalogLink | null {
  return DEFAULT_EXERCISE_CATALOG_MAP.get(normalizeExerciseLookupName(exerciseName)) ?? null;
}
