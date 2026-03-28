export const FIXED_TEST_DATE_ISO = '2026-03-25T12:00:00.000-05:00';

const catalogSeedState = {
  exercises: [
    {
      wgerId: 101,
      uuid: 'visual-seed-101',
      name: 'Seated Dumbbell Shoulder Press',
      aliases: ['DB Shoulder Press'],
      category: { id: 10, name: 'Shoulders' },
      equipment: [{ id: 1, name: 'Dumbbells' }],
      primaryMuscles: [{ id: 4, name: 'Anterior deltoid', appGroups: ['Shoulders'] }],
      secondaryMuscles: [{ id: 5, name: 'Lateral deltoid', appGroups: ['Lateral Delts'] }],
      imageUrls: [],
      mappedPrimaryMuscles: ['Shoulders'],
      mappedSecondaryMuscles: ['Lateral Delts'],
      lastSyncedAt: '2026-03-24T08:00:00.000Z',
      searchText: 'seated dumbbell shoulder press db shoulder press shoulders dumbbells shoulders lateral delts',
    },
    {
      wgerId: 102,
      uuid: 'visual-seed-102',
      name: 'Incline Barbell Press',
      aliases: ['Incline Press'],
      category: { id: 11, name: 'Chest' },
      equipment: [{ id: 2, name: 'Barbell' }],
      primaryMuscles: [{ id: 7, name: 'Pectoralis major (clavicular)', appGroups: ['Upper Chest'] }],
      secondaryMuscles: [{ id: 9, name: 'Triceps brachii', appGroups: ['Long Head Triceps'] }],
      imageUrls: [],
      mappedPrimaryMuscles: ['Upper Chest'],
      mappedSecondaryMuscles: ['Long Head Triceps'],
      lastSyncedAt: '2026-03-24T08:00:00.000Z',
      searchText: 'incline barbell press incline press chest barbell upper chest long head triceps',
    },
  ],
  categories: [
    { id: 10, name: 'Shoulders' },
    { id: 11, name: 'Chest' },
  ],
  muscles: [
    { id: 4, name: 'Anterior deltoid', appGroups: ['Shoulders'] },
    { id: 5, name: 'Lateral deltoid', appGroups: ['Lateral Delts'] },
    { id: 7, name: 'Pectoralis major (clavicular)', appGroups: ['Upper Chest'] },
    { id: 9, name: 'Triceps brachii', appGroups: ['Long Head Triceps'] },
  ],
  equipment: [
    { id: 1, name: 'Dumbbells' },
    { id: 2, name: 'Barbell' },
  ],
  sync: {
    status: 'ready',
    lastSuccessfulSyncAt: '2026-03-24T08:00:00.000Z',
    lastAttemptAt: '2026-03-24T08:00:00.000Z',
    error: null,
    hasSeedData: true,
  },
};

export async function installVisualBootstrap(page) {
  await page.addInitScript(({ fixedDateIso }) => {
    const fixedNow = new Date(fixedDateIso).valueOf();
    const OriginalDate = Date;

    class MockDate extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) {
          super(fixedNow);
          return;
        }
        super(...args);
      }

      static now() {
        return fixedNow;
      }
    }

    Object.defineProperty(MockDate, 'UTC', { value: OriginalDate.UTC });
    Object.defineProperty(MockDate, 'parse', { value: OriginalDate.parse });
    window.Date = MockDate;
  }, { fixedDateIso: FIXED_TEST_DATE_ISO });

  await page.addInitScript(({ catalogState }) => {
    window.localStorage.setItem('tl_catalog_v1', JSON.stringify(catalogState));
  }, { catalogState: catalogSeedState });
}

export async function autoAcceptDialogs(page) {
  page.on('dialog', async dialog => {
    await dialog.accept();
  });
}

export async function waitForSeededWorkoutState(page) {
  await page.waitForFunction(() => {
    const raw = window.localStorage.getItem('tl_state_v1');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return !!parsed?.workoutLog && Object.keys(parsed.workoutLog).length > 0;
  });
}

export async function waitForScreen(page, testId) {
  await page.getByTestId(testId).waitFor({ state: 'visible' });
}
