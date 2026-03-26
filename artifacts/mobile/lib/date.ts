export function formatLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getStartOfLocalWeek(date = new Date()): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return start;
}

export function getCurrentLocalWeekRange(date = new Date()): {
  weekStart: string;
  weekEnd: string;
} {
  return {
    weekStart: formatLocalDateKey(getStartOfLocalWeek(date)),
    weekEnd: formatLocalDateKey(date),
  };
}
