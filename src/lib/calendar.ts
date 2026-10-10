import { eachDayOfInterval, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import type { ISODate, Task } from '../data/types';

// Calendar view helpers. The week starts on Monday.

export const WEEK_STARTS_ON = 1;

/** All days shown in the month grid: whole weeks, Monday first, including the days of the neighbouring months */
export function monthDays(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_STARTS_ON });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: WEEK_STARTS_ON });
  return eachDayOfInterval({ start, end });
}

/** Tasks per due day, sorted by time (tasks without a time last), then by order */
export function tasksByDay<T extends Task>(tasks: T[]): Map<ISODate, T[]> {
  const map = new Map<ISODate, T[]>();
  for (const t of tasks) {
    if (!t.dueDate) continue;
    (map.get(t.dueDate) ?? map.set(t.dueDate, []).get(t.dueDate)!).push(t);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') || a.order - b.order);
  }
  return map;
}

/** Latest due date of the open tasks, or null. ISO dates compare correctly as strings. */
export function lastDueDate(tasks: Task[]): ISODate | null {
  let last: ISODate | null = null;
  for (const t of tasks) {
    if (t.dueDate && !t.completedAt && (!last || t.dueDate > last)) last = t.dueDate;
  }
  return last;
}
