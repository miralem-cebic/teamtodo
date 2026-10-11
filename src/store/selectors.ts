import { addDays, diffDays, nextMonday, today } from '../lib/dates';
import type { ProjectId, TaskId, UserId } from '../data/ids';
import type { ID, Project, Section, Task, TaskState, TaskStatus, User } from '../data/types';
import { statusLabel, STATUSES } from '../lib/labels';
import { uniqueTags } from '../lib/tags';
import { t } from '../i18n';

// Pure functions: visibility, hierarchy, grouping, filters, sorting.

export type View = { type: 'my' } | { type: 'inbox' } | { type: 'templates' } | { type: 'project'; id: ProjectId };
export type GroupBy = 'section' | 'due' | 'status' | 'assignee' | 'project' | 'tag' | 'none';
export type SortBy = 'manual' | 'due' | 'title' | 'assignee' | 'created';
export type CompletedFilter = 'open' | 'all' | 'done';
export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

export interface ViewSettings {
  group: GroupBy;
  sort: SortBy;
  completed: CompletedFilter;
  due: DueFilter;
  status: (TaskStatus | 'done')[];
  /** '' = everyone, 'none' = nobody, otherwise a user ID */
  assignee: string;
  /** '' = all tags, otherwise one tag (compared without case) */
  tag: string;
}

export const defaultSettings = (view: View): ViewSettings => ({
  group: view.type === 'my' ? 'due' : 'section',
  sort: 'manual',
  completed: 'open',
  due: 'all',
  status: [],
  assignee: '',
  tag: '',
});

export const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;
/** Pinned projects first, then by order */
export const byPinnedThenOrder = (a: Project, b: Project) => Number(!!b.pinned) - Number(!!a.pinned) || a.order - b.order;

/**
 * Moves a project one place up or down inside its group (pinned or not). Only the projects of that group
 * that change position get a new `order` and `updatedAt`. Returns null if the project cannot move.
 */
/** The projects that are shown in the sidebar, in their arrangement: pinned first, then by order */
const arranged = (projects: Project[]) => projects.filter((p) => !p.deletedAt && !p.template && !p.archivedAt).sort(byPinnedThenOrder);

/** Gives the projects in `ordered` the positions 0, 1, 2 …; only projects whose position changes get `updatedAt` */
function renumber(projects: Project[], ordered: Project[], at: string): Project[] {
  const position = new Map(ordered.map((p, i) => [p.id, i]));
  return projects.map((p) => {
    const order = position.get(p.id);
    return order === undefined || order === p.order ? p : { ...p, order, updatedAt: at };
  });
}

/**
 * Puts project `id` directly before or after `targetId`. Only inside one group: a pinned project cannot go
 * below an unpinned one, nor an unpinned one above a pinned one. Returns null if nothing would change.
 */
export function placeProject(projects: Project[], id: ID, targetId: ID, pos: 'before' | 'after', at: string): Project[] | null {
  const group = arranged(projects);
  const me = group.find((p) => p.id === id);
  const target = group.find((p) => p.id === targetId);
  if (!me || !target || me.id === target.id || !!me.pinned !== !!target.pinned) return null;
  const rest = group.filter((p) => p.id !== id);
  const slot = rest.findIndex((p) => p.id === targetId) + (pos === 'after' ? 1 : 0);
  const moved = [...rest.slice(0, slot), me, ...rest.slice(slot)];
  if (moved.every((p, i) => p === group[i])) return null;
  return renumber(projects, moved, at);
}

/** Moves a project one place up or down inside its group (the keyboard way). Null if it cannot move. */
export function reorderWithinGroup(projects: Project[], id: ID, dir: -1 | 1, at: string): Project[] | null {
  const group = arranged(projects);
  const i = group.findIndex((p) => p.id === id);
  const neighbour = group[i + dir];
  if (i < 0 || !neighbour) return null;
  return placeProject(projects, id, neighbour.id, dir < 0 ? 'before' : 'after', at);
}
export const isDone = (t: Task) => !!t.completedAt;
export const isOverdue = (t: Task) => !!t.dueDate && !t.completedAt && diffDays(t.dueDate, today()) < 0;

export function liveSections(p: Project | undefined): Section[] {
  return (p?.sections ?? []).filter((s) => !s.deletedAt).sort(byOrder);
}

/** Projects whose tasks do not show in any view: deleted projects and templates (templates only hold a blueprint). */
export const hiddenProjectIds = (projects: Project[]) => new Set(projects.filter((p) => p.deletedAt || p.template).map((p) => p.id));

/** Task is visible: not deleted, its project is not deleted, its parent task is not deleted. */
export function isVisible(t: TaskState, tasks: Record<ID, TaskState>, deletedProjects: Set<ID>): boolean {
  let cur: TaskState | undefined = t;
  for (let guard = 0; cur && guard < 50; guard++) {
    if (cur.deletedAt) return false;
    if (cur.projectId && deletedProjects.has(cur.projectId)) return false;
    cur = cur.parentId ? tasks[cur.parentId] : undefined;
  }
  return true;
}

/** parent ID → child IDs, per task state. The store replaces the state object on every change, so the cache never goes stale. */
const childIndexCache = new WeakMap<Record<TaskId, TaskState>, Map<TaskId, TaskId[]>>();
function childIndex(tasks: Record<TaskId, TaskState>): Map<TaskId, TaskId[]> {
  let index = childIndexCache.get(tasks);
  if (!index) {
    index = new Map<TaskId, TaskId[]>();
    for (const t of Object.values(tasks)) {
    if (!t.parentId) continue;
    const siblings = index.get(t.parentId) ?? [];
    index.set(t.parentId, siblings);
    siblings.push(t.id);
  }
    childIndexCache.set(tasks, index);
  }
  return index;
}

/** All subtasks below a task (any depth), in depth-first order */
export function descendantIds(tasks: Record<TaskId, TaskState>, id: TaskId): TaskId[] {
  const kids = childIndex(tasks);
  const out: TaskId[] = [];
  const seen = new Set<TaskId>([id]);
  const walk = (pid: TaskId) => {
    for (const k of kids.get(pid) ?? []) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
      walk(k);
    }
  };
  walk(id);
  return out;
}

/** Visible tasks + children per parent task (sorted) */
type Visible = ReturnType<typeof computeVisible>;
let visibleMemo: { tasks: Record<ID, TaskState>; projects: Project[]; result: Visible } | null = null;

/**
 * The tasks that are shown, and the children of each task. Several components ask for the same result with the
 * same state objects in one render, so the last answer is kept while both inputs are the same objects.
 * The result must not be changed by the caller.
 */
export function visibleTasks(tasks: Record<ID, TaskState>, projects: Project[]): Visible {
  if (visibleMemo && visibleMemo.tasks === tasks && visibleMemo.projects === projects) return visibleMemo.result;
  const result = computeVisible(tasks, projects);
  visibleMemo = { tasks, projects, result };
  return result;
}

function computeVisible(tasks: Record<ID, TaskState>, projects: Project[]) {
  const deleted = hiddenProjectIds(projects);
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
/** `keep`: freshly completed overdue tasks stay in "Overdue" instead of jumping down */
export function dueKey(t: Task, keep?: Set<ID>): DueKey {
  if (!t.dueDate) return 'none';
  const dd = diffDays(t.dueDate, today());
  if (dd < 0) return t.completedAt && !keep?.has(t.id) ? 'past' : 'overdue';
  if (dd === 0) return 'today';
  if (dd <= 7) return 'soon';
  return 'later';
}

/** What a group sets on new or dragged-in tasks. `apply: null` = cannot be filled. */
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
  /** Show even when empty */
  keep?: boolean;
  tasks: TaskState[];
  collapsed: boolean;
}

export interface BuildInput {
  tasks: Record<ID, TaskState>;
  projects: Project[];
  users: User[];
  meId: UserId | null;
  view: View;
  settings: ViewSettings;
  search: string;
  recentDone: Set<ID>;
  collapsed: Record<string, boolean>;
}

/** Group key of a tag. Lower case: tags are unique without regard to case. */
const tagGroupKey = (tag: string) => `tag:${tag.toLowerCase()}`;

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
    if (s.tag && !(t.tags ?? []).some((x) => x.toLowerCase() === s.tag.toLowerCase())) return false;
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

  const baseDef: Partial<Task> = {};
  if (view.type === 'project') baseDef.projectId = view.id;
  else if (meId) baseDef.assigneeId = meId;
  const firstSection = (pid: ProjectId) => liveSections(inp.projects.find((p) => p.id === pid))[0]?.id ?? null;
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
      groups.push({ key: '__none', label: t('group.noSection'), apply: { sectionId: null }, defaults: { ...baseDef, sectionId: null } });
    }
    keyOf = (t) => (t.sectionId && ids.has(t.sectionId) ? t.sectionId : '__none');
  } else if (g === 'due') {
    const later = addDays(nextMonday(), 7);
    groups = [
      { key: 'overdue', label: t('due.overdue'), tone: 'danger', apply: null, defaults: { ...baseDef, dueDate: t0 } },
      { key: 'today', label: t('due.today'), apply: { dueDate: t0 }, defaults: { ...baseDef, dueDate: t0 }, keep: true },
      { key: 'soon', label: t('group.upcoming'), hint: t('due.week'), apply: { dueDate: addDays(t0, 1) }, defaults: { ...baseDef, dueDate: addDays(t0, 1) }, keep: true },
      { key: 'later', label: t('group.later'), apply: { dueDate: later }, defaults: { ...baseDef, dueDate: later }, keep: true },
      { key: 'none', label: t('due.none'), apply: { dueDate: null, dueTime: null }, defaults: { ...baseDef }, keep: true },
      { key: 'past', label: t('group.past'), apply: null, defaults: { ...baseDef } },
    ];
    keyOf = (t) => dueKey(t, inp.recentDone);
  } else if (g === 'status') {
    groups = [
      ...STATUSES.map((k) => ({
        key: k,
        label: statusLabel(k),
        dot: 'st-' + k,
        apply: { status: k, completedAt: null },
        defaults: { ...baseDef, status: k },
        keep: true,
      })),
      { key: 'done', label: statusLabel('done'), dot: 'st-done', apply: { completedAt: new Date().toISOString() }, defaults: { ...baseDef } },
    ];
    keyOf = (t) => (t.completedAt ? 'done' : t.status);
  } else if (g === 'assignee') {
    groups = [
      ...inp.users.filter((u) => !u.deletedAt).map((u) => ({ key: u.id, label: u.name, user: u, apply: { assigneeId: u.id }, defaults: { ...baseDef, assigneeId: u.id } })),
      { key: '__none', label: t('group.unassigned'), apply: { assigneeId: null }, defaults: { ...baseDef, assigneeId: null }, keep: true },
    ];
    keyOf = (t) => t.assigneeId ?? '__none';
  } else if (g === 'project') {
    groups = [
      ...inp.projects
        .filter((p) => !p.deletedAt && !p.template)
        .sort(byOrder)
        .map((p) => {
          const apply = { projectId: p.id, sectionId: firstSection(p.id) };
          return { key: p.id, label: p.name, project: p, apply, defaults: { ...baseDef, ...apply }, keep: !p.archivedAt };
        }),
      { key: '__none', label: t('group.noProject'), apply: { projectId: null, sectionId: null }, defaults: { ...baseDef, projectId: null, sectionId: null }, keep: true },
    ];
    keyOf = (t) => t.projectId ?? '__none';
  } else if (g === 'tag') {
    // A task is listed under its first tag: one row, one group (drag and drop needs unique rows)
    const tags = uniqueTags(base.map((x) => (x.tags?.[0] ? [x.tags[0]] : [])));
    groups = [
      ...tags.map((tag) => ({ key: tagGroupKey(tag), label: tag, apply: null, defaults: { ...baseDef, tags: [tag] }, keep: true })),
      { key: '__none', label: t('group.noTag'), apply: null, defaults: { ...baseDef }, keep: true },
    ];
    keyOf = (x) => (x.tags?.[0] ? tagGroupKey(x.tags[0]) : '__none');
  } else {
    groups = [{ key: 'all', label: t('filter.all'), apply: {}, defaults: { ...baseDef }, keep: true }];
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
  const filtering = !!(q || s.due !== 'all' || s.status.length || s.assignee || s.tag);
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
