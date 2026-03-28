export interface Exercise {
  name: string;
  sets: number;
  repRange: [number, number];
  rest: number;
  failure: boolean;
  note: string;
  muscleGroups: string[];
}

export interface WorkoutDay {
  id: string;
  name: string;
  label: string;
  session: string;
  color: string;
  tag: string;
  protocol?: string;
  exercises?: Exercise[];
  rest?: boolean;
}

export const DAYS: WorkoutDay[] = [
  {
    id: 'monday', name: 'Monday', label: 'MON', session: 'Push A',
    color: '#e8ff47', tag: 'Shoulders & Upper Chest',
    protocol: 'Heavy day. Focus on slow eccentrics and full ROM. This is your primary shoulder mass session.',
    exercises: [
      { name: 'Seated DB Shoulder Press', sets: 4, repRange: [8,10], rest: 120, failure: false, muscleGroups: ['Shoulders'], note: 'Seated removes leg drive — delts do all the work. Full ROM, slow eccentric. Your primary mass builder.' },
      { name: 'Cable Lateral Raises', sets: 4, repRange: [15,20], rest: 60, failure: true, muscleGroups: ['Lateral Delts'], note: 'Slight forward lean, thumb-down. Keep tension constant. Stop just at or slightly below parallel — above that recruits traps.' },
      { name: 'Incline Barbell Press @ 30°', sets: 4, repRange: [8,10], rest: 120, failure: false, muscleGroups: ['Upper Chest'], note: 'Keep elbows at 45° to your body, not flared. Full stretch at the bottom. 30° is the sweet spot for upper chest activation.' },
      { name: 'Cable Fly (Low to High, Incline)', sets: 3, repRange: [12,15], rest: 60, failure: true, muscleGroups: ['Upper Chest'], note: 'Low pulley on incline bench. Constant tension through entire arc. One of the best upper chest isolation movements.' },
      { name: 'Dumbbell Lateral Raises', sets: 3, repRange: [15,20], rest: 60, failure: true, muscleGroups: ['Lateral Delts'], note: 'Thumbs down, raise to just at or slightly below parallel. Complements the cable variation from earlier.' },
      { name: 'Wrist Curls — Barbell', sets: 3, repRange: [15,20], rest: 45, failure: false, muscleGroups: ['Forearms (total)'], note: 'Forearms on thighs, full stretch at bottom. Best exercise for forearm flexor mass. Forearms are pre-warmed from pressing.' },
    ]
  },
  {
    id: 'tuesday', name: 'Tuesday', label: 'TUE', session: 'Pull A',
    color: '#52b8ff', tag: 'Back, Forearms & Biceps',
    protocol: 'Back width focus. Keep reps controlled and feel the stretch. Forearms get first weekly dedicated session.',
    exercises: [
      { name: 'Weighted Pull-Ups / Lat Pulldown', sets: 4, repRange: [8,10], rest: 120, failure: false, muscleGroups: ['Back'], note: 'Full ROM — start from dead hang. Drive elbows toward hips, not shoulders to ears. Foundation of back width.' },
      { name: 'Seated Cable Row', sets: 4, repRange: [10,12], rest: 90, failure: false, muscleGroups: ['Back'], note: '1-second pause at the contraction. Mid and lower trap development. Control the return.' },
      { name: 'Hammer Curls', sets: 4, repRange: [12,15], rest: 60, failure: false, muscleGroups: ['Biceps', 'Forearms (total)'], note: 'Neutral grip = maximum brachioradialis activation. Single best exercise for visible forearm mass near the elbow. Heavy and controlled.' },
      { name: 'Reverse Curls — EZ Bar', sets: 3, repRange: [12,15], rest: 60, failure: false, muscleGroups: ['Forearms (total)'], note: 'Pronated grip shifts load entirely to brachioradialis and forearm extensors. Do these while forearms are pumped.' },
      { name: 'Reverse Wrist Curls — Dumbbell', sets: 3, repRange: [15,20], rest: 45, failure: false, muscleGroups: ['Forearms (total)'], note: 'Forearms on thighs, palms facing down. Wrist extensors for balanced development and injury prevention.' },
      { name: 'Face Pulls', sets: 3, repRange: [15,20], rest: 60, failure: false, muscleGroups: ['Back'], note: 'Rear delt and rotator cuff health. Critical for shoulder longevity given the pressing volume. Never skip these.' },
    ]
  },
  {
    id: 'wednesday', name: 'Wednesday', label: 'WED', session: 'Legs',
    color: '#4cff91', tag: 'Quads, Hams & Calves',
    protocol: 'Calves are the priority here. Pause 1-2 seconds at the bottom of every calf rep — that lengthened position is where growth happens.',
    exercises: [
      { name: 'Hack Squat / Leg Press', sets: 4, repRange: [10,12], rest: 120, failure: false, muscleGroups: ['Legs'], note: 'Full depth. Controlled descent. Primary lower body compound.' },
      { name: 'Romanian Deadlift', sets: 3, repRange: [10,10], rest: 90, failure: false, muscleGroups: ['Legs'], note: 'Feel the hamstring stretch at the bottom. Keep back flat. Hinge, don\'t squat.' },
      { name: 'Leg Extension', sets: 3, repRange: [12,15], rest: 60, failure: false, muscleGroups: ['Legs'], note: 'Quad isolation. Slow and controlled. Pause at the top.' },
      { name: 'Standing Calf Raises', sets: 5, repRange: [10,15], rest: 60, failure: true, muscleGroups: ['Calves'], note: 'PAUSE 1-2 seconds in the deep stretch at the bottom. Research shows 12.4% vs 1.7% gastrocnemius growth vs seated. Add lengthened partials after failure on last 2 sets.' },
      { name: 'Seated Calf Raises', sets: 3, repRange: [15,20], rest: 45, failure: false, muscleGroups: ['Calves'], note: 'Soleus development and ankle mobility. Standing work is your primary driver — these supplement it.' },
    ]
  },
  {
    id: 'thursday', name: 'Thursday', label: 'THU', session: 'Push B',
    color: '#ff9f52', tag: 'Shoulders & Triceps',
    protocol: 'Second shoulder session plus tricep long head focus. Every tricep exercise is overhead position — the research is conclusive for long head growth.',
    exercises: [
      { name: 'Overhead Press — Barbell', sets: 4, repRange: [8,10], rest: 120, failure: false, muscleGroups: ['Shoulders'], note: 'Different stimulus vs Monday\'s DB press. Barbell allows heavier loading for overall shoulder mass. Standing or seated.' },
      { name: 'Cable Lateral Raises', sets: 4, repRange: [15,20], rest: 60, failure: true, muscleGroups: ['Lateral Delts'], note: 'Second weekly lateral delt exposure. Same technique — constant tension, controlled, thumbs down, stop at parallel.' },
      { name: 'Cable Overhead Tricep Extension', sets: 4, repRange: [10,12], rest: 90, failure: false, muscleGroups: ['Long Head Triceps'], note: 'Set cable at the bottom, face away, arms overhead. Full stretch. This is where the long head grows. Do NOT swap for pushdowns.' },
      { name: 'Skull Crushers — EZ Bar', sets: 3, repRange: [10,12], rest: 90, failure: false, muscleGroups: ['Long Head Triceps'], note: 'Lower bar slightly BEHIND your head, not to forehead. Keeps tension on the long head at the bottom. Greater stretch = greater stimulus.' },
      { name: 'Incline DB Press @ 30-45°', sets: 3, repRange: [10,12], rest: 90, failure: false, muscleGroups: ['Upper Chest'], note: 'Second weekly upper chest session. Slightly higher rep range to vary the stimulus from Monday.' },
      { name: 'Wrist Curls — Dumbbell', sets: 3, repRange: [15,20], rest: 45, failure: false, muscleGroups: ['Forearms (total)'], note: 'Second forearm flexor session. Dumbbells allow natural wrist rotation for slight variation.' },
    ]
  },
  {
    id: 'friday', name: 'Friday', label: 'FRI', session: 'Pull B',
    color: '#c084fc', tag: 'Arms & Forearms',
    protocol: 'Forearm anchor day. Behind-the-back wrist curl and hammer curl are your two most important forearm movements. Train hard — forearms respond well to frequency.',
    exercises: [
      { name: 'Incline Dumbbell Curl', sets: 3, repRange: [10,12], rest: 60, failure: false, muscleGroups: ['Biceps'], note: 'Lie back on 45° incline, arms hang fully before curling. Shoulder behind body = long bicep head stretched = better development.' },
      { name: 'Hammer Curls — Heavy', sets: 4, repRange: [10,12], rest: 60, failure: false, muscleGroups: ['Biceps', 'Forearms (total)'], note: 'Go heavier than Tuesday. Second brachioradialis session. Most important forearm mass exercise in the program.' },
      { name: 'Reverse Curls — Cable', sets: 3, repRange: [12,15], rest: 60, failure: false, muscleGroups: ['Forearms (total)'], note: 'Cable version provides constant tension — better stimulus than free weight for this movement.' },
      { name: 'Cable Overhead Tricep Extension', sets: 3, repRange: [12,15], rest: 90, failure: false, muscleGroups: ['Long Head Triceps'], note: 'Second long head session. Slightly lighter and higher rep than Thursday. Same technique.' },
      { name: 'Wrist Curls — Behind-the-Back', sets: 3, repRange: [15,20], rest: 45, failure: true, muscleGroups: ['Forearms (total)'], note: 'Stand holding barbell behind back, let it roll to fingertips, curl back up. Finger + wrist flexion = superior hypertrophy through lengthened position. Most underrated forearm exercise.' },
      { name: 'Reverse Wrist Curls', sets: 3, repRange: [15,20], rest: 45, failure: false, muscleGroups: ['Forearms (total)'], note: 'Extensor balance work. Fast but controlled. Keeps forearm development symmetrical.' },
    ]
  },
  { id: 'saturday', name: 'Saturday', label: 'SAT', session: 'Rest', rest: true, color: '#555', tag: 'Recovery' },
  { id: 'sunday', name: 'Sunday', label: 'SUN', session: 'Rest', rest: true, color: '#555', tag: 'Recovery' },
];

export const MUSCLE_TARGETS: Record<string, { min: number; max?: number }> = {
  'Lateral Delts': { min: 14, max: 16 },
  'Forearms (total)': { min: 15, max: 18 },
  'Upper Chest': { min: 10 },
  'Abdominals': { min: 6 },
  'Obliques': { min: 4 },
  'Long Head Triceps': { min: 10 },
  'Calves': { min: 8 },
  'Back': { min: 8 },
  'Traps': { min: 6 },
  'Biceps': { min: 6 },
  'Legs': { min: 10 },
  'Shoulders': { min: 8 },
};
