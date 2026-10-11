// Data model of teamtodo. Every file in the data folder carries `schemaVersion`.

export type ID = string;
export type { TaskId, ProjectId, SectionId, UserId } from './ids';
import type { ActivityId, AttachmentId, CommentId, ProjectId, SectionId, TaskId, UserId } from './ids';
/** Calendar date without time, e.g. "2026-10-02" */
export type ISODate = string;
/** Timestamp, e.g. "2026-10-02T14:03:11.123Z" */
export type ISODateTime = string;

export const COLORS = ['teal', 'violet', 'amber', 'rose', 'blue', 'green', 'slate'] as const;
export type Color = (typeof COLORS)[number];

export interface WorkspaceFile {
  schemaVersion: number;
  id: ID;
  name: string;
  createdAt: ISODateTime;
  lastBackupDate?: ISODate | null;
  lastPurgeAt?: ISODateTime | null;
}

export interface User {
  id: UserId;
  name: string;
  color: Color;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deletedAt?: ISODateTime | null;
}
export interface UsersFile {
  schemaVersion: number;
  users: User[];
}

export interface Section {
  id: SectionId;
  name: string;
  order: number;
  updatedAt: ISODateTime;
  deletedAt?: ISODateTime | null;
}
/** One state of a project. `archived` and `deleted` keep the time they were set; deleted projects are purged after 30 days. */
export type ProjectState = { kind: 'active' } | { kind: 'archived'; at: ISODateTime } | { kind: 'deleted'; at: ISODateTime };

export interface Project {
  id: ProjectId;
  name: string;
  color: Color;
  order: number;
  sections: Section[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  state: ProjectState;
  /** Template: a project without a place in the project list. Its sections and tasks are the blueprint for new projects. */
  template?: boolean;
  /** Pinned projects stay above the unpinned ones in the sidebar; `order` arranges each group */
  pinned?: boolean;
}
export interface ProjectsFile {
  schemaVersion: number;
  projects: Project[];
}

/** "Done" is not a status but `completedAt`. The status is kept so that the task can be reopened. */
export type TaskStatus = 'todo' | 'doing' | 'waiting';

export interface Attachment {
  id: AttachmentId;
  fileName: string;
  size: number;
  mimeType: string;
  addedAt: ISODateTime;
  addedBy: UserId;
  removedAt?: ISODateTime | null;
}

export interface Comment {
  id: CommentId;
  userId: UserId;
  text: string;
  mentions: UserId[];
  at: ISODateTime;
  editedAt?: ISODateTime | null;
  deletedAt?: ISODateTime | null;
}

export type ActivityType =
  | 'created'
  | 'assigned'
  | 'unassigned'
  | 'due'
  | 'dueRemoved'
  | 'status'
  | 'completed'
  | 'reopened'
  | 'section'
  | 'project'
  | 'projectRemoved'
  | 'renamed'
  | 'deleted'
  | 'restored'
  | 'attachment';

export interface Activity {
  id: ActivityId;
  userId: UserId;
  type: ActivityType;
  data?: Record<string, string | null>;
  at: ISODateTime;
}

/** Fields that are compared individually by `fieldUpdatedAt` when merging. */
export const MERGEABLE_FIELDS = [
  'parentId',
  'projectId',
  'sectionId',
  'title',
  'description',
  'assigneeId',
  'dueDate',
  'dueTime',
  'status',
  'completedAt',
  'order',
  'followerIds',
  'tags',
  'deletedAt',
] as const;
export type MergeableField = (typeof MERGEABLE_FIELDS)[number];

/** Planned for later (recurring tasks), unused for now. */
export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
}

export interface Task {
  schemaVersion: number;
  id: TaskId;
  parentId: TaskId | null;
  projectId: ProjectId | null;
  sectionId: SectionId | null;
  title: string;
  description: string;
  assigneeId: UserId | null;
  dueDate: ISODate | null;
  dueTime: string | null;
  status: TaskStatus;
  completedAt: ISODateTime | null;
  order: number;
  followerIds: UserId[];
  attachments: Attachment[];
  comments: Comment[];
  activity: Activity[];
  createdAt: ISODateTime;
  createdBy: UserId;
  deletedAt: ISODateTime | null;
  fieldUpdatedAt: Partial<Record<MergeableField, ISODateTime>>;
  /** Short names, see lib/tags.ts */
  tags?: string[];
  recurrence?: RecurrenceRule | null;
}

/** Task in memory. `draft` = newly created, still without a title, not saved. */
export interface TaskState extends Task {
  draft?: boolean;
}

export interface Snapshot {
  workspace: WorkspaceFile;
  users: User[];
  projects: Project[];
  tasks: Task[];
}
