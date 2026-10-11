import type { TaskId } from './ids';
import type { ID, Project, Snapshot, Task, User, WorkspaceFile } from './types';
import type { Result } from './result';

export interface LoadIssue {
  file: string;
  message: string;
}

export interface LoadResult {
  snapshot: Snapshot;
  /** OneDrive conflict copies (e.g. `abc-LAPTOP-123.json`), are ignored */
  conflictCopies: string[];
  /** Files that could not be read */
  issues: LoadIssue[];
  /** A file comes from a newer app version */
  newerSchema: boolean;
}

/** What changed in storage since the last read/write */
export interface ChangeSet {
  tasks: Task[];
  removedTaskIds: TaskId[];
  users?: User[];
  projects?: Project[];
  workspace?: WorkspaceFile;
  conflictCopies: string[];
}

/** A conflict copy as read for the conflict dialog. `modified` is the time the copy was written. */
export type ConflictPayload =
  | { kind: 'task'; task: Task; modified: number }
  | { kind: 'users'; users: User[]; modified: number }
  | { kind: 'projects'; projects: Project[]; modified: number }
  | { kind: 'workspace'; modified: number }
  | { kind: 'unreadable'; message: string; modified: number };

export interface BackupInfo {
  name: string;
  lastModified: number;
  size: number;
}

/**
 * Storage interface. The UI only knows this interface, not the folder of files.
 * A server could be plugged in behind this interface later.
 *
 * The save* methods check before writing whether the stored state has meanwhile been changed
 * by someone else. They merge in that case and return the state that was actually written.
 */
/** A failed storage operation: what went wrong, and the exception it came from (if any) */
export interface StorageError {
  kind: StorageErrorKind;
  cause: unknown;
}

export interface Repository {
  readonly label: string;
  hasWorkspace(): Promise<boolean>;
  isEmpty(): Promise<boolean>;
  initialize(snapshot: Snapshot): Promise<Result<void, StorageError>>;
  loadAll(): Promise<Result<LoadResult, StorageError>>;
  /** Files changed since the last read/write */
  pullChanges(): Promise<Result<ChangeSet, StorageError>>;
  saveWorkspace(ws: WorkspaceFile): Promise<Result<WorkspaceFile, StorageError>>;
  saveUsers(users: User[]): Promise<Result<User[], StorageError>>;
  saveProjects(projects: Project[]): Promise<Result<Project[], StorageError>>;
  saveTask(task: Task): Promise<Result<Task, StorageError>>;
  /** Remove permanently (cleanup after 30 days), including attachments */
  removeTask(id: ID): Promise<Result<void, StorageError>>;

  writeBackup(name: string, snapshot: Snapshot): Promise<Result<void, StorageError>>;
  listBackups(): Promise<BackupInfo[]>;
  /** Reads a conflict copy (name as listed in `LoadResult.conflictCopies`); a copy that cannot be read is returned as `unreadable` */
  readConflictCopy(name: string): Promise<ConflictPayload>;
  removeConflictCopy(name: string): Promise<void>;
  readBackup(name: string): Promise<Result<Snapshot, StorageError>>;
  removeBackup(name: string): Promise<void>;

  /** Saves a file as attachment and returns its file name (made unique if needed) */
  writeAttachment(taskId: ID, fileName: string, data: Blob): Promise<string>;
  readAttachment(taskId: ID, fileName: string): Promise<File>;
  removeAttachment(taskId: ID, fileName: string): Promise<void>;
}

export type StorageErrorKind = 'permission' | 'notFound' | 'quota' | 'newerSchema' | 'other';

export function classifyError(e: unknown): StorageErrorKind {
  if (e instanceof DOMException) {
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') return 'permission';
    if (e.name === 'NotFoundError') return 'notFound';
    if (e.name === 'QuotaExceededError') return 'quota';
  }
  if (e instanceof Error && e.name === 'NewerSchemaError') return 'newerSchema';
  return 'other';
}

