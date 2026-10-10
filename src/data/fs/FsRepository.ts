import { mergeProjects, mergeTask, mergeUsers, sameJson } from '../merge';
import { migrate, NewerSchemaError } from '../migrations';
import type { BackupInfo, ChangeSet, LoadIssue, LoadResult, Repository } from '../repository';
import { SCHEMA_VERSION } from '../schema';
import type { ID, Project, ProjectsFile, Snapshot, Task, User, UsersFile, WorkspaceFile } from '../types';
import { writeJson } from './jsonFile';

// Ordnerstruktur:
//   workspace.json, users.json, projects.json
//   tasks/<taskId>.json
//   attachments/<taskId>/<dateiname>
//   backups/<JJJJ-MM-TT>.json

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
  const clean = name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'file';
  if (!taken.has(clean)) return clean;
  const dot = clean.lastIndexOf('.');
  const stem = dot > 0 ? clean.slice(0, dot) : clean;
  const ext = dot > 0 ? clean.slice(dot) : '';
  for (let i = 2; ; i++) {
    const n = `${stem} (${i})${ext}`;
    if (!taken.has(n)) return n;
  }
}

export class FsRepository implements Repository {
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

  async initialize(snapshot: Snapshot) {
    for (const d of Object.values(DIRS)) await this.dir(d);
    await this.saveUsers(snapshot.users);
    await this.saveProjects(snapshot.projects);
    for (const t of snapshot.tasks) await this.saveTask(t);
    // workspace.json last: the folder counts as set up only once it exists
    await this.saveWorkspace(snapshot.workspace);
  }

  private async readJson<T>(handle: FileSystemFileHandle, path: string): Promise<T> {
    const file = await handle.getFile();
    this.known.set(path, file.lastModified);
    return JSON.parse(await file.text()) as T;
  }

  async loadAll(): Promise<LoadResult> {
    const issues: LoadIssue[] = [];
    let newerSchema = false;
    const note = (file: string, e: unknown) => {
      if (e instanceof NewerSchemaError) newerSchema = true;
      issues.push({ file, message: e instanceof Error ? e.message : String(e) });
    };

    const workspace = migrate<WorkspaceFile>('workspace', await this.readJson(await this.root.getFileHandle(FILES.workspace), FILES.workspace));
    let users: User[] = [];
    try {
      users = migrate<UsersFile>('users', await this.readJson(await this.root.getFileHandle(FILES.users), FILES.users)).users;
    } catch (e) {
      note(FILES.users, e);
    }
    let projects: Project[] = [];
    try {
      projects = migrate<ProjectsFile>('projects', await this.readJson(await this.root.getFileHandle(FILES.projects), FILES.projects)).projects;
    } catch (e) {
      note(FILES.projects, e);
    }

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

  async pullChanges(): Promise<ChangeSet> {
    const out: ChangeSet = { tasks: [], removedTaskIds: [], conflictCopies: [] };
    const top = await listFiles(this.root);
    const changed = (path: string, lm: number) => this.known.get(path) !== lm;

    for (const [name, f] of top) {
      if (TOP_CONFLICT.test(name)) out.conflictCopies.push(name);
      else if (!changed(name, f.lastModified)) continue;
      else
        try {
          if (name === FILES.users) out.users = migrate<UsersFile>('users', await this.readJson(f.handle, name)).users;
          else if (name === FILES.projects) out.projects = migrate<ProjectsFile>('projects', await this.readJson(f.handle, name)).projects;
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
        out.removedTaskIds.push(path.slice(DIRS.tasks.length + 1, -5));
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

  async saveWorkspace(ws: WorkspaceFile) {
    const data = { ...ws, schemaVersion: SCHEMA_VERSION };
    this.known.set(FILES.workspace, await writeJson(this.root, FILES.workspace, data));
    return data;
  }

  async saveUsers(users: User[]) {
    const merged = await this.writeChecked<UsersFile>(
      this.root,
      FILES.users,
      FILES.users,
      { schemaVersion: SCHEMA_VERSION, users },
      (raw) => migrate<UsersFile>('users', raw),
      (l, r) => ({ ...l, users: mergeUsers(l.users, r.users) }),
    );
    return sameJson(merged.users, users) ? users : merged.users;
  }

  async saveProjects(projects: Project[]) {
    const merged = await this.writeChecked<ProjectsFile>(
      this.root,
      FILES.projects,
      FILES.projects,
      { schemaVersion: SCHEMA_VERSION, projects },
      (raw) => migrate<ProjectsFile>('projects', raw),
      (l, r) => ({ ...l, projects: mergeProjects(l.projects, r.projects) }),
    );
    return sameJson(merged.projects, projects) ? projects : merged.projects;
  }

  async saveTask(task: Task) {
    const { draft: _draft, ...clean } = task as Task & { draft?: boolean };
    const data: Task = { ...clean, schemaVersion: SCHEMA_VERSION };
    const merged = await this.writeChecked<Task>(await this.dir(DIRS.tasks), `${task.id}.json`, `${DIRS.tasks}/${task.id}.json`, data, (raw) => migrate<Task>('task', raw), mergeTask);
    return sameJson(merged, data) ? task : merged;
  }

  async removeTask(id: ID) {
    const tasks = await this.dir(DIRS.tasks);
    await tasks.removeEntry(`${id}.json`).catch((e) => {
      if (!isNotFound(e)) throw e;
    });
    this.known.delete(`${DIRS.tasks}/${id}.json`);
    const att = await this.dir(DIRS.attachments);
    await att.removeEntry(id, { recursive: true }).catch(() => undefined);
  }

  /* ---------- Backups ---------- */

  async writeBackup(name: string, snapshot: Snapshot) {
    await writeJson(await this.dir(DIRS.backups), `${name}.json`, { schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(), ...snapshot });
  }

  async listBackups(): Promise<BackupInfo[]> {
    const files = await listFiles(await this.dir(DIRS.backups));
    return [...files]
      .filter(([n]) => n.endsWith('.json'))
      .map(([n, f]) => ({ name: n.slice(0, -5), lastModified: f.lastModified, size: f.size }))
      .sort((a, b) => b.name.localeCompare(a.name));
  }

  async readBackup(name: string): Promise<Snapshot> {
    const fh = await (await this.dir(DIRS.backups)).getFileHandle(`${name}.json`);
    const raw = JSON.parse(await (await fh.getFile()).text()) as Snapshot;
    return {
      workspace: migrate<WorkspaceFile>('workspace', raw.workspace),
      users: raw.users ?? [],
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
    const dir = await this.attachmentDir(taskId, false);
    return (await dir.getFileHandle(fileName)).getFile();
  }

  async removeAttachment(taskId: ID, fileName: string) {
    const dir = await this.attachmentDir(taskId, false).catch(() => null);
    await dir?.removeEntry(fileName).catch(() => undefined);
  }
}
