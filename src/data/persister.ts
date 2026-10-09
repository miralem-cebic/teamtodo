import { setSaveStatus, useApp, type AppState } from '../store/appStore';
import { classifyError, type Repository } from './repository';
import { integrateProjects, integrateUsers, integrateWrittenTask } from './sync';
import type { Snapshot } from './types';

// Beobachtet den App-Zustand und schreibt geänderte Entitäten gebündelt (Debounce) in den Speicher.
// Objekte, die aus dem Speicher kommen oder bereits geschrieben wurden, stehen in `clean`
// und lösen keinen erneuten Schreibvorgang aus.

export const DEBOUNCE_MS = 400;
export const EMERGENCY_KEY = 'teamtodo.unsaved.v1';

type Job = () => Promise<void>;

export class Persister {
  private clean = new WeakSet<object>();
  private queue = new Map<string, Job>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  private failed = false;

  constructor(private readonly repo: Repository) {}

  markCleanObject(o: object) {
    this.clean.add(o);
  }
  isClean(o: object) {
    return this.clean.has(o);
  }

  /** Bekannten Stand als „gespeichert“ markieren (nach Laden) */
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
    window.addEventListener('beforeunload', this.onUnload);
  }

  stop() {
    this.unsubscribe?.();
    window.removeEventListener('beforeunload', this.onUnload);
    if (this.timer) clearTimeout(this.timer);
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
      for (const [id, t] of Object.entries(next.tasks)) {
        if (t === prev.tasks[id] || t.draft || this.clean.has(t)) continue;
        this.enqueue(`task:${id}`, async () => {
          const stored = await this.repo.saveTask(t);
          if (stored === t) this.clean.add(t);
          else integrateWrittenTask(this, t, stored);
        });
      }
    }
    if (next.projects !== prev.projects && !this.clean.has(next.projects)) {
      const list = next.projects;
      this.enqueue('projects', async () => {
        const stored = await this.repo.saveProjects(list);
        if (stored === list) this.clean.add(list);
        else integrateProjects(this, stored, list);
      });
    }
    if (next.users !== prev.users && !this.clean.has(next.users)) {
      const list = next.users;
      this.enqueue('users', async () => {
        const stored = await this.repo.saveUsers(list);
        if (stored === list) this.clean.add(list);
        else integrateUsers(this, stored, list);
      });
    }
    if (next.workspace && next.workspace !== prev.workspace && !this.clean.has(next.workspace)) {
      const ws = next.workspace;
      this.enqueue('workspace', async () => {
        await this.repo.saveWorkspace(ws);
        this.clean.add(ws);
      });
    }
  }

  private enqueue(key: string, job: Job) {
    this.queue.set(key, job); // neuerer Stand ersetzt älteren
    if (useApp.getState().save.state !== 'error') setSaveStatus({ state: 'saving' });
    this.schedule();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), DEBOUNCE_MS);
  }

  /** Alle ausstehenden Schreibvorgänge ausführen. Fehlgeschlagene bleiben in der Warteschlange. */
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
        try {
          await job();
        } catch (e) {
          if (!this.queue.has(key)) this.queue.set(key, job);
          this.failed = true;
          setSaveStatus({ state: 'error', kind: classifyError(e) });
          this.writeEmergencyCopy();
          console.warn('Speichern fehlgeschlagen', key, e);
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

  /** Nach „Erneut verbinden“: Warteschlange erneut abarbeiten */
  retry() {
    setSaveStatus({ state: 'saving' });
    return this.flush();
  }

  /** Notfallkopie ungespeicherter Aufgaben im Browser, falls der Ordner nicht erreichbar ist */
  private writeEmergencyCopy() {
    try {
      const s = useApp.getState();
      const dirty = Object.values(s.tasks).filter((t) => !t.draft && !this.clean.has(t));
      localStorage.setItem(EMERGENCY_KEY, JSON.stringify({ at: new Date().toISOString(), workspaceId: s.workspace?.id, tasks: dirty }));
    } catch {
      /* ignorieren */
    }
  }

  private clearEmergencyCopy() {
    try {
      localStorage.removeItem(EMERGENCY_KEY);
    } catch {
      /* ignorieren */
    }
  }
}
