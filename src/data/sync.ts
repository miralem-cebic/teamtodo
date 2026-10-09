import { flashRows, useApp } from '../store/appStore';
import { mergeProjects, mergeTask, mergeUsers, sameJson } from './merge';
import type { Persister } from './persister';
import type { ChangeSet, Repository } from './repository';
import type { ID, Project, Task, TaskState, User } from './types';

// Mehrbenutzer-Synchronisation: alle 10 Sekunden und beim Fensterfokus geänderte Dateien einlesen
// und in den Zustand übernehmen. Eigene, noch nicht gespeicherte Änderungen werden feldweise zusammengeführt.
// Eingabefelder behalten ihren Fokus, weil Zeilen stabile Schlüssel haben und nur Werte sich ändern.

export const POLL_MS = 10_000;

/** Felder, deren Änderung durch andere kurz sichtbar gemacht wird */
const VISIBLE: (keyof Task)[] = ['title', 'assigneeId', 'dueDate', 'dueTime', 'status', 'completedAt', 'sectionId', 'projectId', 'order', 'comments', 'attachments'];
const visiblyDifferent = (a: Task, b: Task) => VISIBLE.some((k) => !sameJson(a[k], b[k]));
const stripDraft = ({ draft: _d, ...t }: TaskState): Task => t;

export function integrateTasks(p: Persister, remotes: Task[], removed: ID[] = []) {
  if (!remotes.length && !removed.length) return;
  const s = useApp.getState();
  const tasks = { ...s.tasks };
  const flash: ID[] = [];
  let changed = false;
  for (const r of remotes) {
    const local = tasks[r.id];
    if (!local) {
      p.markCleanObject(r);
      tasks[r.id] = r;
      flash.push(r.id);
      changed = true;
    } else if (p.isClean(local)) {
      if (sameJson(stripDraft(local), r)) continue;
      p.markCleanObject(r);
      tasks[r.id] = r;
      if (visiblyDifferent(local, r)) flash.push(r.id);
      changed = true;
    } else {
      // eigene ungespeicherte Änderung: zusammenführen, bleibt „dirty“ und wird geschrieben
      const m = mergeTask(stripDraft(local), r);
      tasks[r.id] = local.draft ? { ...m, draft: true } : m;
      if (visiblyDifferent(local, m)) flash.push(r.id);
      changed = true;
    }
  }
  for (const id of removed) {
    const local = tasks[id];
    if (local && p.isClean(local)) {
      delete tasks[id];
      changed = true;
    }
  }
  if (changed) useApp.setState({ tasks });
  if (flash.length) flashRows(flash);
}

/** Nach eigenem Schreiben mit Zusammenführung: gespeicherten Stand übernehmen */
export function integrateWrittenTask(p: Persister, written: Task, stored: Task) {
  const s = useApp.getState();
  const cur = s.tasks[written.id];
  if (!cur) return;
  if (cur === written) {
    p.markCleanObject(stored);
    useApp.setState({ tasks: { ...s.tasks, [stored.id]: stored } });
  } else {
    // während des Schreibens weiter bearbeitet
    useApp.setState({ tasks: { ...s.tasks, [stored.id]: { ...mergeTask(stripDraft(cur), stored) } } });
  }
  if (visiblyDifferent(written, stored)) flashRows([stored.id]);
}

export function integrateProjects(p: Persister, remote: Project[], written?: Project[]) {
  const cur = useApp.getState().projects;
  if (cur === written || p.isClean(cur)) {
    if (sameJson(cur, remote)) return p.markCleanObject(cur);
    p.markCleanObject(remote);
    useApp.setState({ projects: remote });
  } else useApp.setState({ projects: mergeProjects(cur, remote) });
}

export function integrateUsers(p: Persister, remote: User[], written?: User[]) {
  const cur = useApp.getState().users;
  if (cur === written || p.isClean(cur)) {
    if (sameJson(cur, remote)) return p.markCleanObject(cur);
    p.markCleanObject(remote);
    useApp.setState({ users: remote });
  } else useApp.setState({ users: mergeUsers(cur, remote) });
}

export function applyChanges(p: Persister, c: ChangeSet) {
  integrateTasks(p, c.tasks, c.removedTaskIds);
  if (c.projects) integrateProjects(p, c.projects);
  if (c.users) integrateUsers(p, c.users);
  if (c.workspace) {
    const cur = useApp.getState().workspace;
    if (!cur || p.isClean(cur)) {
      p.markCleanObject(c.workspace);
      useApp.setState({ workspace: c.workspace });
    }
  }
}

export class SyncEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    private readonly repo: Repository,
    private readonly persister: Persister,
    private readonly onConflictCopies: (names: string[]) => void,
    private readonly intervalMs = POLL_MS,
  ) {}

  start() {
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onFocus);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onFocus);
  }

  private onFocus = () => {
    if (document.visibilityState === 'visible') void this.poll();
  };

  /** Einmal abgleichen. Wartet auf laufende Schreibvorgänge, damit eigene Dateien nicht als fremd gelten. */
  async poll() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (this.persister.pending) await this.persister.flush();
      if (this.persister.pending) return;
      const changes = await this.repo.pullChanges();
      applyChanges(this.persister, changes);
      this.onConflictCopies(changes.conflictCopies);
    } catch (e) {
      console.warn('Abgleich fehlgeschlagen', e);
    } finally {
      this.busy = false;
    }
  }
}
