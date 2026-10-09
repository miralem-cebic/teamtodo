import { create } from 'zustand';
import { makeProject, makeSection, makeTask, makeUser, newId, nowIso, pickColor } from '../data/schema';
import type { Activity, ActivityType, Attachment, Color, ID, MergeableField, Project, Section, Snapshot, Task, TaskState, User, WorkspaceFile } from '../data/types';
import { MERGEABLE_FIELDS } from '../data/types';
import type { StorageErrorKind } from '../data/repository';
import { descendantIds } from './selectors';

// Zentraler App-Zustand. Alle Änderungen laufen über die Aktionen unten:
// sie wirken sofort (optimistisch), der Persister schreibt im Hintergrund.

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
  tasks: Record<ID, TaskState | undefined>;
  projects?: Project[];
}

export interface AppState {
  workspace: WorkspaceFile | null;
  users: User[];
  projects: Project[];
  tasks: Record<ID, TaskState>;
  meId: ID | null;

  // UI-Zustand, der von mehreren Ansichten geteilt wird
  panelId: ID | null;
  panelBack: ID[];
  panelFwd: ID[];
  focusReq: FocusRequest | null;
  toast: Toast | null;
  /** Frisch erledigte oder weggegebene Aufgaben bleiben bis zum Verlassen der Ansicht sichtbar */
  recentDone: Set<ID>;
  save: SaveStatus;
  undoStack: UndoEntry[];
  /** Kürzlich von anderen geänderte Aufgaben (kurzes Aufleuchten) */
  flash: Set<ID>;
}

const initial: AppState = {
  workspace: null,
  users: [],
  projects: [],
  tasks: {},
  meId: null,
  panelId: null,
  panelBack: [],
  panelFwd: [],
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

/* ---------- Hilfen ---------- */

const short = (s: string) => {
  const t = s.trim() || 'Ohne Titel';
  return t.length > 40 ? t.slice(0, 38) + '…' : t;
};
const act = (type: ActivityType, data?: Activity['data']): Activity => ({
  id: newId(),
  userId: get().meId ?? 'unbekannt',
  type,
  data,
  at: nowIso(),
});
const projectName = (id: ID | null) => get().projects.find((p) => p.id === id)?.name ?? null;
const sectionName = (projectId: ID | null, sectionId: ID | null) =>
  get().projects.find((p) => p.id === projectId)?.sections.find((s) => s.id === sectionId)?.name ?? null;

let toastSeq = 0;
export function showToast(msg: string, undo = false) {
  set({ toast: { id: String(++toastSeq), msg, undo } });
}
export const dismissToast = () => set({ toast: null });

function pushUndo(entry: UndoEntry, toast: boolean) {
  set((s) => ({ undoStack: [...s.undoStack.slice(-19), entry] }));
  if (toast) showToast(entry.label, true);
}

/* ---------- Laden / Sitzung ---------- */

export function loadSnapshot(snap: Snapshot) {
  const tasks: Record<ID, TaskState> = {};
  for (const t of snap.tasks) tasks[t.id] = t;
  set({ workspace: snap.workspace, users: snap.users, projects: snap.projects, tasks, undoStack: [], panelId: null, panelBack: [], panelFwd: [] });
}

export function resetApp() {
  set({ ...initial, recentDone: new Set(), flash: new Set() });
}

export const setMe = (id: ID | null) => set({ meId: id });
export const setSaveStatus = (save: SaveStatus) => set({ save });

/* ---------- Aufgaben ---------- */

export function addTask(fields: Partial<Task> = {}): ID {
  const t: TaskState = {
    ...makeTask({ createdBy: get().meId ?? 'unbekannt', ...fields }),
    draft: !fields.title?.trim(),
  };
  const me = get().meId;
  t.activity = [act('created')];
  if (t.assigneeId && t.assigneeId !== me) {
    t.activity.push(act('assigned', { userId: t.assigneeId, name: get().users.find((u) => u.id === t.assigneeId)?.name ?? null }));
  }
  // Ersteller und verantwortliche Person folgen der Aufgabe automatisch
  t.followerIds = [...new Set([...(me ? [me] : []), ...(t.assigneeId ? [t.assigneeId] : []), ...t.followerIds])];
  set((s) => ({ tasks: { ...s.tasks, [t.id]: t } }));
  return t.id;
}

export type TaskPatch = Partial<Pick<Task, MergeableField>>;

/** Wendet einen Patch an, protokolliert Aktivität und `fieldUpdatedAt`. Gibt die neue Aufgabe zurück. */
function applyPatch(t: TaskState, patch: TaskPatch, at: string): TaskState {
  const next: TaskState = { ...t, fieldUpdatedAt: { ...t.fieldUpdatedAt } };
  const log: Activity[] = [];
  for (const key of Object.keys(patch) as MergeableField[]) {
    const v = patch[key];
    if (JSON.stringify(t[key]) === JSON.stringify(v)) continue;
    (next as unknown as Record<string, unknown>)[key] = v;
    next.fieldUpdatedAt[key] = at;
    if (t.draft) continue;
    if (key === 'assigneeId') {
      const name = get().users.find((u) => u.id === v)?.name ?? null;
      log.push(act(v ? 'assigned' : 'unassigned', { userId: v as string | null, name }));
      if (v && !next.followerIds.includes(v as string)) {
        next.followerIds = [...next.followerIds, v as string];
        next.fieldUpdatedAt.followerIds = at;
      }
    } else if (key === 'dueDate') log.push(act(v ? 'due' : 'dueRemoved', { date: v as string | null }));
    else if (key === 'status') log.push(act('status', { status: v as string }));
    else if (key === 'completedAt') log.push(act(v ? 'completed' : 'reopened'));
    else if (key === 'sectionId' && v) log.push(act('section', { name: sectionName(next.projectId, v as string) }));
    else if (key === 'projectId') log.push(act(v ? 'project' : 'projectRemoved', { name: projectName(v as string | null) }));
  }
  if (typeof patch.title === 'string' && patch.title.trim()) next.draft = false;
  if (log.length) next.activity = [...t.activity, ...log];
  return next;
}

export interface UpdateOptions {
  /** Rückgängig-Eintrag mit diesem Text, `toast` zeigt ihn an */
  undo?: string;
  toast?: boolean;
}

export function updateTask(id: ID, patch: TaskPatch, opts: UpdateOptions = {}) {
  const s = get();
  const t = s.tasks[id];
  if (!t) return;
  const at = nowIso();
  const changed: Record<ID, TaskState> = { [id]: applyPatch(t, patch, at) };
  // Unteraufgaben folgen ihrer Hauptaufgabe ins Projekt
  if ('projectId' in patch) {
    for (const d of descendantIds(s.tasks, id)) changed[d] = applyPatch(s.tasks[d]!, { projectId: patch.projectId ?? null }, at);
  }
  if (patch.completedAt) s.recentDone.add(id);
  const tracked = Object.keys(patch).some((k) => k !== 'title' && k !== 'description');
  if (tracked && !t.draft) {
    const before: UndoEntry['tasks'] = {};
    for (const k of Object.keys(changed)) before[k] = s.tasks[k];
    pushUndo({ label: opts.undo ?? 'Änderung', tasks: before }, !!opts.toast);
  }
  set({ tasks: { ...s.tasks, ...changed } });
}

export function toggleDone(id: ID, value?: boolean) {
  const t = get().tasks[id];
  if (!t) return;
  const done = value ?? !t.completedAt;
  if (done === !!t.completedAt) return;
  updateTask(id, { completedAt: done ? nowIso() : null }, done ? { undo: `„${short(t.title)}“ erledigt`, toast: true } : { undo: 'Wieder geöffnet' });
  if (t.draft && done) set((s) => ({ tasks: { ...s.tasks, [id]: { ...s.tasks[id]!, draft: false } } }));
}

/** Weiches Löschen inkl. Unteraufgaben. Entwürfe werden direkt entfernt. */
export function deleteTask(id: ID, opts: { silent?: boolean } = {}) {
  const s = get();
  const t = s.tasks[id];
  if (!t) return;
  const ids = [id, ...descendantIds(s.tasks, id)];
  const before: UndoEntry['tasks'] = {};
  const tasks = { ...s.tasks };
  const at = nowIso();
  for (const k of ids) {
    const x = s.tasks[k]!;
    before[k] = x;
    if (x.draft) delete tasks[k];
    else tasks[k] = { ...x, deletedAt: at, fieldUpdatedAt: { ...x.fieldUpdatedAt, deletedAt: at }, activity: [...x.activity, act('deleted')] };
  }
  set({ tasks, panelId: s.panelId && ids.includes(s.panelId) ? null : s.panelId });
  if (!t.draft) pushUndo({ label: `„${short(t.title)}“ gelöscht`, tasks: before }, !opts.silent);
}

export function removeIfEmptyDraft(id: ID) {
  const s = get();
  const t = s.tasks[id];
  if (!t || !t.draft || t.title.trim() || descendantIds(s.tasks, id).length) return;
  const tasks = { ...s.tasks };
  delete tasks[id];
  set({ tasks });
}

/* ---------- Projekte und Bereiche ---------- */

function setProjects(fn: (projects: Project[]) => Project[], undo?: { label: string; toast: boolean }, taskBefore?: UndoEntry['tasks']) {
  const before = get().projects;
  set({ projects: fn(before) });
  if (undo) pushUndo({ label: undo.label, projects: before, tasks: taskBefore ?? {} }, undo.toast);
}

const touch = (p: Project): Project => ({ ...p, updatedAt: nowIso() });
const mapProject = (id: ID, fn: (p: Project) => Project) => (list: Project[]) => list.map((p) => (p.id === id ? touch(fn(p)) : p));
/** Nur Bereiche ändern: Projekt-`updatedAt` bleibt, damit gleichzeitige Umbenennungen des Projekts nicht verloren gehen */
const mapSections = (id: ID, fn: (s: Section[]) => Section[]) => (list: Project[]) => list.map((p) => (p.id === id ? { ...p, sections: fn(p.sections) } : p));

export function addProject(name: string): ID {
  const list = get().projects;
  const p = makeProject(name, pickColor(list.length), Math.max(0, ...list.map((x) => x.order)) + 1);
  setProjects((l) => [...l, p]);
  return p.id;
}

export const renameProject = (id: ID, name: string) => setProjects(mapProject(id, (p) => ({ ...p, name })));
export const setProjectColor = (id: ID, color: Color) => setProjects(mapProject(id, (p) => ({ ...p, color })));

export function archiveProject(id: ID, archived: boolean) {
  const p = get().projects.find((x) => x.id === id);
  if (!p) return;
  setProjects(mapProject(id, (x) => ({ ...x, archivedAt: archived ? nowIso() : null })), {
    label: archived ? `Projekt „${p.name}“ archiviert` : `Projekt „${p.name}“ wiederhergestellt`,
    toast: true,
  });
}

/** Weiches Löschen: Projekt verschwindet samt Aufgaben aus allen Ansichten. Aufräumen nach 30 Tagen. */
export function deleteProject(id: ID) {
  const p = get().projects.find((x) => x.id === id);
  if (!p) return;
  setProjects(mapProject(id, (x) => ({ ...x, deletedAt: nowIso() })), { label: `Projekt „${p.name}“ gelöscht`, toast: true });
}

export function addSection(projectId: ID, name: string, afterOrder?: number): ID {
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

export function renameSection(projectId: ID, sectionId: ID, name: string) {
  setProjects(mapSections(projectId, (list) => list.map((s) => (s.id === sectionId ? { ...s, name, updatedAt: nowIso() } : s))));
}

export function moveSection(projectId: ID, sectionId: ID, order: number) {
  const sec = get().projects.find((p) => p.id === projectId)?.sections.find((s) => s.id === sectionId);
  if (!sec) return;
  setProjects(mapSections(projectId, (list) => list.map((s) => (s.id === sectionId ? { ...s, order, updatedAt: nowIso() } : s))), { label: `Bereich „${sec.name}“ verschoben`, toast: false });
}

/** Löscht den Bereich und (weich) alle seine Aufgaben, mit Rückgängig. */
export function deleteSection(projectId: ID, sectionId: ID) {
  const s = get();
  const sec = s.projects.find((p) => p.id === projectId)?.sections.find((x) => x.id === sectionId);
  if (!sec) return;
  const at = nowIso();
  const before: UndoEntry['tasks'] = {};
  const tasks = { ...s.tasks };
  const roots = Object.values(s.tasks).filter((t) => t.projectId === projectId && t.sectionId === sectionId && !t.deletedAt);
  for (const r of roots) {
    for (const k of [r.id, ...descendantIds(s.tasks, r.id)]) {
      const x = s.tasks[k]!;
      if (x.deletedAt) continue;
      before[k] = x;
      if (x.draft) delete tasks[k];
      else tasks[k] = { ...x, deletedAt: at, fieldUpdatedAt: { ...x.fieldUpdatedAt, deletedAt: at } };
    }
  }
  set({ tasks });
  setProjects(
    mapSections(projectId, (list) => list.map((x) => (x.id === sectionId ? { ...x, deletedAt: at, updatedAt: at } : x))),
    { label: `Bereich „${sec.name}“ gelöscht`, toast: true },
    before,
  );
}

/* ---------- Kommentare, Follower, Anhänge ---------- */

/** @Name im Text → User-IDs (längste Namen zuerst, damit „@Lena Hoffmann“ vor „@Lena“ greift) */
export function findMentions(text: string, users: User[]): ID[] {
  const lower = text.toLowerCase();
  return users
    .filter((u) => !u.deletedAt)
    .sort((a, b) => b.name.length - a.name.length)
    .filter((u) => lower.includes('@' + u.name.toLowerCase()))
    .map((u) => u.id);
}

function patchTask(id: ID, fn: (t: TaskState) => TaskState) {
  const t = get().tasks[id];
  if (!t) return;
  set((s) => ({ tasks: { ...s.tasks, [id]: fn(t) } }));
}

export function addComment(taskId: ID, text: string) {
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
      comments: [...t.comments, { id: newId(), userId: me, text: text.trim(), mentions, at }],
      followerIds: followers,
      fieldUpdatedAt: changed ? { ...t.fieldUpdatedAt, followerIds: at } : t.fieldUpdatedAt,
    };
  });
}

export function deleteComment(taskId: ID, commentId: ID) {
  const at = nowIso();
  patchTask(taskId, (t) => ({ ...t, comments: t.comments.map((c) => (c.id === commentId ? { ...c, deletedAt: at } : c)) }));
}

export function setFollowing(taskId: ID, userId: ID, follow: boolean) {
  const t = get().tasks[taskId];
  if (!t || t.followerIds.includes(userId) === follow) return;
  updateTask(taskId, { followerIds: follow ? [...t.followerIds, userId] : t.followerIds.filter((x) => x !== userId) });
}

export function addAttachmentMeta(taskId: ID, a: Attachment) {
  patchTask(taskId, (t) => ({ ...t, attachments: [...t.attachments, a], activity: [...t.activity, act('attachment', { name: a.fileName })] }));
}

export function removeAttachment(taskId: ID, attachmentId: ID) {
  const t = get().tasks[taskId];
  const a = t?.attachments.find((x) => x.id === attachmentId);
  if (!t || !a) return;
  const before = t;
  patchTask(taskId, (x) => ({ ...x, attachments: x.attachments.map((y) => (y.id === attachmentId ? { ...y, removedAt: nowIso() } : y)) }));
  pushUndo({ label: `„${a.fileName}“ entfernt`, tasks: { [taskId]: before } }, true);
}

/* ---------- Personen ---------- */

export function addUser(name: string): ID {
  const u = makeUser(name.trim(), pickColor(get().users.length));
  set((s) => ({ users: [...s.users, u] }));
  return u.id;
}

/* ---------- Rückgängig ---------- */

export function undo() {
  const s = get();
  const entry = s.undoStack[s.undoStack.length - 1];
  if (!entry) return;
  const at = nowIso();
  const tasks = { ...s.tasks };
  for (const [id, before] of Object.entries(entry.tasks)) {
    const cur = s.tasks[id];
    if (!before) {
      delete tasks[id];
      continue;
    }
    const fieldUpdatedAt = { ...(cur?.fieldUpdatedAt ?? before.fieldUpdatedAt) };
    for (const f of MERGEABLE_FIELDS) {
      if (cur && JSON.stringify(cur[f]) !== JSON.stringify(before[f])) fieldUpdatedAt[f] = at;
    }
    // Kommentare und Aktivität werden nicht zurückgedreht
    tasks[id] = { ...before, fieldUpdatedAt, comments: cur?.comments ?? before.comments, activity: cur?.activity ?? before.activity };
    if (!before.completedAt) s.recentDone.delete(id);
  }
  let projects = s.projects;
  if (entry.projects) {
    const prev = new Map(entry.projects.map((p) => [p.id, p]));
    projects = s.projects.map((p) => {
      const b = prev.get(p.id);
      if (!b || b === p) return p;
      // feldgenau zurücksetzen: Bereiche, die inzwischen (z. B. von anderen) dazukamen, bleiben erhalten
      const fieldsChanged = (['name', 'color', 'order', 'archivedAt', 'deletedAt'] as const).some((k) => p[k] !== b[k]);
      const before = new Map(b.sections.map((x) => [x.id, x]));
      const sections = p.sections.map((x) => {
        const old = before.get(x.id);
        return old && JSON.stringify(old) !== JSON.stringify(x) ? { ...old, updatedAt: at } : x;
      });
      return fieldsChanged
        ? { ...p, name: b.name, color: b.color, order: b.order, archivedAt: b.archivedAt, deletedAt: b.deletedAt, updatedAt: at, sections }
        : { ...p, sections };
    });
  }
  set({ tasks, projects, undoStack: s.undoStack.slice(0, -1) });
  showToast('Rückgängig gemacht');
}

/* ---------- Panel und Fokus ---------- */

export function openPanel(id: ID) {
  const s = get();
  if (s.panelId === id) return;
  set({ panelId: id, panelBack: s.panelId ? [...s.panelBack.slice(-29), s.panelId] : s.panelBack, panelFwd: [] });
}
export function closePanel() {
  set({ panelId: null });
}
export function panelHistory(dir: -1 | 1) {
  const s = get();
  const from = dir < 0 ? s.panelBack : s.panelFwd;
  const target = [...from].reverse().find((id) => s.tasks[id] && !s.tasks[id]!.deletedAt);
  if (!target || !s.panelId) return;
  const rest = from.slice(0, from.lastIndexOf(target));
  if (dir < 0) set({ panelId: target, panelBack: rest, panelFwd: [...s.panelFwd, s.panelId] });
  else set({ panelId: target, panelFwd: rest, panelBack: [...s.panelBack, s.panelId] });
}

let focusSeq = 0;
let focusHandled = 0;
export const requestFocus = (id: ID, scope: FocusScope) => set({ focusReq: { id, scope, n: ++focusSeq } });

/**
 * Jede Fokus-Anfrage wirkt genau einmal. Sonst würde eine Zeile, die z. B. nach einer Datumsänderung
 * in eine andere Gruppe umzieht und neu aufgebaut wird, den Fokus erneut an sich ziehen.
 */
export function claimFocus(req: FocusRequest | null, id: ID, scope: FocusScope): boolean {
  if (!req || req.id !== id || req.scope !== scope || req.n <= focusHandled) return false;
  focusHandled = req.n;
  return true;
}

/** Wie claimFocus, ohne die Anfrage zu verbrauchen */
export const peekFocus = (req: FocusRequest | null, id: ID, scope: FocusScope) => !!req && req.id === id && req.scope === scope && req.n > focusHandled;

export const clearRecentDone = () => set({ recentDone: new Set() });

export function flashRows(ids: ID[]) {
  set((s) => ({ flash: new Set([...s.flash, ...ids]) }));
  setTimeout(() => set((s) => ({ flash: new Set([...s.flash].filter((x) => !ids.includes(x))) })), 1600);
}
