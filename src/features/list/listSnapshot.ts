// What the list rows need when the user acts on them (move, add, Enter chain). The list publishes it while it
// renders; the rows read it in their event handlers. Rows do not get it as props: a row whose task did not change
// then skips rendering when the list changes (see TaskRow).
import type { Group } from '../../store/selectors';
import type { ID, TaskState } from '../../data/types';

interface Snapshot {
  groups: Map<string, Group>;
  /** All subtasks per task (done ones too) */
  children: Record<ID, TaskState[]>;
  /** The subtasks that are shown, per expanded task, in display order */
  shownSubs: Map<ID, TaskState[]>;
}

let snap: Snapshot = { groups: new Map(), children: {}, shownSubs: new Map() };

export function publishListSnapshot(groups: Group[], children: Record<ID, TaskState[]>, shownSubs: Map<ID, TaskState[]>) {
  snap = { groups: new Map(groups.map((g) => [g.key, g])), children, shownSubs };
}

export const listGroup = (key: string): Group | undefined => snap.groups.get(key);
export const listAllKids = (id: ID): TaskState[] => snap.children[id] ?? [];
/** Siblings in display order: the group's tasks for a top task, the shown subtasks for a subtask */
export function listSiblings(parentId: ID | null, groupKey: string): TaskState[] {
  return parentId ? (snap.shownSubs.get(parentId) ?? []) : (snap.groups.get(groupKey)?.tasks ?? []);
}
