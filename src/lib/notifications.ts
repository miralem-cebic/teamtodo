import { openPanel, useApp } from '../store/appStore';
import { setNotifications, usePrefs } from '../store/prefs';
import { t } from '../i18n';
import type { ID, TaskState, User } from '../data/types';
import { today } from './dates';

// Browser notifications: a teammate assigns a task to me, or a task of mine is due soon.
// Opt-in per browser. They appear while the app is open (it reads changes from the folder every 10 s).

/** Due-time tasks notify this many minutes before the time */
export const DUE_SOON_MINUTES = 60;
const CHECK_MS = 60_000;
const SEEN_KEY = 'teamtodo.notified.v1';
const SEEN_MAX = 300;

export interface Notice {
  key: string;
  taskId: ID;
  title: string;
  body: string;
}

/** Tasks assigned to me by someone else, since `since` (ISO time), not yet seen. */
export function assignmentNotices(tasks: Record<ID, TaskState>, meId: ID, since: string, seen: Set<string>, users: User[]): Notice[] {
  const out: Notice[] = [];
  for (const task of Object.values(tasks)) {
    if (task.deletedAt || task.draft) continue;
    for (const a of task.activity) {
      if (a.type !== 'assigned' || a.data?.userId !== meId || a.userId === meId || a.at < since) continue;
      const key = `assigned:${a.id}`;
      if (seen.has(key)) continue;
      const by = users.find((u) => u.id === a.userId)?.name ?? t('inbox.someone');
      out.push({ key, taskId: task.id, title: t('notify.assignedTitle'), body: t('notify.assignedBody', { name: by, title: task.title }) });
    }
  }
  return out;
}

/** My open tasks due today (once per day), or due within DUE_SOON_MINUTES if they have a time. */
export function dueNotices(tasks: Record<ID, TaskState>, meId: ID, now: Date, todayIso: string, seen: Set<string>): Notice[] {
  const out: Notice[] = [];
  for (const task of Object.values(tasks)) {
    if (task.deletedAt || task.draft || task.completedAt || task.assigneeId !== meId || task.dueDate !== todayIso) continue;
    if (task.dueTime) {
      const [h, m] = task.dueTime.split(':').map(Number);
      const due = new Date(now);
      due.setHours(h ?? 0, m ?? 0, 0, 0);
      const minutes = (due.getTime() - now.getTime()) / 60_000;
      if (minutes < 0 || minutes > DUE_SOON_MINUTES) continue;
      const key = `soon:${task.id}:${todayIso}T${task.dueTime}`;
      if (!seen.has(key)) out.push({ key, taskId: task.id, title: t('notify.dueSoonTitle', { time: task.dueTime }), body: task.title });
    } else {
      const key = `today:${task.id}:${todayIso}`;
      if (!seen.has(key)) out.push({ key, taskId: task.id, title: t('notify.dueTitle'), body: task.title });
    }
  }
  return out;
}

function loadSeen(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-SEEN_MAX)));
  } catch {
    /* ignore */
  }
}

const canShow = () => typeof Notification !== 'undefined' && Notification.permission === 'granted';

function show(n: Notice) {
  if (!canShow()) return;
  try {
    const note = new Notification(n.title, { body: n.body, tag: n.key });
    note.onclick = () => {
      window.focus();
      openPanel(n.taskId);
      note.close();
    };
  } catch {
    /* the browser refused to show it */
  }
}

/** Watches the store while the app is open. Returns a function that stops it. */
export function startNotifications(): () => void {
  const since = new Date().toISOString(); // only changes from now on; older assignments stay silent
  const seen = loadSeen();
  const check = () => {
    const { tasks, users, meId } = useApp.getState();
    if (!meId) return;
    const now = new Date();
    const notices = [...assignmentNotices(tasks, meId, since, seen, users), ...dueNotices(tasks, meId, now, today(), seen)];
    if (!notices.length) return;
    for (const n of notices) {
      seen.add(n.key);
      if (usePrefs.getState().notifications) show(n);
    }
    saveSeen(seen);
  };
  const unsubscribe = useApp.subscribe((s, prev) => {
    if (s.tasks !== prev.tasks || s.meId !== prev.meId) check();
  });
  const timer = setInterval(check, CHECK_MS);
  check();
  return () => {
    unsubscribe();
    clearInterval(timer);
  };
}

export type NotifyResult = 'on' | 'off' | 'denied' | 'unsupported';

/** Turns notifications on (asks the browser for permission) or off. */
export async function setNotificationsEnabled(on: boolean): Promise<NotifyResult> {
  if (!on) {
    setNotifications(false);
    return 'off';
  }
  if (typeof Notification === 'undefined') return 'unsupported';
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') {
    setNotifications(false);
    return 'denied';
  }
  setNotifications(true);
  return 'on';
}
