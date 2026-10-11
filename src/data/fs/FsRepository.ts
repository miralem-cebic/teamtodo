import { brandId } from '../ids';
import { mergeProjects, mergeTask, mergeUsers, sameJson } from '../merge';
import { migrate, migrateCollection, NewerSchemaError, type RejectedRecord } from '../migrations';
import { classifyError, type BackupInfo, type ChangeSet, type ConflictPayload, type LoadIssue, type LoadResult, type Repository, type StorageError } from '../repository';
import { err, ok, type Result } from '../result';
import { SCHEMA_VERSION } from '../schema';
import type { ID, Project, ProjectsFile, Snapshot, Task, User, UsersFile, WorkspaceFile } from '../types';
import { writeJson, writeLargeJson } from './jsonFile';
import { isSafeFileName, toSafeFileName, UnsafeFileNameError } from './fileNames';

// Ordnerstruktur:
//   workspace.json, users.json, projects.json
//   tasks/<taskId>.json
//   attachments/<taskId>/<dateiname>
//   backups/<JJJJ-MM-TT>.json

/** The raw entries of a collection file that were rejected, to write them back unchanged */
function brokenEntries(raw: unknown, kind: 'users' | 'projects', rejected: RejectedRecord[]): unknown[] {
  const list = (raw as Record<string, unknown>)[kind];
  if (!Array.isArray(list)) return [];
  return rejected.map((r) => list[Number(/\[(\d+)\]$/.exec(r.path)?.[1])]).filter((x) => x !== undefined);
}

export const FILES = { workspace: 'workspace.json', users: 'users.json', projects: 'projects.json' } as const;
export const DIRS = { tasks: 'tasks', attachments: 'attachments', backups: 'backups' } as const;

const TASK_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i;
const TOP_CONFLICT = /^(workspace|users|projects)[-\s].+\.json$/i;
const isNotFound = (e: unknown) => e instanceof DOMException && e.name === 'NotFoundError';

/** Files of a directory (without helper files such as .crswap, .DS_Store, ~$…), with lastModified */
async function listFiles(dir: FileSystemDirectoryHandle): Promise<Map<string, { handle: FileSystemFileHandle; lastModified: number; size: number }>> {
  const out = new Map<string, { handle: FileSystemFileHandle; lastModified: number; size: number }>();
  const jobs: Promise<void>[] = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind !== 'file' || name.startsWith('.') || name.startsWith('~')) continue;
    if (name.endsWith('.crswap') || name.endsWith('.tmp')) continue;
    jobs.push(
      (h as FileSystemFileHandle).getFile().then(
        (f) => void out.set(name, { handle: h as FileSystemFileHandle, lastModified: f.lastModified, size: f.size }),
        () => undefined, // file vanished while being read (OneDrive) → skip
      ),
    );
  }
  await Promise.all(jobs);
  return out;
}

/** "report.pdf" → "report (2).pdf" if the name is already taken */
function uniqueName(name: string, taken: Set<string>): string {
  const clean = toSafeFileName(name);
  if (!taken.has(clean)) return clean;
  const dot = clean.lastIndexOf('.');
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';
  for (let i = 2; ; i++) {
    const n = `${stem} (${i})${ext}`;
    if (!taken.has(n)) return n;
  }
}

/** Runs a storage operation: an exception from the browser API becomes a failed result */
async function attempt<T>(run: () => Promise<T>): Promise<Result<T, StorageError>> {
  try {
    return ok(await run());
  } catch (cause) {
    return err({ kind: classifyError(cause), cause });
  }
}

export class FsRepository implements Repository {
  loadAll() {
    return attempt(() => this.runLoadAll());
  }

  pullChanges() {
    return attempt(() => this.runPullChanges());
  }

  readBackup(name: string) {
    return attempt(() => this.runReadBackup(name));
  }

  /* The public reads and writes return results: an exception from the browser API becomes a failed result, once, here. */
  initialize(snapshot: Snapshot) {
    return attempt(() => this.runInitialize(snapshot));
  }

  saveWorkspace(ws: WorkspaceFile) {
    return attempt(() => this.runSaveWorkspace(ws));
  }

  saveUsers(users: User[]) {
    return attempt(() => this.runSaveUsers(users));
  }

  saveProjects(projects: Project[]) {
    return attempt(() => this.runSaveProjects(projects));
  }

  saveTask(task: Task) {
    return attempt(() => this.runSaveTask(task));
  }

  removeTask(id: ID) {
    return attempt(() => this.runRemoveTask(id));
  }

  writeBackup(name: string, snapshot: Snapshot) {
    return attempt(() => this.runWriteBackup(name, snapshot));
  }

  /** Path → lastModified at the last read/write */
  readonly known = new Map<string, number>();

  constructor(private readonly root: FileSystemDirectoryHandle) {}

  get label() {
    return this.root.name;
  }

  async hasWorkspace() {
    try {
      await this.root.getFileHandle(FILES.workspace);
      return true;
    } catch {
      return false;
    }
  }

  async isEmpty() {
    for await (const [name] of this.root.entries()) {
      if (!name.startsWith('.')) return false;
    }
    return true;
  }

  private dir(name: string) {
    return this.root.getDirectoryHandle(name, { create: true });
  }

  private async runInitialize(snapshot: Snapshot) {
    for (const d of Object.values(DIRS)) await this.dir(d);
    await this.runSaveUsers(snapshot.users);
    await this.runSaveProjects(snapshot.projects);
    for (const t of snapshot.tasks) await this.runSaveTask(t);
    // workspace.json last: the folder counts as set up only once it exists
    await this.runSaveWorkspace(snapshot.workspace);
  }

  private async readJson<T>(handle: FileSystemFileHandle, path: string): Promise<T> {
    const file = await handle.getFile();
    this.known.set(path, file.lastModified);
    return JSON.parse(await file.text()) as T;
  }

  private async runLoadAll(): Promise<LoadResult> {
    const issues: LoadIssue[] = [];
    let newerSchema = false;
    const note = (file: string, e: unknown) => {
      if (e instanceof NewerSchemaError) newerSchema = true;
      issues.push({ file, message: e instanceof Error ? e.message : String(e) });
    };

    const workspace = migrate<WorkspaceFile>('workspace', await this.readJson(await this.root.getFileHandle(FILES.workspace), FILES.workspace));
    // A broken user or project is left out and reported; the rest of the file still loads
    const loadCollection = async <T>(kind: 'users' | 'projects', file: string): Promise<T[]> => {
      try {
        const res = migrateCollection(kind, await this.readJson(await this.root.getFileHandle(file), file));
        for (const r of res.rejected) issues.push({ file: `${file} › ${r.path}`, message: r.message });
        return res.items as T[];
      } catch (e) {
        note(file, e);
        return [];
      }
    };
    const users = await loadCollection<User>('users', FILES.users);
    const projects = await loadCollection<Project>('projects', FILES.projects);

    const conflictCopies = [...(await listFiles(this.root)).keys()].filter((n) => TOP_CONFLICT.test(n));
    const tasks: Task[] = [];
    const files = await listFiles(await this.dir(DIRS.tasks));
    await Promise.all(
      [...files].map(async ([name, f]) => {
        if (!name.endsWith('.json')) return;
        if (!TASK_FILE.test(name)) return void conflictCopies.push(`${DIRS.tasks}/${name}`);
        try {
          tasks.push(migrate<Task>('task', await this.readJson(f.handle, `${DIRS.tasks}/${name}`)));
        } catch (e) {
          note(`${DIRS.tasks}/${name}`, e);
        }
      }),
    );
    return { snapshot: { workspace, users, projects, tasks }, conflictCopies, issues, newerSchema };
  }

  private async runPullChanges(): Promise<ChangeSet> {
    const out: ChangeSet = { tasks: [], removedTaskIds: [], conflictCopies: [] };
    const top = await listFiles(this.root);
    const changed = (path: string, lm: number) => this.known.get(path) !== lm;

    for (const [name, f] of top) {
      if (TOP_CONFLICT.test(name)) out.conflictCopies.push(name);
      else if (!changed(name, f.lastModified)) continue;
      else
        try {
          // broken records are reported on load; the valid ones are applied here
          if (name === FILES.users) out.users = migrateCollection('users', await this.readJson(f.handle, name)).items as User[];
          else if (name === FILES.projects) out.projects = migrateCollection('projects', await this.readJson(f.handle, name)).items as Project[];
          else if (name === FILES.workspace) out.workspace = migrate<WorkspaceFile>('workspace', await this.readJson(f.handle, name));
        } catch {
          /* half-written file (OneDrive) → retried on the next pass */
        }
    }

    const files = await listFiles(await this.dir(DIRS.tasks));
    const seen = new Set<string>();
    for (const [name, f] of files) {
      if (!name.endsWith('.json')) continue;
      if (!TASK_FILE.test(name)) {
        out.conflictCopies.push(`${DIRS.tasks}/${name}`);
        continue;
      }
      const path = `${DIRS.tasks}/${name}`;
      seen.add(path);
      if (!changed(path, f.lastModified)) continue;
      try {
        out.tasks.push(migrate<Task>('task', await this.readJson(f.handle, path)));
      } catch {
        /* siehe oben */
      }
    }
    for (const path of [...this.known.keys()]) {
      if (path.startsWith(`${DIRS.tasks}/`) && !seen.has(path)) {
        this.known.delete(path);
        out.removedTaskIds.push(brandId<'TaskId'>(path.slice(DIRS.tasks.length + 1, -5)));
      }
    }
    return out;
  }

  /**
   * Writes with a conflict check: if the file was changed externally since the last read,
   * it is read again and merged with `merge`.
   */
  private async writeChecked<T>(dir: FileSystemDirectoryHandle, name: string, path: string, data: T, parse: (raw: unknown) => T, merge: (local: T, remote: T) => T): Promise<T> {
    let next = data;
    try {
      const fh = await dir.getFileHandle(name);
      const file = await fh.getFile();
      const known = this.known.get(path);
      if (known === undefined || file.lastModified > known) {
        const text = await file.text();
        if (text.trim()) next = merge(data, parse(JSON.parse(text)));
      }
    } catch (e) {
      if (!isNotFound(e) && !(e instanceof SyntaxError)) throw e;
    }
    this.known.set(path, await writeJson(dir, name, next));
    return next;
  }

  private async runSaveWorkspace(ws: WorkspaceFile) {
    const data = { ...ws, schemaVersion: SCHEMA_VERSION };
    this.known.set(FILES.workspace, await writeJson(this.root, FILES.workspace, data));
    return data;
  }

  private async runSaveUsers(users: User[]) {
    const merged = await this.writeCollection('users', users, mergeUsers);
    return sameJson(merged, users) ? users : merged;
  }

  private async runSaveProjects(projects: Project[]) {
    const merged = await this.writeCollection('projects', projects, mergeProjects);
    return sameJson(merged, projects) ? projects : merged;
  }

  /**
   * Users and projects, with the same conflict check as `writeChecked`. A broken record in the file
   * from another client does not block the save: the valid records are merged, and the broken ones are
   * written back unchanged, so nothing is lost.
   */
  private async writeCollection<T>(kind: 'users' | 'projects', local: T[], merge: (local: T[], remote: T[]) => T[]): Promise<T[]> {
    const name = kind === 'users' ? FILES.users : FILES.projects;
    let next = local;
    let broken: unknown[] = [];
    try {
      const file = await (await this.root.getFileHandle(name)).getFile();
      const known = this.known.get(name);
      if (known === undefined || file.lastModified > known) {
        const text = await file.text();
        if (text.trim()) {
          const raw = JSON.parse(text) as unknown;
          const res = migrateCollection(kind, raw);
          broken = brokenEntries(raw, kind, res.rejected);
          next = merge(local, res.items as T[]);
        }
      }
    } catch (e) {
      if (!isNotFound(e) && !(e instanceof SyntaxError)) throw e;
    }
    this.known.set(name, await writeJson(this.root, name, { schemaVersion: SCHEMA_VERSION, [kind]: [...next, ...broken] }));
    return next;
  }

  private async runSaveTask(task: Task) {
    const { draft: _draft, ...clean } = task as Task & { draft?: boolean };
    const data: Task = { ...clean, schemaVersion: SCHEMA_VERSION };
    const merged = await this.writeChecked<Task>(await this.dir(DIRS.tasks), `${task.id}.json`, `${DIRS.tasks}/${task.id}.json`, data, (raw) => migrate<Task>('task', raw), mergeTask);
    return sameJson(merged, data) ? task : merged;
  }

  private async runRemoveTask(id: ID) {
    const tasks = await this.dir(DIRS.tasks);
    await tasks.removeEntry(`${id}.json`).catch((e) => {
      if (!isNotFound(e)) throw e;
    });
    this.known.delete(`${DIRS.tasks}/${id}.json`);
    const att = await this.dir(DIRS.attachments);
    await att.removeEntry(id, { recursive: true }).catch(() => undefined);
  }

  /* ---------- Backups ---------- */

  private async runWriteBackup(name: string, snapshot: Snapshot) {
    // Tasks are the big part: they are written in batches instead of one JSON string for the whole backup
    const { tasks, ...rest } = snapshot;
    await writeLargeJson(await this.dir(DIRS.backups), `${name}.json`, { schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(), ...rest }, { tasks });
  }

  async listBackups(): Promise<BackupInfo[]> {
    const files = await listFiles(await this.dir(DIRS.backups));
    return [...files]
      .filter(([n]) => n.endsWith('.json'))
      .map(([n, f]) => ({ name: n.slice(0, -5), lastModified: f.lastModified, size: f.size }))
      .sort((a, b) => b.name.localeCompare(a.name));
  }

  /** A conflict copy of a task is listed as `tasks/<file>`, all others are in the top folder */
  private async conflictLocation(name: string) {
    if (name.startsWith(`${DIRS.tasks}/`)) return { dir: await this.dir(DIRS.tasks), file: name.slice(DIRS.tasks.length + 1) };
    return { dir: this.root, file: name };
  }

  async readConflictCopy(name: string): Promise<ConflictPayload> {
    const { dir, file } = await this.conflictLocation(name);
    const f = await (await dir.getFileHandle(file)).getFile();
    const modified = f.lastModified;
    try {
      const raw = JSON.parse(await f.text()) as unknown;
      if (name.startsWith(`${DIRS.tasks}/`)) return { kind: 'task', task: migrate<Task>('task', raw), modified };
      if (/^users/i.test(name)) return { kind: 'users', users: migrate<UsersFile>('users', raw).users, modified };
      if (/^projects/i.test(name)) return { kind: 'projects', projects: migrate<ProjectsFile>('projects', raw).projects, modified };
      migrate<WorkspaceFile>('workspace', raw);
      return { kind: 'workspace', modified };
    } catch (e) {
      return { kind: 'unreadable', message: e instanceof Error ? e.message : String(e), modified };
    }
  }

  async removeConflictCopy(name: string) {
    const { dir, file } = await this.conflictLocation(name);
    await dir.removeEntry(file);
  }

  private async runReadBackup(name: string): Promise<Snapshot> {
    const fh = await (await this.dir(DIRS.backups)).getFileHandle(`${name}.json`);
    const raw = JSON.parse(await (await fh.getFile()).text()) as Snapshot;
    return {
      workspace: migrate<WorkspaceFile>('workspace', raw.workspace),
      users: migrate<UsersFile>('users', { schemaVersion: SCHEMA_VERSION, users: raw.users ?? [] }).users,
      projects: migrate<ProjectsFile>('projects', { schemaVersion: SCHEMA_VERSION, projects: raw.projects ?? [] }).projects,
      tasks: (raw.tasks ?? []).map((t) => migrate<Task>('task', t)),
    };
  }

  async removeBackup(name: string) {
    await (await this.dir(DIRS.backups)).removeEntry(`${name}.json`).catch(() => undefined);
  }

  /* ---------- Attachments ---------- */

  private async attachmentDir(taskId: ID, create: boolean) {
    return (await this.dir(DIRS.attachments)).getDirectoryHandle(taskId, { create });
  }

  async writeAttachment(taskId: ID, fileName: string, data: Blob) {
    const dir = await this.attachmentDir(taskId, true);
    const taken = new Set<string>();
    for await (const [n] of dir.entries()) taken.add(n);
    const name = uniqueName(fileName, taken);
    const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
    try {
      await w.write(data);
      await w.close();
    } catch (e) {
      await w.abort().catch(() => undefined);
      throw e;
    }
    return name;
  }

  async readAttachment(taskId: ID, fileName: string) {
    // The name comes from a task file, which other people may have written: never use it unchecked
    if (!isSafeFileName(fileName)) throw new UnsafeFileNameError(fileName);
    const dir = await this.attachmentDir(taskId, false);
    return (await dir.getFileHandle(fileName)).getFile();
  }

  async removeAttachment(taskId: ID, fileName: string) {
    if (!isSafeFileName(fileName)) return;
    const dir = await this.attachmentDir(taskId, false).catch(() => null);
    await dir?.removeEntry(fileName).catch(() => undefined);
  }
}
