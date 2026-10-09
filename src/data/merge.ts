import type { Activity, Attachment, Comment, Project, Section, Task, User } from './types';
import { MERGEABLE_FIELDS } from './types';

// Zusammenführen paralleler Änderungen (z. B. zwei Personen über OneDrive).
// Aufgaben: feldweise nach `fieldUpdatedAt`, neuer gewinnt, bei Gleichstand der lokale Stand.
// Kommentare, Aktivitäten, Anhänge: Vereinigung nach ID.

const stamp = (t: Task, f: (typeof MERGEABLE_FIELDS)[number]) => t.fieldUpdatedAt[f] ?? t.createdAt;
const later = (a?: string | null, b?: string | null) => ((a ?? '') >= (b ?? '') ? a : b) ?? null;

function unionById<T extends { id: string }>(a: T[], b: T[], pick: (x: T, y: T) => T = (x) => x): T[] {
  const map = new Map<string, T>();
  for (const x of a) map.set(x.id, x);
  for (const y of b) {
    const x = map.get(y.id);
    map.set(y.id, x ? pick(x, y) : y);
  }
  return [...map.values()];
}

const pickComment = (x: Comment, y: Comment): Comment => {
  const tx = later(x.deletedAt, x.editedAt) ?? x.at;
  const ty = later(y.deletedAt, y.editedAt) ?? y.at;
  return ty > tx ? y : x;
};
const pickAttachment = (x: Attachment, y: Attachment): Attachment => ({ ...x, removedAt: later(x.removedAt, y.removedAt) });

export function mergeTask(local: Task, remote: Task): Task {
  const out: Task = { ...local, fieldUpdatedAt: { ...local.fieldUpdatedAt } };
  for (const f of MERGEABLE_FIELDS) {
    const tl = stamp(local, f);
    const tr = stamp(remote, f);
    if (tr > tl) {
      (out as unknown as Record<string, unknown>)[f] = remote[f];
      out.fieldUpdatedAt[f] = tr;
    } else if (local.fieldUpdatedAt[f] === undefined && remote.fieldUpdatedAt[f] !== undefined) {
      out.fieldUpdatedAt[f] = remote.fieldUpdatedAt[f];
    }
  }
  out.comments = unionById(local.comments, remote.comments, pickComment).sort((a, b) => a.at.localeCompare(b.at));
  out.activity = unionById<Activity>(local.activity, remote.activity).sort((a, b) => a.at.localeCompare(b.at));
  out.attachments = unionById(local.attachments, remote.attachments, pickAttachment).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  return out;
}

const pickNewer = <T extends { updatedAt: string }>(x: T, y: T) => (y.updatedAt > x.updatedAt ? y : x);

/** Projekte: Projektfelder nach `updatedAt` des Projekts, Bereiche einzeln nach ihrem `updatedAt`. */
export function mergeProjects(local: Project[], remote: Project[]): Project[] {
  return unionById(local, remote, (l, r) => {
    const base = pickNewer(l, r);
    return { ...base, sections: unionById<Section>(l.sections, r.sections, pickNewer) };
  });
}

export function mergeUsers(local: User[], remote: User[]): User[] {
  return unionById(local, remote, pickNewer);
}

/** Inhaltlich gleich (ohne Reihenfolge-Rauschen der Serialisierung)? */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
