import type { ID, Project, Snapshot, Task, User, WorkspaceFile } from './types';

export interface LoadIssue {
  file: string;
  message: string;
}

export interface LoadResult {
  snapshot: Snapshot;
  /** OneDrive-Konfliktkopien (z. B. `abc-LAPTOP-123.json`), werden ignoriert */
  conflictCopies: string[];
  /** Dateien, die nicht gelesen werden konnten */
  issues: LoadIssue[];
  /** Eine Datei stammt aus einer neueren App-Version */
  newerSchema: boolean;
}

/** Was sich seit dem letzten Lesen/Schreiben im Speicher geändert hat */
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
 * Speicherschnittstelle. Die UI kennt nur diese Schnittstelle, nicht den Datei-Ordner.
 * Später kann hier z. B. ein Server angebunden werden.
 *
 * Die save*-Methoden prüfen vor dem Schreiben, ob der gespeicherte Stand inzwischen von
 * jemand anderem geändert wurde, führen dann zusammen und geben den tatsächlich geschriebenen Stand zurück.
 */
export interface Repository {
  readonly label: string;
  hasWorkspace(): Promise<boolean>;
  isEmpty(): Promise<boolean>;
  initialize(snapshot: Snapshot): Promise<void>;
  loadAll(): Promise<LoadResult>;
  /** Geänderte Dateien seit dem letzten Lesen/Schreiben */
  pullChanges(): Promise<ChangeSet>;
  saveWorkspace(ws: WorkspaceFile): Promise<WorkspaceFile>;
  saveUsers(users: User[]): Promise<User[]>;
  saveProjects(projects: Project[]): Promise<Project[]>;
  saveTask(task: Task): Promise<Task>;
  /** Endgültig entfernen (Aufräumen nach 30 Tagen), inkl. Anhänge */
  removeTask(id: ID): Promise<void>;

  writeBackup(name: string, snapshot: Snapshot): Promise<void>;
  listBackups(): Promise<BackupInfo[]>;
  readBackup(name: string): Promise<Snapshot>;
  removeBackup(name: string): Promise<void>;

  /** Speichert eine Datei als Anhang, gibt den (ggf. eindeutig gemachten) Dateinamen zurück */
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

export const ERROR_TEXT: Record<StorageErrorKind, string> = {
  permission: 'Kein Zugriff auf den Ordner.',
  notFound: 'Datenordner nicht gefunden. Wurde er verschoben oder umbenannt?',
  quota: 'Kein Speicherplatz mehr frei.',
  newerSchema: 'Die Daten stammen aus einer neueren Version der App. Bitte App aktualisieren.',
  other: 'Speichern fehlgeschlagen.',
};
