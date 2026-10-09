import { addDays, diffDays, nextMonday, today } from '../lib/dates';
import type { ID, Project, Section, Task, TaskState, TaskStatus, User } from '../data/types';
import { STATUS_LABEL } from '../data/types';

// Reine Funktionen: Sichtbarkeit, Hierarchie, Gruppierung, Filter, Sortierung.

export type View = { type: 'my' } | { type: 'inbox' } | { type: 'project'; id: ID };
export type GroupBy = 'section' | 'due' | 'status' | 'assignee' | 'project' | 'none';
export type SortBy = 'manual' | 'due' | 'title' | 'assignee' | 'created';
export type CompletedFilter = 'open' | 'all' | 'done';
export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

export interface ViewSettings {
  group: GroupBy;
  sort: SortBy;
  completed: CompletedFilter;
  due: DueFilter;
  status: (TaskStatus | 'done')[];
  /** '' = alle, 'none' = niemand, sonst User-ID */
  assignee: string;
}

export const defaultSettings = (view: View): ViewSettings => ({
  group: view.type === 'my' ? 'due' : 'section',
  sort: 'manual',
  completed: 'open',
  due: 'all',
  status: [],
  assignee: '',
});

export const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;
export const isDone = (t: Task) => !!t.completedAt;
export const isOverdue = (t: Task) => !!t.dueDate && !t.completedAt && diffDays(t.dueDate, today()) < 0;

export function liveSections(p: Project | undefined): Section[] {
  return (p?.sections ?? []).filter((s) => !s.deletedAt).sort(byOrder);
}

/** Aufgabe ist sichtbar: nicht gelöscht, Projekt nicht gelöscht, keine gelöschte Hauptaufgabe. */
export function isVisible(t: TaskState, tasks: Record<ID, TaskState>, deletedProjects: Set<ID>): boolean {
  let cur: TaskState | undefined = t;
  for (let guard = 0; cur && guard < 50; guard++) {
    if (cur.deletedAt) return false;
    if (cur.projectId && deletedProjects.has(cur.projectId)) return false;
    cur = cur.parentId ? tasks[cur.parentId] : undefined;
  }
  return true;
}

export function descendantIds(tasks: Record<ID, TaskState>, id: ID): ID[] {
  const kids = new Map<ID, ID[]>();
  for (const t of Object.values(tasks)) if (t.parentId) (kids.get(t.parentId) ?? kids.set(t.parentId, []).get(t.parentId)!).push(t.id);
  const out: ID[] = [];
  const walk = (pid: ID) => {
    for (const k of kids.get(pid) ?? []) {
      if (out.includes(k)) continue;
      out.push(k);
      walk(k);
    }
  };
  walk(id);
  return out;
}

/** Sichtbare Aufgaben + Kinder je Hauptaufgabe (sortiert) */
export function visibleTasks(tasks: Record<ID, TaskState>, projects: Project[]) {
  const deleted = new Set(projects.filter((p) => p.deletedAt).map((p) => p.id));
  const visible: TaskState[] = [];
  const children: Record<ID, TaskState[]> = {};
  for (const t of Object.values(tasks)) {
    if (!isVisible(t, tasks, deleted)) continue;
    visible.push(t);
    if (t.parentId) (children[t.parentId] ??= []).push(t);
  }
  for (const l of Object.values(children)) l.sort(byOrder);
  return { visible, children };
}

export type DueKey = 'overdue' | 'today' | 'soon' | 'later' | 'none' | 'past';
/** `keep`: frisch erledigte überfällige Aufgaben bleiben in „Überfällig“ statt nach unten zu springen */
export function dueKey(t: Task, keep?: Set<ID>): DueKey {
  if (!t.dueDate) return 'none';
  const dd = diffDays(t.dueDate, today());
  if (dd < 0) return t.completedAt && !keep?.has(t.id) ? 'past' : 'overdue';
  if (dd === 0) return 'today';
  if (dd <= 7) return 'soon';
  return 'later';
}

/** Was eine Gruppe bei neuen bzw. hineingezogenen Aufgaben setzt. `apply: null` = nicht befüllbar. */
export type GroupPatch = Partial<Pick<Task, 'sectionId' | 'projectId' | 'assigneeId' | 'dueDate' | 'dueTime' | 'status' | 'completedAt'>>;

export interface Group {
  key: string;
  label: string;
  hint?: string;
  tone?: 'danger';
  dot?: string;
  user?: User;
  project?: Project;
  section?: Section;
  apply: GroupPatch | null;
  defaults: Partial<Task>;
  /** Auch leer anzeigen */
  keep?: boolean;
  tasks: TaskState[];
  collapsed: boolean;
}

export interface BuildInput {
  tasks: Record<ID, TaskState>;
  projects: Project[];
  users: User[];
  meId: ID | null;
  view: View;
  settings: ViewSettings;
  search: string;
  recentDone: Set<ID>;
  collapsed: Record<string, boolean>;
}

export function buildGroups(inp: BuildInput): Group[] {
  const { view, settings: s, meId } = inp;
  const t0 = today();
  const { visible } = visibleTasks(inp.tasks, inp.projects);
  const q = inp.search.trim().toLowerCase();

  let base = view.type === 'project' ? visible.filter((t) => t.projectId === view.id && !t.parentId) : visible.filter((t) => (!!meId && t.assigneeId === meId) || inp.recentDone.has(t.id));
  base = base.filter((t) => {
    if (s.completed === 'open' && t.completedAt && !inp.recentDone.has(t.id)) return false;
    if (s.completed === 'done' && !t.completedAt) return false;
    if (q && !t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
    if (s.assignee && view.type === 'project') {
      if (s.assignee === 'none' ? t.assigneeId : t.assigneeId !== s.assignee) return false;
    }
    if (s.due !== 'all') {
      const k = dueKey(t);
      if (s.due === 'overdue' && k !== 'overdue') return false;
      if (s.due === 'today' && k !== 'today') return false;
      if (s.due === 'week' && !(t.dueDate && diffDays(t.dueDate, t0) >= 0 && diffDays(t.dueDate, t0) <= 7)) return false;
      if (s.due === 'none' && t.dueDate) return false;
    }
    if (s.status.length && !s.status.includes(t.completedAt ? 'done' : t.status)) return false;
    return true;
  });

  const baseDef: Partial<Task> = view.type === 'project' ? { projectId: view.id } : { assigneeId: meId };
  const firstSection = (pid: ID) => liveSections(inp.projects.find((p) => p.id === pid))[0]?.id ?? null;
  type Proto = Omit<Group, 'tasks' | 'collapsed'>;
  let groups: Proto[];
  let keyOf: (t: TaskState) => string;
  let g = s.group;
  if (view.type === 'my' && (g === 'section' || g === 'assignee')) g = 'due';
  if (view.type === 'project' && g === 'project') g = 'section';

  if (g === 'section' && view.type === 'project') {
    const secs = liveSections(inp.projects.find((p) => p.id === view.id));
    const ids = new Set(secs.map((x) => x.id));
    groups = secs.map((x) => ({ key: x.id, label: x.name, section: x, apply: { sectionId: x.id }, defaults: { ...baseDef, sectionId: x.id }, keep: true }));
    if (base.some((t) => !t.sectionId || !ids.has(t.sectionId))) {
      groups.push({ key: '__none', label: 'Ohne Bereich', apply: { sectionId: null }, defaults: { ...baseDef, sectionId: null } });
    }
    keyOf = (t) => (t.sectionId && ids.has(t.sectionId) ? t.sectionId : '__none');
  } else if (g === 'due') {
    const later = addDays(nextMonday(), 7);
    groups = [
      { key: 'overdue', label: 'Überfällig', tone: 'danger', apply: null, defaults: { ...baseDef, dueDate: t0 } },
      { key: 'today', label: 'Heute', apply: { dueDate: t0 }, defaults: { ...baseDef, dueDate: t0 }, keep: true },
      { key: 'soon', label: 'Demnächst', hint: 'nächste 7 Tage', apply: { dueDate: addDays(t0, 1) }, defaults: { ...baseDef, dueDate: addDays(t0, 1) }, keep: true },
      { key: 'later', label: 'Später', apply: { dueDate: later }, defaults: { ...baseDef, dueDate: later }, keep: true },
      { key: 'none', label: 'Ohne Datum', apply: { dueDate: null, dueTime: null }, defaults: { ...baseDef }, keep: true },
      { key: 'past', label: 'Erledigt, Datum vergangen', apply: null, defaults: { ...baseDef } },
    ];
    keyOf = (t) => dueKey(t, inp.recentDone);
  } else if (g === 'status') {
    groups = [
      ...(Object.entries(STATUS_LABEL) as [TaskStatus, string][]).map(([k, l]) => ({
        key: k,
        label: l,
        dot: 'st-' + k,
        apply: { status: k, completedAt: null },
        defaults: { ...baseDef, status: k },
        keep: true,
      })),
      { key: 'done', label: 'Erledigt', dot: 'st-done', apply: { completedAt: new Date().toISOString() }, defaults: { ...baseDef } },
    ];
    keyOf = (t) => (t.completedAt ? 'done' : t.status);
  } else if (g === 'assignee') {
    groups = [
      ...inp.users.filter((u) => !u.deletedAt).map((u) => ({ key: u.id, label: u.name, user: u, apply: { assigneeId: u.id }, defaults: { ...baseDef, assigneeId: u.id } })),
      { key: '__none', label: 'Nicht zugewiesen', apply: { assigneeId: null }, defaults: { ...baseDef, assigneeId: null }, keep: true },
    ];
    keyOf = (t) => t.assigneeId ?? '__none';
  } else if (g === 'project') {
    groups = [
      ...inp.projects
        .filter((p) => !p.deletedAt)
        .sort(byOrder)
        .map((p) => {
          const apply = { projectId: p.id, sectionId: firstSection(p.id) };
          return { key: p.id, label: p.name, project: p, apply, defaults: { ...baseDef, ...apply }, keep: !p.archivedAt };
        }),
      { key: '__none', label: 'Ohne Projekt', apply: { projectId: null, sectionId: null }, defaults: { ...baseDef, projectId: null, sectionId: null }, keep: true },
    ];
    keyOf = (t) => t.projectId ?? '__none';
  } else {
    groups = [{ key: 'all', label: 'Alle Aufgaben', apply: {}, defaults: { ...baseDef }, keep: true }];
    keyOf = () => 'all';
  }

  const map = new Map<string, TaskState[]>(groups.map((x) => [x.key, []]));
  for (const t of base) map.get(keyOf(t))?.push(t);

  const userName = (id: ID | null) => inp.users.find((u) => u.id === id)?.name ?? '￿';
  const cmp: Record<SortBy, (a: TaskState, b: TaskState) => number> = {
    manual: byOrder,
    due: (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (a.dueTime ?? '').localeCompare(b.dueTime ?? '') || a.order - b.order,
    title: (a, b) => a.title.localeCompare(b.title, 'de'),
    assignee: (a, b) => userName(a.assigneeId).localeCompare(userName(b.assigneeId), 'de') || a.order - b.order,
    created: (a, b) => b.createdAt.localeCompare(a.createdAt),
  };
  const filtering = !!(q || s.due !== 'all' || s.status.length || s.assignee);
  return groups
    .map((x) => ({ ...x, tasks: (map.get(x.key) ?? []).sort(cmp[s.sort]), collapsed: !!inp.collapsed[x.key] }))
    .filter((x) => x.tasks.length || (x.keep && !filtering));
}

/** Reihenfolge-Wert zwischen zwei Nachbarn (fraktionaler Index) */
export function orderBetween(a: { order: number } | undefined, b: { order: number } | undefined): number {
  if (a && b) return (a.order + b.order) / 2;
  if (a) return a.order + 1;
  if (b) return b.order - 1;
  return Date.now();
}
