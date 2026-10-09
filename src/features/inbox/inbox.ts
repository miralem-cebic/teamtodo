import { create } from 'zustand';
import type { ID, ISODateTime, TaskState, User } from '../../data/types';
import { activityText } from '../../lib/activityText';

// Eingang: wird aus Aktivitäten und Kommentaren abgeleitet, nicht gespeichert.
// Gelesen-Status pro Browser und Person in localStorage.

export type InboxKind = 'assigned' | 'mention' | 'comment' | 'completed';

export interface InboxItem {
  id: ID;
  kind: InboxKind;
  taskId: ID;
  userId: ID;
  at: ISODateTime;
  text: string;
  snippet?: string;
}

const DAYS = 30;

export function deriveInbox(tasks: Record<ID, TaskState>, users: User[], meId: ID | null, visible: (t: TaskState) => boolean): InboxItem[] {
  if (!meId) return [];
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  const out: InboxItem[] = [];
  for (const t of Object.values(tasks)) {
    if (t.draft || !visible(t)) continue;
    const follows = t.followerIds.includes(meId);
    for (const a of t.activity) {
      if (a.userId === meId || a.at < since) continue;
      if (a.type === 'assigned' && a.data?.userId === meId) {
        out.push({ id: a.id, kind: 'assigned', taskId: t.id, userId: a.userId, at: a.at, text: 'hat dir eine Aufgabe zugewiesen' });
      } else if (a.type === 'completed' && follows) {
        out.push({ id: a.id, kind: 'completed', taskId: t.id, userId: a.userId, at: a.at, text: activityText(a, users) });
      }
    }
    for (const c of t.comments) {
      if (c.userId === meId || c.deletedAt || c.at < since) continue;
      if (c.mentions.includes(meId)) out.push({ id: c.id, kind: 'mention', taskId: t.id, userId: c.userId, at: c.at, text: 'hat dich erwähnt', snippet: c.text });
      else if (follows) out.push({ id: c.id, kind: 'comment', taskId: t.id, userId: c.userId, at: c.at, text: 'hat kommentiert', snippet: c.text });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

interface ReadState {
  key: string;
  readBefore: string;
  read: Set<string>;
}

const keyFor = (workspaceId: string, meId: string) => `teamaufgaben.inbox.${workspaceId}.${meId}`;

export const useInboxRead = create<ReadState>()(() => ({ key: '', readBefore: '', read: new Set() }));

export function loadInboxRead(workspaceId: string, meId: string) {
  const key = keyFor(workspaceId, meId);
  let readBefore = '';
  let read: string[] = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) ({ readBefore = '', read = [] } = JSON.parse(raw) as { readBefore?: string; read?: string[] });
  } catch {
    /* ignorieren */
  }
  useInboxRead.setState({ key, readBefore, read: new Set(read) });
}

function persist() {
  const s = useInboxRead.getState();
  if (!s.key) return;
  try {
    localStorage.setItem(s.key, JSON.stringify({ readBefore: s.readBefore, read: [...s.read].slice(-500) }));
  } catch {
    /* ignorieren */
  }
}

export const isRead = (it: InboxItem, s: Pick<ReadState, 'readBefore' | 'read'>) => it.at <= s.readBefore || s.read.has(it.id);

export function markRead(ids: string[]) {
  useInboxRead.setState((s) => ({ read: new Set([...s.read, ...ids]) }));
  persist();
}

export function markAllRead() {
  useInboxRead.setState({ readBefore: new Date().toISOString(), read: new Set() });
  persist();
}
