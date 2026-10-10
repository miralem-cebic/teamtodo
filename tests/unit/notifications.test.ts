import { afterEach, describe, expect, it } from 'vitest';
import { assignmentNotices, dueNotices } from '../../src/lib/notifications';
import { setLanguage } from '../../src/store/prefs';
import type { Activity, ID, TaskState, User } from '../../src/data/types';

const ME = 'me';
const OTHER = 'other';
const users = [
  { id: ME, name: 'Pia' },
  { id: OTHER, name: 'Jonas Weber' },
] as unknown as User[];
const SINCE = '2026-10-10T08:00:00.000Z';
const NOW = new Date(2026, 9, 10, 9, 30); // local time: 09:30 on 2026-10-10
const TODAY = '2026-10-10';

afterEach(() => setLanguage('en'));

function task(id: ID, p: Partial<TaskState> = {}): TaskState {
  return {
    id,
    title: `Task ${id}`,
    assigneeId: null,
    dueDate: null,
    dueTime: null,
    completedAt: null,
    deletedAt: null,
    draft: false,
    activity: [],
    ...p,
  } as unknown as TaskState;
}

function assigned(id: string, by: ID, to: ID | null, at: string): Activity {
  return { id, type: 'assigned', at, userId: by, data: { userId: to, name: null } } as unknown as Activity;
}

describe('assignmentNotices', () => {
  it('notifies about a new assignment to me by someone else', () => {
    const tasks = { a: task('a', { assigneeId: ME, activity: [assigned('x1', OTHER, ME, '2026-10-10T09:00:00.000Z')] }) };
    const out = assignmentNotices(tasks, ME, SINCE, new Set(), users);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: 'assigned:x1', taskId: 'a', title: 'Task assigned to you', body: 'Jonas Weber assigned you “Task a”' });
  });

  it('stays silent for assignments before the app started, for self-assignments and for others', () => {
    const tasks = {
      old: task('old', { activity: [assigned('x0', OTHER, ME, '2026-10-10T07:00:00.000Z')] }),
      mine: task('mine', { activity: [assigned('x2', ME, ME, '2026-10-10T09:00:00.000Z')] }),
      theirs: task('theirs', { activity: [assigned('x3', OTHER, OTHER, '2026-10-10T09:00:00.000Z')] }),
    };
    expect(assignmentNotices(tasks, ME, SINCE, new Set(), users)).toEqual([]);
  });

  it('does not repeat a notice that was already seen', () => {
    const tasks = { a: task('a', { activity: [assigned('x1', OTHER, ME, '2026-10-10T09:00:00.000Z')] }) };
    expect(assignmentNotices(tasks, ME, SINCE, new Set(['assigned:x1']), users)).toEqual([]);
  });
});

describe('dueNotices', () => {
  const mine = (id: ID, p: Partial<TaskState>) => task(id, { assigneeId: ME, dueDate: TODAY, ...p });

  it('notifies once for a task due today without a time', () => {
    const out = dueNotices({ a: mine('a', {}) }, ME, NOW, TODAY, new Set());
    expect(out).toEqual([{ key: `today:a:${TODAY}`, taskId: 'a', title: 'Due today', body: 'Task a' }]);
  });

  it('notifies within one hour before a due time, not earlier and not after the time', () => {
    expect(dueNotices({ a: mine('a', { dueTime: '10:15' }) }, ME, NOW, TODAY, new Set())).toHaveLength(1);
    expect(dueNotices({ a: mine('a', { dueTime: '12:00' }) }, ME, NOW, TODAY, new Set())).toEqual([]);
    expect(dueNotices({ a: mine('a', { dueTime: '09:00' }) }, ME, NOW, TODAY, new Set())).toEqual([]);
  });

  it('skips completed, deleted, draft, other people’s and not-today tasks', () => {
    const tasks = {
      done: mine('done', { completedAt: '2026-10-10T08:00:00.000Z' }),
      gone: mine('gone', { deletedAt: '2026-10-10T08:00:00.000Z' }),
      draft: mine('draft', { draft: true }),
      theirs: mine('theirs', { assigneeId: OTHER }),
      later: mine('later', { dueDate: '2026-10-11' }),
    };
    expect(dueNotices(tasks, ME, NOW, TODAY, new Set())).toEqual([]);
  });

  it('does not repeat seen notices', () => {
    expect(dueNotices({ a: mine('a', {}) }, ME, NOW, TODAY, new Set([`today:a:${TODAY}`]))).toEqual([]);
  });
});
