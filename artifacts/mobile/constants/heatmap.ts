export type HeatmapSide = 'front' | 'back';

export type TrainingLevel = 'beginner' | 'intermediate' | 'advanced';

export interface StrengthProfile {
  bodyweightLbs: number;
  trainingLevel: TrainingLevel;
}

export type StrengthLiftKey =
  | 'overhead_press'
  | 'incline_press'
  | 'pullup'
  | 'seated_row'
  | 'hammer_curl'
  | 'skull_crusher'
  | 'hack_squat'
  | 'romanian_deadlift'
  | 'standing_calf_raise';

export interface StrengthLiftEntry {
  weight: number | null;
  reps: number | null;
}

export type StrengthLifts = Record<StrengthLiftKey, StrengthLiftEntry>;

export type StrengthMuscleId =
  | 'front_delts'
  | 'lateral_delts'
  | 'upper_chest'
  | 'abs'
  | 'obliques'
  | 'lats'
  | 'mid_back'
  | 'traps'
  | 'biceps'
  | 'brachioradialis'
  | 'triceps_long_head'
  | 'quads'
  | 'glutes'
  | 'hamstrings'
  | 'calves'
  | 'rear_delts'
  | 'forearms';

export type VolumeMuscleId =
  | 'shoulders'
  | 'lateral_delts'
  | 'upper_chest'
  | 'abdominals'
  | 'obliques'
  | 'long_head_triceps'
  | 'back'
  | 'traps'
  | 'biceps'
  | 'forearms_total'
  | 'legs'
  | 'calves';

export const TRAINING_LEVEL_LABELS: Record<TrainingLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const DEFAULT_STRENGTH_LIFTS: StrengthLifts = {
  overhead_press: { weight: null, reps: null },
  incline_press: { weight: null, reps: null },
  pullup: { weight: null, reps: null },
  seated_row: { weight: null, reps: null },
  hammer_curl: { weight: null, reps: null },
  skull_crusher: { weight: null, reps: null },
  hack_squat: { weight: null, reps: null },
  romanian_deadlift: { weight: null, reps: null },
  standing_calf_raise: { weight: null, reps: null },
};

export const VOLUME_MUSCLE_CONFIG: Array<{
  id: VolumeMuscleId;
  label: string;
  sourceKey: string;
  side: HeatmapSide | 'both';
  target: { min: number; max?: number };
}> = [
  { id: 'shoulders', label: 'Shoulders', sourceKey: 'Shoulders', side: 'both', target: { min: 8 } },
  { id: 'lateral_delts', label: 'Lateral Delts', sourceKey: 'Lateral Delts', side: 'both', target: { min: 14, max: 16 } },
  { id: 'upper_chest', label: 'Upper Chest', sourceKey: 'Upper Chest', side: 'front', target: { min: 10 } },
  { id: 'abdominals', label: 'Abdominals', sourceKey: 'Abdominals', side: 'front', target: { min: 6 } },
  { id: 'obliques', label: 'Obliques', sourceKey: 'Obliques', side: 'front', target: { min: 4 } },
  { id: 'long_head_triceps', label: 'Long Head Triceps', sourceKey: 'Long Head Triceps', side: 'back', target: { min: 10 } },
  { id: 'back', label: 'Back', sourceKey: 'Back', side: 'back', target: { min: 8 } },
  { id: 'traps', label: 'Traps', sourceKey: 'Traps', side: 'back', target: { min: 6 } },
  { id: 'biceps', label: 'Biceps', sourceKey: 'Biceps', side: 'front', target: { min: 6 } },
  { id: 'forearms_total', label: 'Forearms', sourceKey: 'Forearms (total)', side: 'both', target: { min: 15, max: 18 } },
  { id: 'legs', label: 'Legs', sourceKey: 'Legs', side: 'both', target: { min: 10 } },
  { id: 'calves', label: 'Calves', sourceKey: 'Calves', side: 'both', target: { min: 8 } },
];

export const STRENGTH_LIFT_ORDER: StrengthLiftKey[] = [
  'overhead_press',
  'incline_press',
  'pullup',
  'seated_row',
  'hammer_curl',
  'skull_crusher',
  'hack_squat',
  'romanian_deadlift',
  'standing_calf_raise',
];

export const STRENGTH_LIFT_CONFIG: Record<
  StrengthLiftKey,
  {
    label: string;
    note?: string;
    primaryMuscles: StrengthMuscleId[];
    secondaryMuscles: StrengthMuscleId[];
    standards: Record<TrainingLevel, number>;
  }
> = {
  overhead_press: {
    label: 'Overhead Press',
    primaryMuscles: ['front_delts', 'lateral_delts'],
    secondaryMuscles: ['triceps_long_head'],
    standards: { beginner: 0.45, intermediate: 0.75, advanced: 1.1 },
  },
  incline_press: {
    label: 'Incline Barbell Press @ 30°',
    primaryMuscles: ['upper_chest'],
    secondaryMuscles: ['front_delts'],
    standards: { beginner: 0.6, intermediate: 0.95, advanced: 1.35 },
  },
  pullup: {
    label: 'Pull-Up / Lat Pulldown',
    note: 'For pull-ups, enter added weight only. Use 0 for bodyweight-only reps.',
    primaryMuscles: ['lats'],
    secondaryMuscles: ['mid_back', 'traps', 'biceps'],
    standards: { beginner: 0, intermediate: 0.25, advanced: 0.75 },
  },
  seated_row: {
    label: 'Seated Cable Row',
    primaryMuscles: ['mid_back', 'traps'],
    secondaryMuscles: ['lats'],
    standards: { beginner: 0.6, intermediate: 0.9, advanced: 1.25 },
  },
  hammer_curl: {
    label: 'Hammer Curl',
    primaryMuscles: ['brachioradialis'],
    secondaryMuscles: ['biceps'],
    standards: { beginner: 0.15, intermediate: 0.25, advanced: 0.4 },
  },
  skull_crusher: {
    label: 'Skull Crusher / Overhead Tricep Ext.',
    primaryMuscles: ['triceps_long_head'],
    secondaryMuscles: [],
    standards: { beginner: 0.3, intermediate: 0.5, advanced: 0.75 },
  },
  hack_squat: {
    label: 'Hack Squat / Leg Press',
    primaryMuscles: ['quads'],
    secondaryMuscles: ['glutes', 'abs', 'obliques'],
    standards: { beginner: 1.0, intermediate: 1.75, advanced: 2.5 },
  },
  romanian_deadlift: {
    label: 'Romanian Deadlift',
    primaryMuscles: ['hamstrings'],
    secondaryMuscles: ['glutes', 'abs', 'obliques'],
    standards: { beginner: 0.75, intermediate: 1.25, advanced: 1.75 },
  },
  standing_calf_raise: {
    label: 'Standing Calf Raise',
    primaryMuscles: ['calves'],
    secondaryMuscles: [],
    standards: { beginner: 0.75, intermediate: 1.25, advanced: 1.75 },
  },
};

export const STRENGTH_MUSCLE_CONFIG: Array<{
  id: StrengthMuscleId;
  label: string;
  side: HeatmapSide | 'both';
  tracked: boolean;
  displayLiftKey?: StrengthLiftKey;
}> = [
  { id: 'front_delts', label: 'Front Delts', side: 'front', tracked: true, displayLiftKey: 'overhead_press' },
  { id: 'lateral_delts', label: 'Lateral Delts', side: 'both', tracked: true, displayLiftKey: 'overhead_press' },
  { id: 'upper_chest', label: 'Upper Chest', side: 'front', tracked: true, displayLiftKey: 'incline_press' },
  { id: 'abs', label: 'Abdominals', side: 'front', tracked: true, displayLiftKey: 'romanian_deadlift' },
  { id: 'obliques', label: 'Obliques', side: 'front', tracked: true, displayLiftKey: 'romanian_deadlift' },
  { id: 'lats', label: 'Lats', side: 'back', tracked: true, displayLiftKey: 'pullup' },
  { id: 'mid_back', label: 'Mid Back', side: 'back', tracked: true, displayLiftKey: 'seated_row' },
  { id: 'traps', label: 'Traps', side: 'back', tracked: true, displayLiftKey: 'seated_row' },
  { id: 'biceps', label: 'Biceps', side: 'front', tracked: true, displayLiftKey: 'hammer_curl' },
  { id: 'brachioradialis', label: 'Brachioradialis', side: 'front', tracked: true, displayLiftKey: 'hammer_curl' },
  { id: 'triceps_long_head', label: 'Triceps (Long Head)', side: 'back', tracked: true, displayLiftKey: 'skull_crusher' },
  { id: 'quads', label: 'Quads', side: 'front', tracked: true, displayLiftKey: 'hack_squat' },
  { id: 'glutes', label: 'Glutes', side: 'back', tracked: true, displayLiftKey: 'romanian_deadlift' },
  { id: 'hamstrings', label: 'Hamstrings', side: 'back', tracked: true, displayLiftKey: 'romanian_deadlift' },
  { id: 'calves', label: 'Calves', side: 'both', tracked: true, displayLiftKey: 'standing_calf_raise' },
  { id: 'rear_delts', label: 'Rear Delts', side: 'back', tracked: false },
  { id: 'forearms', label: 'Forearms', side: 'both', tracked: false },
];

export function calculateEstimated1RM(weight: number | null, reps: number | null): number | null {
  if (!weight || !reps || weight <= 0 || reps <= 0) return null;
  if (reps === 1) return Math.round(weight);
  return Math.round(weight * (1 + reps / 30));
}
