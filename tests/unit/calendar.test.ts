import { describe, expect, it } from 'vitest';
import { lastDueDate, monthDays, tasksByDay } from '../../src/lib/calendar';
import type { Task } from '../../src/data/types';

const task = (over: Partial<Task>): Task => ({ id: 'x', dueDate: null, dueTime: null, order: 0, completedAt: null, ...over }) as Task;

describe('monthDays', () => {
  it('starts on Monday and covers whole weeks around the month', () => {
    // October 2026 starts on a Thursday
    const days = monthDays(new Date(2026, 9, 1));
    expect(days[0]!.getDay()).toBe(1);
    expect(days.length % 7).toBe(0);
    expect(days[days.length - 1]!.getDay()).toBe(0);
    expect(days.some((d) => d.getMonth() === 9 && d.getDate() === 31)).toBe(true);
  });

  it('a month that starts on a Monday needs no leading days', () => {
    // June 2026 starts on a Monday
    const days = monthDays(new Date(2026, 5, 1));
    expect(days[0]!.getDate()).toBe(1);
    expect(days[0]!.getMonth()).toBe(5);
  });
});

describe('tasksByDay', () => {
  it('groups by due date, timed tasks first in time order, then by order', () => {
    const map = tasksByDay([
      task({ id: 'a', dueDate: '2026-10-12', order: 1 }),
      task({ id: 'b', dueDate: '2026-10-12', dueTime: '15:00', order: 0 }),
      task({ id: 'c', dueDate: '2026-10-12', dueTime: '09:00', order: 5 }),
      task({ id: 'd', dueDate: null }),
    ]);
    expect(map.get('2026-10-12')!.map((t) => t.id)).toEqual(['c', 'b', 'a']);
    expect(map.has('null')).toBe(false);
    expect(map.size).toBe(1);
  });
});

describe('lastDueDate', () => {
  it('is the latest due date of the open tasks', () => {
    expect(
      lastDueDate([
        task({ dueDate: '2026-10-05' }),
        task({ dueDate: '2026-11-02' }),
        task({ dueDate: '2026-12-31', completedAt: '2026-10-01T00:00:00Z' }),
        task({ dueDate: null }),
      ]),
    ).toBe('2026-11-02');
  });

  it('is null without open dated tasks', () => {
    expect(lastDueDate([task({ dueDate: null }), task({ dueDate: '2026-01-01', completedAt: '2026-01-01T00:00:00Z' })])).toBeNull();
  });
});
