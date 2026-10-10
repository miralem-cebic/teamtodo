import { STATUS_LABEL, type Activity, type TaskStatus, type User } from '../data/types';
import { fmtDate } from './dates';

/** Sentence describing an activity (without the name of the person who did it) */
export function activityText(a: Activity, users: User[]): string {
  const d = a.data ?? {};
  const name = (id?: string | null, fallback?: string | null) => users.find((u) => u.id === id)?.name ?? fallback ?? 'someone';
  switch (a.type) {
    case 'created':
      return 'created the task';
    case 'assigned':
      return `assigned ${name(d.userId, d.name)}`;
    case 'unassigned':
      return 'removed the assignment';
    case 'due':
      return d.date ? `set the due date to ${fmtDate(d.date)}` : 'changed the due date';
    case 'dueRemoved':
      return 'removed the due date';
    case 'status':
      return `set the status to "${STATUS_LABEL[d.status as TaskStatus] ?? d.status}"`;
    case 'completed':
      return 'completed the task';
    case 'reopened':
      return 'reopened the task';
    case 'section':
      return `moved the task to "${d.name ?? '?'}"`;
    case 'project':
      return `added the task to "${d.name ?? '?'}"`;
    case 'projectRemoved':
      return 'removed the task from the project';
    case 'renamed':
      return 'renamed the task';
    case 'deleted':
      return 'deleted the task';
    case 'restored':
      return 'restored the task';
    case 'attachment':
      return `attached "${d.name ?? 'a file'}"`;
  }
}
