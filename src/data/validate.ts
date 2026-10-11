// Runtime checks for everything that is read from the data folder or from a backup.
// Files are written by other clients too, so a value is only used after it has passed these checks.
// Hand-written on purpose: the app has no runtime dependencies beyond the UI stack.

import { normalizeTag } from '../lib/tags';
import { observeStamp } from './clock';
import { brandId, type Brand } from './ids';
import {
  COLORS,
  type Activity,
  type ActivityType,
  type Attachment,
  type Comment,
  type Project,
  type RecurrenceRule,
  type Section,
  type Task,
  type TaskStatus,
  type User,
  type WorkspaceFile,
} from './types';

export class InvalidRecordError extends Error {
  override name = 'InvalidRecordError';
  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(`${path}: ${reason}`);
  }
}

type Check<T> = (value: unknown, path: string) => T;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'doing', 'waiting'];
const ACTIVITY_TYPES: readonly ActivityType[] = [
  'created',
  'assigned',
  'unassigned',
  'due',
  'dueRemoved',
  'status',
  'completed',
  'reopened',
  'section',
  'project',
  'projectRemoved',
  'renamed',
  'deleted',
  'restored',
  'attachment',
];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * IDs come from file content and become keys of records. Names that exist on every object
 * (`__proto__`, `constructor`, `toString`, …) are refused, so they can never shadow or pollute a record.
 */
export function isValidId(v: unknown): v is string {
  return typeof v === 'string' && ID_PATTERN.test(v) && !(v in Object.prototype);
}

const fail = (path: string, reason: string): never => {
  throw new InvalidRecordError(path, reason);
};

const id: Check<string> = (v, path) => (isValidId(v) ? v : fail(path, `expected an ID, got ${describe(v)}`));
/** Branded IDs: the brand is added here, after the check, and nowhere else from file content */
const idOf =
  <B extends string>(): Check<Brand<string, B>> =>
  (v, path) =>
    isValidId(v) ? brandId<B>(v) : fail(path, `expected an ID, got ${describe(v)}`);
const taskId = idOf<'TaskId'>();
const projectId = idOf<'ProjectId'>();
const sectionId = idOf<'SectionId'>();
const userId = idOf<'UserId'>();
const commentId = idOf<'CommentId'>();
const activityId = idOf<'ActivityId'>();
const attachmentId = idOf<'AttachmentId'>();
const str: Check<string> = (v, path) => (typeof v === 'string' ? v : fail(path, `expected a string, got ${describe(v)}`));
const num: Check<number> = (v, path) => (typeof v === 'number' && Number.isFinite(v) ? v : fail(path, `expected a number, got ${describe(v)}`));
const bool: Check<boolean> = (v, path) => (typeof v === 'boolean' ? v : fail(path, `expected a boolean, got ${describe(v)}`));
const dateTime: Check<string> = (v, path) => {
  if (typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v))) {
    observeStamp(v);
    return v;
  }
  return fail(path, `expected an ISO timestamp, got ${describe(v)}`);
};
const date: Check<string> = (v, path) =>
  typeof v === 'string' && DATE_PATTERN.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : fail(path, `expected a date YYYY-MM-DD, got ${describe(v)}`);
const time: Check<string> = (v, path) => (typeof v === 'string' && TIME_PATTERN.test(v) ? v : fail(path, `expected a time HH:MM, got ${describe(v)}`));

function oneOf<T extends string>(values: readonly T[]): Check<T> {
  return (v, path) => (typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : fail(path, `unknown value ${describe(v)}`));
}

function arrayOf<T>(item: Check<T>): Check<T[]> {
  return (v, path) => {
    if (!Array.isArray(v)) return fail(path, `expected a list, got ${describe(v)}`);
    return v.map((x, i) => item(x, `${path}[${i}]`));
  };
}

/** Value may be null (or absent after normalization). */
const nullable =
  <T>(check: Check<T>): Check<T | null> =>
  (v, path) =>
    v === null ? null : check(v, path);

/** Value may be missing entirely. */
const optional =
  <T>(check: Check<T>): Check<T | undefined> =>
  (v, path) =>
    v === undefined ? undefined : check(v, path);

function objectOf<T>(shape: { [K in keyof T]-?: Check<T[K]> }): Check<T> {
  return (v, path) => {
    if (!isRecord(v)) return fail(path, `expected an object, got ${describe(v)}`);
    const out: Record<string, unknown> = { ...v };
    for (const key of Object.keys(shape) as (keyof T & string)[]) {
      out[key] = shape[key](v[key], `${path}.${key}`);
    }
    return out as T;
  };
}

function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'a list';
  if (typeof v === 'string') return `"${v.slice(0, 40)}"`;
  return typeof v === 'object' ? 'an object' : String(v);
}

/** Reserved for recurring tasks, checked so that the shape is known once they are used. */
const recurrence = objectOf<RecurrenceRule>({
  freq: oneOf<RecurrenceRule['freq']>(['daily', 'weekly', 'monthly', 'yearly']),
  interval: num,
});

const tagName: Check<string> = (v, path) =>
  typeof v === 'string' && v !== '' && v === normalizeTag(v) ? v : fail(path, `expected a tag, got ${describe(v)}`);

const fieldTimestamps: Check<Record<string, string>> = (v, path) => {
  if (!isRecord(v)) return fail(path, `expected an object, got ${describe(v)}`);
  // Unknown fields are ignored (they may come from a newer version), but known ones must have a timestamp.
  for (const [key, value] of Object.entries(v)) dateTime(value, `${path}.${key}`);
  return v as Record<string, string>;
};

const attachment = objectOf<Attachment>({
  id: attachmentId,
  fileName: str,
  size: num,
  mimeType: str,
  addedAt: dateTime,
  addedBy: userId,
  removedAt: optional(nullable(dateTime)),
});

const comment = objectOf<Comment>({
  id: commentId,
  userId,
  text: str,
  mentions: arrayOf(userId),
  at: dateTime,
  editedAt: optional(nullable(dateTime)),
  deletedAt: optional(nullable(dateTime)),
});

const activity = objectOf<Activity>({
  id: activityId,
  userId,
  type: oneOf(ACTIVITY_TYPES),
  data: optional((v, path) => {
    if (!isRecord(v)) return fail(path, `expected an object, got ${describe(v)}`);
    for (const [key, value] of Object.entries(v)) if (value !== null) str(value, `${path}.${key}`);
    return v as Record<string, string | null>;
  }),
  at: dateTime,
});

export const validateTask: Check<Task> = objectOf<Task>({
  schemaVersion: num,
  id: taskId,
  parentId: nullable(taskId),
  projectId: nullable(projectId),
  sectionId: nullable(sectionId),
  title: str,
  description: str,
  assigneeId: nullable(userId),
  dueDate: nullable(date),
  dueTime: nullable(time),
  status: oneOf(TASK_STATUSES),
  completedAt: nullable(dateTime),
  order: num,
  followerIds: arrayOf(userId),
  attachments: arrayOf(attachment),
  comments: arrayOf(comment),
  activity: arrayOf(activity),
  createdAt: dateTime,
  createdBy: userId,
  deletedAt: nullable(dateTime),
  fieldUpdatedAt: fieldTimestamps,
  tags: optional(arrayOf(tagName)),
  recurrence: optional(nullable(recurrence)),
}) as Check<Task>;

export const validateSection: Check<Section> = objectOf<Section>({
  id: sectionId,
  name: str,
  order: num,
  updatedAt: dateTime,
  deletedAt: optional(nullable(dateTime)),
});

export const validateProject: Check<Project> = objectOf<Project>({
  id: projectId,
  name: str,
  color: oneOf(COLORS),
  order: num,
  sections: arrayOf(validateSection),
  createdAt: dateTime,
  updatedAt: dateTime,
  archivedAt: optional(nullable(dateTime)),
  deletedAt: optional(nullable(dateTime)),
  template: optional(bool),
  pinned: optional(bool),
});

export const validateUser: Check<User> = objectOf<User>({
  id: userId,
  name: str,
  color: oneOf(COLORS),
  createdAt: dateTime,
  updatedAt: dateTime,
  deletedAt: optional(nullable(dateTime)),
});

export const validateWorkspace: Check<WorkspaceFile> = objectOf<WorkspaceFile>({
  schemaVersion: num,
  id,
  name: str,
  createdAt: dateTime,
  lastBackupDate: optional(nullable(date)),
  lastPurgeAt: optional(nullable(dateTime)),
});
