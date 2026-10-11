import { keysOf } from './ids';
import { setSaveStatus, takeTouchedTasks, useApp, type AppState } from '../store/appStore';
import { classifyError, type Repository, type StorageError } from './repository';
import { err, ok, type Result } from './result';
import { integrateProjects, integrateUsers, integrateWrittenTask } from './sync';
import type { TaskId } from './ids';
import type { TaskState } from './types';
import type { Snapshot } from './types';

// Watches the app state and writes changed entities to storage in batches (debounced).
// Objects that come from storage or were already written are kept in `clean`
// and do not trigger another write.

export const DEBOUNCE_MS = 400;
/** Safety net: a full pass over all tasks this often finds a change that was not reported as touched */
export const SWEEP_MS = 10_000;
export const EMERGENCY_KEY = 'teamtodo.unsaved.v1';
export const LEGACY_EMERGENCY_KEY = 'teamaufgaben.unsaved.v1'; // before the rename to teamtodo

type Job = () => Promise<Result<void, StorageError>>;

export class Persister {
  private clean = new WeakSet<object>();
  private queue = new Map<string, Job>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  private failed = false;
  private sweep: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly repo: Repository) {}

  markCleanObject(o: object) {
    this.clean.add(o);
  }
  isClean(o: object) {
    return this.clean.has(o);
  }

  /** Mark the known state as "saved" (after loading) */
  markClean(snap: Pick<Snapshot, 'users' | 'projects' | 'tasks'> & { workspace?: object | null }) {
    this.clean.add(snap.users);
    this.clean.add(snap.projects);
    if (snap.workspace) this.clean.add(snap.workspace);
    for (const t of snap.tasks) this.clean.add(t);
  }

  start() {
    const s = useApp.getState();
    this.markClean({ users: s.users, projects: s.projects, tasks: Object.values(s.tasks), workspace: s.workspace });
    this.unsubscribe = useApp.subscribe((next, prev) => this.diff(next, prev));
    this.sweep = setInterval(() => this.sweepAll(), SWEEP_MS);
    window.addEventListener('beforeunload', this.onUnload);
  }

  stop() {
    this.unsubscribe?.();
    window.removeEventListener('beforeunload', this.onUnload);
    if (this.timer) clearTimeout(this.timer);
    if (this.sweep) clearInterval(this.sweep);
    this.sweep = null;
  }

  get pending() {
    return this.queue.size > 0 || !!this.running;
  }

  private onUnload = (e: BeforeUnloadEvent) => {
    if (!this.pending) return;
    this.writeEmergencyCopy();
    e.preventDefault();
  };

  private diff(next: AppState, prev: AppState) {
    if (next.tasks !== prev.tasks) {
      // Only the tasks that were reported as touched (see touchTasks in appStore), not all of them
      const touched = takeTouchedTasks();
      this.diffTasks(next.tasks, prev.tasks, touched === 'all' ? keysOf(next.tasks) : touched);
    }
    if (next.projects !== prev.projects && !this.clean.has(next.projects)) {
      const list = next.projects;
      this.enqueue('projects', async () => {
        const r = await this.repo.saveProjects(list);
        if (!r.ok) return r;
        if (r.value === list) this.clean.add(list);
        else integrateProjects(this, r.value, list);
        return ok(undefined);
      });
    }
    if (next.users !== prev.users && !this.clean.has(next.users)) {
      const list = next.users;
      this.enqueue('users', async () => {
        const r = await this.repo.saveUsers(list);
        if (!r.ok) return r;
        if (r.value === list) this.clean.add(list);
        else integrateUsers(this, r.value, list);
        return ok(undefined);
      });
    }
    if (next.workspace && next.workspace !== prev.workspace && !this.clean.has(next.workspace)) {
      const ws = next.workspace;
      this.enqueue('workspace', async () => {
        const r = await this.repo.saveWorkspace(ws);
        if (!r.ok) return r;
        this.clean.add(ws);
        return ok(undefined);
      });
    }
  }

  /** Queues the tasks among `ids` that changed (object differs from `prev`) and are not saved yet */
  private diffTasks(tasks: Record<TaskId, TaskState>, prev: Record<TaskId, TaskState> | null, ids: TaskId[]) {
    for (const id of ids) {
      const t = tasks[id];
      if (!t || (prev && t === prev[id]) || t.draft || this.clean.has(t)) continue;
      this.enqueue(`task:${id}`, async () => {
        const r = await this.repo.saveTask(t);
        if (!r.ok) return r;
        if (r.value === t) this.clean.add(t);
        else integrateWrittenTask(this, t, r.value);
        return ok(undefined);
      });
    }
  }

  /** The safety net: every task is checked, so that a change that was not reported is written a little later */
  private sweepAll() {
    const tasks = useApp.getState().tasks;
    this.diffTasks(tasks, null, keysOf(tasks));
  }

  private enqueue(key: string, job: Job) {
    this.queue.set(key, job); // a newer version replaces an older one
    if (useApp.getState().save.state !== 'error') setSaveStatus({ state: 'saving' });
    this.schedule();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), DEBOUNCE_MS);
  }

  /** Run all pending writes. Failed ones stay in the queue. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.running) {
      await this.running;
      if (this.queue.size && !this.failed) return this.flush();
      return;
    }
    this.running = (async () => {
      this.failed = false;
      while (this.queue.size) {
        const [key, job] = this.queue.entries().next().value as [string, Job];
        this.queue.delete(key);
        // a failed result is the normal case; an exception in the job itself counts as a failure too
        const r: Result<void, StorageError> = await job().catch((cause: unknown) => err({ kind: classifyError(cause), cause }));
        if (!r.ok) {
          if (!this.queue.has(key)) this.queue.set(key, job);
          this.failed = true;
          setSaveStatus({ state: 'error', kind: r.error.kind });
          this.writeEmergencyCopy();
          console.warn('Saving failed', key, r.error.cause);
          return;
        }
      }
      setSaveStatus({ state: 'saved' });
      this.clearEmergencyCopy();
    })();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }

  /** After "Reconnect": process the queue again */
  retry() {
    setSaveStatus({ state: 'saving' });
    return this.flush();
  }

  /** Emergency copy of unsaved tasks in the browser, in case the folder cannot be reached (also used after a crash) */
  writeEmergencyCopy() {
    try {
      const s = useApp.getState();
      const dirty = Object.values(s.tasks).filter((t) => !t.draft && !this.clean.has(t));
      localStorage.setItem(EMERGENCY_KEY, JSON.stringify({ at: new Date().toISOString(), workspaceId: s.workspace?.id, tasks: dirty }));
    } catch {
      /* ignore */
    }
  }

  private clearEmergencyCopy() {
    try {
      localStorage.removeItem(EMERGENCY_KEY);
    } catch {
      /* ignore */
    }
  }
}
