import { create } from 'zustand';
import { makeProject, makeSection, makeTask, makeUser, nowIso, pickColor } from '../data/schema';
import type { Activity, ActivityType, Attachment, Color, ID, MergeableField, Project, Section, Snapshot, Task, TaskState, User, WorkspaceFile } from '../data/types';
import { MERGEABLE_FIELDS } from '../data/types';
import { brandId, keysOf, newActivityId, newCommentId, newTaskId, type ProjectId, type SectionId, type TaskId, type UserId } from '../data/ids';
import { mergeProjects, mergeTask, mergeUsers } from '../data/merge';
import type { ConflictPayload } from '../data/repository';
import { normalizeTag, renameInList, withoutTag, withoutTagEverywhere, withTag } from '../lib/tags';
import type { StorageErrorKind } from '../data/repository';
import { descendantIds, liveSections, projectState, reorderWithinGroup, placeProject } from './selectors';
import { t as tr } from '../i18n';

// Central app state. All changes go through the actions below:
// they take effect immediately (optimistically), the persister writes in the background.

export type SaveStatus = { state: 'saved' } | { state: 'saving' } | { state: 'error'; kind: StorageErrorKind };

export interface Toast {
  id: string;
  msg: string;
  undo?: boolean;
}

export type FocusScope = 'list' | 'panel' | 'panel-title' | 'section' | 'row' | 'board-add';
export interface FocusRequest {
  id: ID;
  scope: FocusScope;
  n: number;
}

interface UndoEntry {
  label: string;
  tasks: Record<TaskId, TaskState | undefined>;
  projects?: Project[];
  users?: Record<UserId, User | undefined>;
  /** Estimated size of the stored state, for the byte budget of the undo stack */
  bytes?: number;
}

/** At most this many undo steps, and at most this much stored state (estimated) */
export const UNDO_LIMIT = 20;
export const UNDO_MAX_BYTES = 4_000_000;

const estimateBytes = (e: UndoEntry) => JSON.stringify([e.tasks, e.projects ?? null, e.users ?? null]).length;

/** Keeps the newest entries within both budgets; the newest entry is always kept. */
export function trimUndo(stack: UndoEntry[]): UndoEntry[] {
  let out = stack.slice(-UNDO_LIMIT);
  let total = out.reduce((sum, e) => sum + (e.bytes ?? 0), 0);
  while (out.length > 1 && total > UNDO_MAX_BYTES) {
    total -= out[0]?.bytes ?? 0;
    out = out.slice(1);
  }
  return out;
}

export interface AppState {
  workspace: WorkspaceFile | null;
  users: User[];
  projects: Project[];
  tasks: Record<TaskId, TaskState>;
  meId: UserId | null;

  // UI state shared by several views
  panelId: TaskId | null;
  focusReq: FocusRequest | null;
  toast: Toast | null;
  /** Freshly completed or handed-off tasks stay visible until the view is left */
  recentDone: Set<TaskId>;
  save: SaveStatus;
  undoStack: UndoEntry[];
  /** Recently changed tasks by others (briefly highlighted) */
  flash: Set<TaskId>;
}

const initial: AppState = {
  workspace: null,
  users: [],
  projects: [],
  tasks: {},
  meId: null,
  panelId: null,
  focusReq: null,
  toast: null,
  recentDone: new Set(),
  save: { state: 'saved' },
  undoStack: [],
  flash: new Set(),
};

export const useApp = create<AppState>()(() => ({ ...initial }));
const get = useApp.getState;
const set = useApp.setState;

/* ---------- Helpers ---------- */

/** Author of changes made before anyone signed in (never shown as a person) */
const UNKNOWN_USER = brandId<'UserId'>('unbekannt');

const short = (s: string) => {
  const v = s.trim() || tr('task.untitled');
  return v.length > 40 ? v.slice(0, 38) + '…' : v;
};
const act = (type: ActivityType, data?: Activity['data']): Activity => ({
  id: newActivityId(),
  userId: get().meId ?? UNKNOWN_USER,
  type,
  ...(data ? { data } : {}),
  at: nowIso(),
});
const projectName = (id: ID | null) => get().projects.find((p) => p.id === id)?.name ?? null;
const sectionName = (projectId: ProjectId | null, sectionId: SectionId | null) =>
  get().projects.find((p) => p.id === projectId)?.sections.find((s) => s.id === sectionId)?.name ?? null;

let toastSeq = 0;
export function showToast(msg: string, undo = false) {
  set({ toast: { id: String(++toastSeq), msg, undo } });
}
export const dismissToast = () => set({ toast: null });

/* ---------- Which tasks changed ---------- */
// The persister writes what changed. Each change to the task record reports the IDs it touched, so that a change
// does not cost a look at every task. 'all' after the whole record was replaced.
let touched: Set<TaskId> | 'all' = new Set();

/** Reports that these tasks were changed (call before the state is set) */
export function touchTasks(ids: Iterable<TaskId> | 'all'): void {
  if (touched === 'all') return;
  if (ids === 'all') {
    touched = 'all';
    return;
  }
  for (const id of ids) touched.add(id);
}

/** The IDs reported since the last call; 'all' if the whole record was replaced. Used by the persister. */
export function takeTouchedTasks(): TaskId[] | 'all' {
  const out = touched === 'all' ? 'all' : [...touched];
  touched = new Set();
  return out;
}

function pushUndo(entry: UndoEntry, toast: boolean) {
  const sized = { ...entry, bytes: estimateBytes(entry) };
  set((s) => ({ undoStack: trimUndo([...s.undoStack, sized]) }));
  if (toast) showToast(entry.label, true);
}

/* ---------- Loading / session ---------- */

export function loadSnapshot(snap: Snapshot) {
  // Null prototype: an ID can never resolve to an Object.prototype member such as `constructor`
  const tasks: Record<TaskId, TaskState> = Object.create(null);
  for (const t of snap.tasks) tasks[t.id] = t;
  touchTasks('all');
  set({ workspace: snap.workspace, users: snap.users, projects: snap.projects, tasks, undoStack: [], panelId: null });
}

export function resetApp() {
  touchTasks('all');
  set({ ...initial, recentDone: new Set(), flash: new Set() });
}

export const setMe = (id: UserId | null) => set({ meId: id });
export const setSaveStatus = (save: SaveStatus) => set({ save });

/* ---------- Tasks ---------- */

export function addTask(fields: Partial<Task> = {}): TaskId {
  const t: TaskState = {
    ...makeTask({ createdBy: get().meId ?? UNKNOWN_USER, ...fields }),
    draft: !fields.title?.trim(),
  };
  const me = get().meId;
  t.activity = [act('created')];
  if (t.assigneeId && t.assigneeId !== me) {
    t.activity.push(act('assigned', { userId: t.assigneeId, name: get().users.find((u) => u.id === t.assigneeId)?.name ?? null }));
  }
  // The creator and the assignee follow the task automatically
  t.followerIds = [...new Set([...(me ? [me] : []), ...(t.assigneeId ? [t.assigneeId] : []), ...t.followerIds])];
  touchTasks([t.id]);
  set((s) => ({ tasks: { ...s.tasks, [t.id]: t } }));
  return t.id;
}

export type TaskPatch = Partial<Pick<Task, MergeableField>>;

/** Applies a patch, logs activity and `fieldUpdatedAt`. Returns the new task. */
function applyPatch(t: TaskState, patch: TaskPatch, at: string): TaskState {
  const next: TaskState = { ...t, fieldUpdatedAt: { ...t.fieldUpdatedAt } };
  const log: Activity[] = [];
  for (const key of Object.keys(patch) as MergeableField[]) {
    const v = patch[key];
    if (JSON.stringify(t[key]) === JSON.stringify(v)) continue;
    Object.assign(next, { [key]: v });
    next.fieldUpdatedAt[key] = at;
    if (t.draft) continue;
    if (key === 'assigneeId') {
      const name = get().users.find((u) => u.id === v)?.name ?? null;
      log.push(act(v ? 'assigned' : 'unassigned', { userId: v as string | null, name }));
      if (v && !next.followerIds.includes(v as UserId)) {
        next.followerIds = [...next.followerIds, v as UserId];
        next.fieldUpdatedAt.followerIds = at;
      }
    } else if (key === 'dueDate') log.push(act(v ? 'due' : 'dueRemoved', { date: v as string | null }));
    else if (key === 'status') log.push(act('status', { status: v as string }));
    else if (key === 'completedAt') log.push(act(v ? 'completed' : 'reopened'));
    else if (key === 'sectionId' && v) log.push(act('section', { name: sectionName(next.projectId, v as SectionId) }));
    else if (key === 'projectId') log.push(act(v ? 'project' : 'projectRemoved', { name: projectName(v as string | null) }));
  }
  if (typeof patch.title === 'string' && patch.title.trim()) next.draft = false;
  if (log.length) next.activity = [...t.activity, ...log];
  return next;
}

export interface UpdateOptions {
  /** Undo entry with this text; `toast` shows it */
  undo?: string;
  toast?: boolean;
}

export function addTag(id: TaskId, name: string) {
  const t = get().tasks[id];
  if (!t) return;
  const current = t.tags ?? [];
  const tags = withTag(current, name);
  if (tags !== current) updateTask(id, { tags });
}

export function removeTag(id: TaskId, name: string) {
  const t = get().tasks[id];
  if (!t?.tags?.includes(name)) return;
  updateTask(id, { tags: withoutTag(t.tags, name) });
}

/** Changes the tags of every live task for which `change` returns a new list. One undo step. */
function changeTagsEverywhere(change: (tags: string[]) => string[] | null, label: string) {
  const s = get();
  const before: UndoEntry['tasks'] = {};
  const tasks = { ...s.tasks };
  const at = nowIso();
  for (const t of Object.values(s.tasks)) {
    if (t.deletedAt) continue;
    const next = change(t.tags ?? []);
    if (!next) continue;
    before[t.id] = t;
    tasks[t.id] = applyPatch(t, { tags: next }, at);
  }
  const changed = keysOf(before);
  if (!changed.length) return;
  touchTasks(changed);
  set({ tasks });
  pushUndo({ label, tasks: before }, true);
}

/** Renames a tag on every task. A name that is already used merges the two tags. */
export function renameTag(from: string, to: string) {
  const name = normalizeTag(to);
  if (!name) return;
  changeTagsEverywhere((tags) => renameInList(tags, from, name), tr('undo.tagRenamed', { name }));
}

/** Removes a tag from every task */
export function removeTagEverywhere(name: string) {
  changeTagsEverywhere((tags) => withoutTagEverywhere(tags, name), tr('undo.tagRemoved', { name }));
}

export function updateTask(id: TaskId, patch: TaskPatch, opts: UpdateOptions = {}) {
  const s = get();
  const t = s.tasks[id];
  if (!t) return;
  const at = nowIso();
  const changed: Record<TaskId, TaskState> = { [id]: applyPatch(t, patch, at) };
  // Subtasks follow their parent task into the project
  if ('projectId' in patch) {
    for (const d of descendantIds(s.tasks, id)) {
      const child = s.tasks[d];
      if (child) changed[d] = applyPatch(child, { projectId: patch.projectId ?? null }, at);
    }
  }
  if (patch.completedAt) s.recentDone.add(id);
  const tracked = Object.keys(patch).some((k) => k !== 'title' && k !== 'description');
  if (tracked && !t.draft) {
    const before: UndoEntry['tasks'] = {};
    for (const k of keysOf(changed)) before[k] = s.tasks[k];
    pushUndo({ label: opts.undo ?? tr('undo.change'), tasks: before }, !!opts.toast);
  }
  touchTasks(keysOf(changed));
  set({ tasks: { ...s.tasks, ...changed } });
}

export function toggleDone(id: TaskId, value?: boolean) {
  const t = get().tasks[id];
  if (!t) return;
  const done = value ?? !t.completedAt;
  if (done === !!t.completedAt) return;
  updateTask(id, { completedAt: done ? nowIso() : null }, done ? { undo: tr('undo.completed', { title: short(t.title) }), toast: true } : { undo: tr('undo.reopened') });
  if (t.draft && done) {
    touchTasks([id]);
    set((s) => ({ tasks: { ...s.tasks, [id]: { ...(s.tasks[id] ?? t), draft: false } } }));
  }
}

/** Soft delete including subtasks. Drafts are removed directly. */
export function deleteTask(id: TaskId, opts: { silent?: boolean } = {}) {
  const s = get();
  const t = s.tasks[id];
  if (!t) return;
  const ids: TaskId[] = [id, ...descendantIds(s.tasks, id)];
  const before: UndoEntry['tasks'] = {};
  const tasks = { ...s.tasks };
  const at = nowIso();
  for (const k of ids) {
    const x = s.tasks[k];
    if (!x) continue;
    before[k] = x;
    if (x.draft) delete tasks[k];
    else tasks[k] = { ...x, deletedAt: at, fieldUpdatedAt: { ...x.fieldUpdatedAt, deletedAt: at }, activity: [...x.activity, act('deleted')] };
  }
  touchTasks(ids);
  set({ tasks, panelId: s.panelId && ids.includes(s.panelId) ? null : s.panelId });
  if (!t.draft) pushUndo({ label: tr('undo.deleted', { title: short(t.title) }), tasks: before }, !opts.silent);
}

export function removeIfEmptyDraft(id: TaskId) {
  const s = get();
  const t = s.tasks[id];
  if (!t || !t.draft || t.title.trim() || descendantIds(s.tasks, id).length) return;
  const tasks = { ...s.tasks };
  delete tasks[id];
  touchTasks([id]);
  set({ tasks });
}

/* ---------- Projects and sections ---------- */

function setProjects(fn: (projects: Project[]) => Project[], undo?: { label: string; toast: boolean }, taskBefore?: UndoEntry['tasks']) {
  const before = get().projects;
  set({ projects: fn(before) });
  if (undo) pushUndo({ label: undo.label, projects: before, tasks: taskBefore ?? {} }, undo.toast);
}

const touch = (p: Project): Project => ({ ...p, updatedAt: nowIso() });
const mapProject = (id: ProjectId, fn: (p: Project) => Project) => (list: Project[]) => list.map((p) => (p.id === id ? touch(fn(p)) : p));
/** Only change sections: the project's `updatedAt` stays, so that concurrent renames of the project are not lost */
const mapSections = (id: ProjectId, fn: (s: Section[]) => Section[]) => (list: Project[]) => list.map((p) => (p.id === id ? { ...p, sections: fn(p.sections) } : p));

export function addProject(name: string): ProjectId {
  const list = get().projects;
  const p = makeProject(name, pickColor(list.length), Math.max(0, ...list.map((x) => x.order)) + 1);
  setProjects((l) => [...l, p]);
  return p.id;
}

export const renameProject = (id: ProjectId, name: string) => setProjects(mapProject(id, (p) => ({ ...p, name })));
export const setProjectColor = (id: ProjectId, color: Color) => setProjects(mapProject(id, (p) => ({ ...p, color })));

/** Pinning puts the project at the end of the pinned group, unpinning at the start of the unpinned group. */
export function setProjectPinned(id: ProjectId, pinned: boolean) {
  const current = get().projects.find((p) => p.id === id);
  if (!current || !!current.pinned === pinned) return;
  setProjects(
    (list) => {
      const group = list.filter((p) => p.id !== id && projectState(p) === 'active' && !!p.pinned === pinned);
      const order = pinned ? Math.max(-1, ...group.map((p) => p.order)) + 1 : Math.min(0, ...group.map((p) => p.order)) - 1;
      return list.map((p) => (p.id === id ? touch({ ...p, pinned, order }) : p));
    },
    { label: tr('undo.change'), toast: false },
  );
}

/** Merges what a conflict copy holds into the workspace. The caller writes the copy's content through the persister and then removes the copy. */
export function mergeConflictPayload(p: ConflictPayload) {
  const s = get();
  if (p.kind === 'task') {
    const cur = s.tasks[p.task.id];
    touchTasks([p.task.id]);
    set({ tasks: { ...s.tasks, [p.task.id]: cur ? mergeTask(cur, p.task) : p.task } });
  } else if (p.kind === 'users') {
    set({ users: mergeUsers(s.users, p.users) });
  } else if (p.kind === 'projects') {
    set({ projects: mergeProjects(s.projects, p.projects) });
  }
}

/** Moves a project directly before or after another one of its group (drag and drop, keyboard) */
export function moveProjectNear(id: ProjectId, targetId: ProjectId, pos: 'before' | 'after') {
  const next = placeProject(get().projects, id, targetId, pos, nowIso());
  if (next) setProjects(() => next, { label: tr('undo.change'), toast: false });
}

/** Moves a project one place up or down within its group (keyboard) */
export function moveProject(id: ProjectId, dir: -1 | 1) {
  const next = reorderWithinGroup(get().projects, id, dir, nowIso());
  if (next) setProjects(() => next, { label: tr('undo.change'), toast: false });
}

export function archiveProject(id: ProjectId, archived: boolean) {
  const p = get().projects.find((x) => x.id === id);
  if (!p) return;
  setProjects(mapProject(id, (x) => ({ ...x, archivedAt: archived ? nowIso() : null })), {
    label: archived ? tr('undo.projectArchived', { name: p.name }) : tr('undo.projectRestored', { name: p.name }),
    toast: true,
  });
}

/** Soft delete: the project disappears with its tasks from all views. Cleaned up after 30 days. */
export function deleteProject(id: ProjectId) {
  const p = get().projects.find((x) => x.id === id);
  if (!p) return;
  setProjects(mapProject(id, (x) => ({ ...x, deletedAt: nowIso() })), { label: tr('undo.projectDeleted', { name: p.name }), toast: true });
}

export function addSection(projectId: ProjectId, name: string, afterOrder?: number): ID {
  const p = get().projects.find((x) => x.id === projectId);
  const live = (p?.sections ?? []).filter((s) => !s.deletedAt).sort((a, b) => a.order - b.order);
  let order: number;
  if (afterOrder === undefined) order = (live[live.length - 1]?.order ?? 0) + 1;
  else {
    const next = live.find((s) => s.order > afterOrder);
    order = next ? (afterOrder + next.order) / 2 : afterOrder + 1;
  }
  const sec = makeSection(name, order);
  setProjects(mapSections(projectId, (s) => [...s, sec]));
  return sec.id;
}

export function renameSection(projectId: ProjectId, sectionId: SectionId, name: string) {
  setProjects(mapSections(projectId, (list) => list.map((s) => (s.id === sectionId ? { ...s, name, updatedAt: nowIso() } : s))));
}

export function moveSection(projectId: ProjectId, sectionId: SectionId, order: number) {
  const sec = get().projects.find((p) => p.id === projectId)?.sections.find((s) => s.id === sectionId);
  if (!sec) return;
  setProjects(mapSections(projectId, (list) => list.map((s) => (s.id === sectionId ? { ...s, order, updatedAt: nowIso() } : s))), { label: tr('undo.sectionMoved', { name: sec.name }), toast: false });
}

/** Deletes the section and (softly) all its tasks, with undo. */
export function deleteSection(projectId: ProjectId, sectionId: SectionId) {
  const s = get();
  const sec = s.projects.find((p) => p.id === projectId)?.sections.find((x) => x.id === sectionId);
  if (!sec) return;
  const at = nowIso();
  const before: UndoEntry['tasks'] = {};
  const tasks = { ...s.tasks };
  const roots = Object.values(s.tasks).filter((t) => t.projectId === projectId && t.sectionId === sectionId && !t.deletedAt);
  for (const r of roots) {
    for (const k of [r.id, ...descendantIds(s.tasks, r.id)]) {
      const x = s.tasks[k];
      if (!x || x.deletedAt) continue;
      before[k] = x;
      if (x.draft) delete tasks[k];
      else tasks[k] = { ...x, deletedAt: at, fieldUpdatedAt: { ...x.fieldUpdatedAt, deletedAt: at } };
    }
  }
  touchTasks(keysOf(before));
  set({ tasks });
  setProjects(
    mapSections(projectId, (list) => list.map((x) => (x.id === sectionId ? { ...x, deletedAt: at, updatedAt: at } : x))),
    { label: tr('undo.sectionDeleted', { name: sec.name }), toast: true },
    before,
  );
}

/* ---------- Templates ---------- */

/** Open tasks and subtasks of a project, including completed ones, as they are stored */
const liveTasksOf = (projectId: ProjectId): TaskState[] =>
  Object.values(get().tasks).filter((t) => t.projectId === projectId && !t.deletedAt && !t.draft);

/**
 * Copies a task tree into another project. Only the structure is copied: title, description, order, subtask relation
 * and section. Assignee, due date, status, followers, comments, attachments and activity are not copied.
 */
function copyTaskTree(src: TaskState[], projectId: ProjectId, sectionMap: Map<SectionId, SectionId>): Record<TaskId, TaskState> {
  const me = get().meId;
  const ids = new Map(src.map((t) => [t.id, newTaskId()] as const));
  const out: Record<TaskId, TaskState> = {};
  for (const t of src) {
    const id = ids.get(t.id);
    if (!id) continue;
    out[id] = {
      ...makeTask({ createdBy: me ?? UNKNOWN_USER, id, projectId, title: t.title, description: t.description, order: t.order }),
      // tags are part of the structure of a template; assignees, dates and status are not copied
      ...(t.tags ? { tags: [...t.tags] } : {}),
      parentId: t.parentId ? (ids.get(t.parentId) ?? null) : null,
      sectionId: t.parentId || !t.sectionId ? null : (sectionMap.get(t.sectionId) ?? null),
      followerIds: me ? [me] : [],
      activity: [act('created')],
      draft: false,
    };
  }
  return out;
}

/** Saves a project as a template: its sections and tasks (subtasks included), without the project in the project list. */
export function saveAsTemplate(projectId: ProjectId, name: string): ID | null {
  const s = get();
  const src = s.projects.find((p) => p.id === projectId && !p.deletedAt && !p.template);
  if (!src || !name.trim()) return null;
  const tpl: Project = { ...makeProject(name.trim(), src.color, Math.max(0, ...s.projects.map((x) => x.order)) + 1, []), template: true };
  const sectionMap = new Map<SectionId, SectionId>();
  tpl.sections = liveSections(src).map((sec) => {
    const copy = makeSection(sec.name, sec.order);
    sectionMap.set(sec.id, copy.id);
    return copy;
  });
  const tasks = copyTaskTree(liveTasksOf(src.id), tpl.id, sectionMap);
  touchTasks(keysOf(tasks));
  set((st) => ({ projects: [...st.projects, tpl], tasks: { ...st.tasks, ...tasks } }));
  return tpl.id;
}

/** Creates a project from a template. Sections and tasks are copied; due dates and assignments are not. */
export function addProjectFromTemplate(templateId: ProjectId, name: string): ProjectId | null {
  const s = get();
  const tpl = s.projects.find((p) => p.id === templateId && p.template && !p.deletedAt);
  if (!tpl || !name.trim()) return null;
  const p = makeProject(name.trim(), pickColor(s.projects.length), Math.max(0, ...s.projects.map((x) => x.order)) + 1, []);
  const sectionMap = new Map<SectionId, SectionId>();
  p.sections = liveSections(tpl).map((sec) => {
    const copy = makeSection(sec.name, sec.order);
    sectionMap.set(sec.id, copy.id);
    return copy;
  });
  const tasks = copyTaskTree(liveTasksOf(tpl.id), p.id, sectionMap);
  touchTasks(keysOf(tasks));
  set((st) => ({ projects: [...st.projects, p], tasks: { ...st.tasks, ...tasks } }));
  return p.id;
}

/* ---------- Comments, followers, attachments ---------- */

/** @Name in the text → user IDs (longest names first, so that "@Lena Hoffmann" wins over "@Lena") */
export function findMentions(text: string, users: User[]): UserId[] {
  const lower = text.toLowerCase();
  return users
    .filter((u) => !u.deletedAt)
    .sort((a, b) => b.name.length - a.name.length)
    .filter((u) => lower.includes('@' + u.name.toLowerCase()))
    .map((u) => u.id);
}

function patchTask(id: TaskId, fn: (t: TaskState) => TaskState) {
  const t = get().tasks[id];
  if (!t) return;
  touchTasks([id]);
  set((s) => ({ tasks: { ...s.tasks, [id]: fn(t) } }));
}

export function addComment(taskId: TaskId, text: string) {
  const s = get();
  const me = s.meId;
  if (!me || !text.trim()) return;
  const mentions = findMentions(text, s.users);
  const at = nowIso();
  patchTask(taskId, (t) => {
    const followers = [...new Set([...t.followerIds, me, ...mentions])];
    const changed = followers.length !== t.followerIds.length;
    return {
      ...t,
      draft: false,
      comments: [...t.comments, { id: newCommentId(), userId: me, text: text.trim(), mentions, at }],
      followerIds: followers,
      fieldUpdatedAt: changed ? { ...t.fieldUpdatedAt, followerIds: at } : t.fieldUpdatedAt,
    };
  });
}

export function deleteComment(taskId: TaskId, commentId: ID) {
  const at = nowIso();
  patchTask(taskId, (t) => ({ ...t, comments: t.comments.map((c) => (c.id === commentId ? { ...c, deletedAt: at } : c)) }));
}

export function setFollowing(taskId: TaskId, userId: UserId, follow: boolean) {
  const t = get().tasks[taskId];
  if (!t || t.followerIds.includes(userId) === follow) return;
  updateTask(taskId, { followerIds: follow ? [...t.followerIds, userId] : t.followerIds.filter((x) => x !== userId) });
}

export function addAttachmentMeta(taskId: TaskId, a: Attachment) {
  patchTask(taskId, (t) => ({ ...t, attachments: [...t.attachments, a], activity: [...t.activity, act('attachment', { name: a.fileName })] }));
}

export function removeAttachment(taskId: TaskId, attachmentId: ID) {
  const t = get().tasks[taskId];
  const a = t?.attachments.find((x) => x.id === attachmentId);
  if (!t || !a) return;
  const before = t;
  patchTask(taskId, (x) => ({ ...x, attachments: x.attachments.map((y) => (y.id === attachmentId ? { ...y, removedAt: nowIso() } : y)) }));
  pushUndo({ label: tr('undo.attachmentRemoved', { name: a.fileName }), tasks: { [taskId]: before } }, true);
}

/* ---------- People ---------- */

export function addUser(name: string): UserId {
  const u = makeUser(name.trim(), pickColor(get().users.length));
  set((s) => ({ users: [...s.users, u] }));
  return u.id;
}

export function renameUser(id: UserId, name: string) {
  const trimmed = name.trim();
  const u = get().users.find((x) => x.id === id);
  if (!u || !trimmed || trimmed === u.name) return;
  set((s) => ({ users: s.users.map((x) => (x.id === id ? { ...x, name: trimmed, updatedAt: nowIso() } : x)) }));
}

/**
 * Removes a person (soft delete, the history stays). Their open tasks, subtasks included, become unassigned.
 * Completed tasks keep their assignee. Returns the number of tasks that were unassigned.
 * The person who is logged in on this browser cannot be removed.
 */
export function deleteUser(id: ID): number {
  const s = get();
  const u = s.users.find((x) => x.id === id);
  if (!u || u.deletedAt || id === s.meId) return 0;
  const at = nowIso();
  const before: UndoEntry['tasks'] = {};
  const tasks = { ...s.tasks };
  const open = Object.values(s.tasks).filter((t) => t.assigneeId === id && !t.deletedAt && !t.completedAt);
  for (const t of open) {
    before[t.id] = t;
    tasks[t.id] = applyPatch(t, { assigneeId: null }, at);
  }
  touchTasks(keysOf(before));
  set({
    tasks,
    users: s.users.map((x) => (x.id === id ? { ...x, deletedAt: at, updatedAt: at } : x)),
  });
  pushUndo({ label: tr('undo.memberRemoved', { name: u.name }), tasks: before, users: { [id]: u } }, true);
  return open.length;
}

/** Brings a removed person back. Tasks that were unassigned at removal stay unassigned. */
export function restoreUser(id: ID) {
  const u = get().users.find((x) => x.id === id);
  if (!u?.deletedAt) return;
  set((s) => ({ users: s.users.map((x) => (x.id === id ? { ...x, deletedAt: null, updatedAt: nowIso() } : x)) }));
  showToast(tr('toast.memberRestored', { name: u.name }));
}

/* ---------- Undo ---------- */

export function undo() {
  const s = get();
  const entry = s.undoStack[s.undoStack.length - 1];
  if (!entry) return;
  const at = nowIso();
  const tasks = { ...s.tasks };
  for (const id of keysOf(entry.tasks)) {
    const before = entry.tasks[id];
    const cur = s.tasks[id];
    if (!before) {
      delete tasks[id];
      continue;
    }
    const fieldUpdatedAt = { ...(cur?.fieldUpdatedAt ?? before.fieldUpdatedAt) };
    for (const f of MERGEABLE_FIELDS) {
      if (cur && JSON.stringify(cur[f]) !== JSON.stringify(before[f])) fieldUpdatedAt[f] = at;
    }
    // Comments and activity are not rolled back
    tasks[id] = { ...before, fieldUpdatedAt, comments: cur?.comments ?? before.comments, activity: cur?.activity ?? before.activity };
    if (!before.completedAt) s.recentDone.delete(id);
  }
  let projects = s.projects;
  if (entry.projects) {
    const prev = new Map(entry.projects.map((p) => [p.id, p]));
    projects = s.projects.map((p) => {
      const b = prev.get(p.id);
      if (!b || b === p) return p;
      // reset exactly the changed fields; sections added in the meantime (e.g. by others) stay
      const fieldsChanged = (['name', 'color', 'order', 'archivedAt', 'deletedAt'] as const).some((k) => p[k] !== b[k]);
      const before = new Map(b.sections.map((x) => [x.id, x]));
      const sections = p.sections.map((x) => {
        const old = before.get(x.id);
        return old && JSON.stringify(old) !== JSON.stringify(x) ? { ...old, updatedAt: at } : x;
      });
      if (!fieldsChanged) return { ...p, sections };
      const out: Project = { ...p, name: b.name, color: b.color, order: b.order, updatedAt: at, sections };
      if (b.archivedAt !== undefined) out.archivedAt = b.archivedAt;
      else delete out.archivedAt;
      if (b.deletedAt !== undefined) out.deletedAt = b.deletedAt;
      else delete out.deletedAt;
      return out;
    });
  }
  let users = s.users;
  if (entry.users) {
    const prev = entry.users;
    // Restored with a new timestamp, so that the restore also wins against the removal in other browsers
    users = s.users.map((x) => {
      const old = prev[x.id];
      return old ? { ...old, updatedAt: at } : x;
    });
  }
  touchTasks(keysOf(entry.tasks));
  set({ tasks, projects, users, undoStack: s.undoStack.slice(0, -1) });
  showToast(tr('toast.undone'));
}

/* ---------- Panel and focus ---------- */

export function openPanel(id: TaskId) {
  if (get().panelId !== id) set({ panelId: id });
}
export function closePanel() {
  set({ panelId: null });
}

let focusSeq = 0;
let focusHandled = 0;
export const requestFocus = (id: ID, scope: FocusScope) => set({ focusReq: { id, scope, n: ++focusSeq } });

/**
 * Each focus request takes effect exactly once. Otherwise a row that, e.g. after a due date change,
 * moves to another group and is rebuilt would pull the focus to itself again.
 */
export function claimFocus(req: FocusRequest | null, id: ID, scope: FocusScope): boolean {
  if (!req || req.id !== id || req.scope !== scope || req.n <= focusHandled) return false;
  focusHandled = req.n;
  return true;
}

/** Like claimFocus, but without consuming the request */
export const peekFocus = (req: FocusRequest | null, id: ID, scope: FocusScope) => !!req && req.id === id && req.scope === scope && req.n > focusHandled;

export const clearRecentDone = () => set({ recentDone: new Set() });

export function flashRows(ids: TaskId[]) {
  set((s) => ({ flash: new Set([...s.flash, ...ids]) }));
  setTimeout(() => set((s) => ({ flash: new Set([...s.flash].filter((x) => !ids.includes(x))) })), 1600);
}
