import { showToast, useApp } from '../store/appStore';
import { today } from '../lib/dates';
import { mergeUsers } from './merge';
import { nowIso } from './schema';
import type { Repository } from './repository';
import type { ID, Snapshot, Task, TaskState } from './types';
import { MERGEABLE_FIELDS } from './types';

// Upkeep of the data folder: a daily full backup (14 are kept), final cleanup
// of entries deleted more than 30 days ago, and restoring from a backup.

export const KEEP_BACKUPS = 14;
export const PURGE_AFTER_DAYS = 30;
const DAILY = /^\d{4}-\d{2}-\d{2}$/;
const PRE_RESTORE = /^before-restore-/;

export function currentSnapshot(): Snapshot {
  const s = useApp.getState();
  return {
    workspace: s.workspace!,
    users: s.users,
    projects: s.projects,
    tasks: Object.values(s.tasks)
      .filter((t) => !t.draft)
      .map(({ draft: _d, ...t }) => t),
  };
}

/** On start: back up once a day (whoever comes first), remove old backups */
export async function dailyBackup(repo: Repository, force = false): Promise<string | null> {
  const ws = useApp.getState().workspace;
  if (!ws) return null;
  const day = today();
  if (!force && ws.lastBackupDate === day) return null;
  await repo.writeBackup(day, currentSnapshot());
  const all = await repo.listBackups();
  const daily = all.filter((b) => DAILY.test(b.name)).sort((a, b) => b.name.localeCompare(a.name));
  for (const b of daily.slice(KEEP_BACKUPS)) await repo.removeBackup(b.name);
  const pre = all.filter((b) => PRE_RESTORE.test(b.name)).sort((a, b) => b.name.localeCompare(a.name));
  for (const b of pre.slice(5)) await repo.removeBackup(b.name);
  useApp.setState((s) => ({ workspace: s.workspace ? { ...s.workspace, lastBackupDate: day } : s.workspace }));
  return day;
}

/** Permanently remove entries that have been deleted for more than 30 days */
export async function purge(repo: Repository, now = Date.now()): Promise<number> {
  const s = useApp.getState();
  const ws = s.workspace;
  if (!ws) return 0;
  if (ws.lastPurgeAt && now - Date.parse(ws.lastPurgeAt) < 86_400_000) return 0;
  const cutoff = new Date(now - PURGE_AFTER_DAYS * 86_400_000).toISOString();
  const old = (at?: string | null) => !!at && at < cutoff;

  const deadProjects = new Set(s.projects.filter((p) => old(p.deletedAt)).map((p) => p.id));
  const isDead = (t: TaskState): boolean => {
    for (let cur: TaskState | undefined = t, g = 0; cur && g < 50; g++) {
      if (old(cur.deletedAt) || (cur.projectId && deadProjects.has(cur.projectId))) return true;
      cur = cur.parentId ? s.tasks[cur.parentId] : undefined;
    }
    return false;
  };

  const remove: ID[] = Object.values(s.tasks).filter((t) => !t.draft && isDead(t)).map((t) => t.id);
  for (const id of remove) await repo.removeTask(id);

  // permanently delete removed attachments
  const tasks = { ...s.tasks };
  for (const id of remove) delete tasks[id];
  for (const t of Object.values(tasks)) {
    const gone = t.attachments.filter((a) => old(a.removedAt));
    if (!gone.length) continue;
    for (const a of gone) await repo.removeAttachment(t.id, a.fileName);
    tasks[t.id] = { ...t, attachments: t.attachments.filter((a) => !old(a.removedAt)) };
  }

  const projects = s.projects
    .filter((p) => !deadProjects.has(p.id))
    .map((p) => (p.sections.some((x) => old(x.deletedAt)) ? { ...p, sections: p.sections.filter((x) => !old(x.deletedAt)) } : p));
  const projectsChanged = projects.length !== s.projects.length || projects.some((p, i) => p !== s.projects[i]);

  useApp.setState({
    tasks,
    ...(projectsChanged ? { projects } : {}),
    workspace: { ...ws, lastPurgeAt: new Date(now).toISOString() },
  });
  return remove.length;
}

/**
 * Restores a backup. The current state is backed up first.
 * Restored fields get a new timestamp so that they win when merging;
 * tasks that do not exist in the backup are (softly) deleted.
 */
export async function restoreBackup(repo: Repository, name: string) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  await repo.writeBackup(`before-restore-${stamp}`, currentSnapshot());
  const b = await repo.readBackup(name);
  const at = nowIso();
  const s = useApp.getState();
  const allFields = Object.fromEntries(MERGEABLE_FIELDS.map((f) => [f, at])) as Task['fieldUpdatedAt'];

  const tasks: Record<ID, TaskState> = {};
  for (const t of b.tasks) {
    const cur = s.tasks[t.id];
    tasks[t.id] = { ...t, fieldUpdatedAt: allFields, comments: cur ? mergeComments(cur, t) : t.comments, activity: cur?.activity ?? t.activity };
  }
  for (const t of Object.values(s.tasks)) {
    if (tasks[t.id] || t.draft) continue;
    tasks[t.id] = { ...t, deletedAt: t.deletedAt ?? at, fieldUpdatedAt: { ...t.fieldUpdatedAt, deletedAt: at } };
  }
  const projects = b.projects.map((p) => ({ ...p, updatedAt: at, sections: p.sections.map((x) => ({ ...x, updatedAt: at })) }));
  // mark projects that were created after the backup as deleted
  for (const p of s.projects) if (!projects.some((x) => x.id === p.id)) projects.push({ ...p, deletedAt: p.deletedAt ?? at, updatedAt: at });
  useApp.setState({ tasks, projects, users: mergeUsers(s.users, b.users), panelId: null, undoStack: [] });
  showToast(`Backup from ${name} restored`);
}

function mergeComments(a: Task, b: Task) {
  const m = new Map(a.comments.map((c) => [c.id, c]));
  for (const c of b.comments) if (!m.has(c.id)) m.set(c.id, c);
  return [...m.values()].sort((x, y) => x.at.localeCompare(y.at));
}
