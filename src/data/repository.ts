import type { ID, Project, Snapshot, Task, User, WorkspaceFile } from './types';

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
  removedTaskIds: ID[];
  users?: User[];
  projects?: Project[];
  workspace?: WorkspaceFile;
  conflictCopies: string[];
}

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
export interface Repository {
  readonly label: string;
  hasWorkspace(): Promise<boolean>;
  isEmpty(): Promise<boolean>;
  initialize(snapshot: Snapshot): Promise<void>;
  loadAll(): Promise<LoadResult>;
  /** Files changed since the last read/write */
  pullChanges(): Promise<ChangeSet>;
  saveWorkspace(ws: WorkspaceFile): Promise<WorkspaceFile>;
  saveUsers(users: User[]): Promise<User[]>;
  saveProjects(projects: Project[]): Promise<Project[]>;
  saveTask(task: Task): Promise<Task>;
  /** Remove permanently (cleanup after 30 days), including attachments */
  removeTask(id: ID): Promise<void>;

  writeBackup(name: string, snapshot: Snapshot): Promise<void>;
  listBackups(): Promise<BackupInfo[]>;
  readBackup(name: string): Promise<Snapshot>;
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

