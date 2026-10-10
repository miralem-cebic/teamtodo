import { beforeEach, describe, expect, it } from 'vitest';
import * as A from '../../src/store/appStore';
import { buildGroups, defaultSettings, type View } from '../../src/store/selectors';
import { sampleSnapshot } from '../../src/data/seed';
import { addDays, today } from '../../src/lib/dates';

const st = () => A.useApp.getState();
let me = '';

beforeEach(() => {
  A.resetApp();
  const snap = sampleSnapshot('T');
  A.loadSnapshot(snap);
  me = snap.users[0]!.id;
  A.setMe(me);
});

const groups = (view: View, extra = {}) =>
  buildGroups({ ...st(), view, settings: { ...defaultSettings(view), ...extra }, search: '', collapsed: {}, recentDone: st().recentDone });

describe('Tasks', () => {
  it('a draft becomes a real task only with a title', () => {
    const id = A.addTask({ assigneeId: me });
    expect(st().tasks[id]!.draft).toBe(true);
    A.updateTask(id, { title: 'Neu' });
    expect(st().tasks[id]!.draft).toBe(false);
    expect(st().tasks[id]!.fieldUpdatedAt.title).toBeTruthy();
  });

  it('empty drafts disappear', () => {
    const id = A.addTask();
    A.removeIfEmptyDraft(id);
    expect(st().tasks[id]).toBeUndefined();
  });

  it('Erledigen mit Undo, bleibt bis Ansichtswechsel sichtbar', () => {
    const t = Object.values(st().tasks).find((x) => x.assigneeId === me && !x.completedAt && !x.parentId)!;
    A.toggleDone(t.id);
    expect(st().tasks[t.id]!.completedAt).toBeTruthy();
    expect(st().toast?.undo).toBe(true);
    const visible = groups({ type: 'my' }).flatMap((g) => g.tasks.map((x) => x.id));
    expect(visible).toContain(t.id);
    A.clearRecentDone();
    expect(groups({ type: 'my' }).flatMap((g) => g.tasks.map((x) => x.id))).not.toContain(t.id);
    A.undo();
    expect(st().tasks[t.id]!.completedAt).toBeNull();
    expect(st().tasks[t.id]!.activity.map((a) => a.type)).toContain('completed');
  });

  it('delete is soft, includes subtasks and can be undone', () => {
    const parent = Object.values(st().tasks).find((x) => Object.values(st().tasks).some((c) => c.parentId === x.id))!;
    const kids = Object.values(st().tasks).filter((c) => c.parentId === parent.id);
    A.deleteTask(parent.id);
    expect(st().tasks[parent.id]!.deletedAt).toBeTruthy();
    for (const k of kids) expect(st().tasks[k.id]!.deletedAt).toBeTruthy();
    A.undo();
    expect(st().tasks[parent.id]!.deletedAt).toBeNull();
    for (const k of kids) expect(st().tasks[k.id]!.deletedAt).toBeNull();
  });

  it('changing the project takes subtasks along', () => {
    const parent = Object.values(st().tasks).find((x) => Object.values(st().tasks).some((c) => c.parentId === x.id))!;
    const other = st().projects.find((p) => p.id !== parent.projectId)!;
    A.updateTask(parent.id, { projectId: other.id, sectionId: other.sections[0]!.id });
    for (const k of Object.values(st().tasks).filter((c) => c.parentId === parent.id)) expect(k.projectId).toBe(other.id);
  });
});

describe('Grouping', () => {
  it('My tasks by due date, subtasks included', () => {
    const g = groups({ type: 'my' });
    expect(g.map((x) => x.key)).toEqual(['overdue', 'today', 'soon', 'later', 'none']);
    const all = g.flatMap((x) => x.tasks);
    expect(all.every((t) => t.assigneeId === me)).toBe(true);
    expect(all.some((t) => t.parentId)).toBe(true);
    expect(g.find((x) => x.key === 'overdue')!.apply).toBeNull();
    expect(g.find((x) => x.key === 'today')!.defaults).toMatchObject({ assigneeId: me, dueDate: today() });
  });

  it('project by sections, parent tasks only', () => {
    const p = st().projects[0]!;
    const g = groups({ type: 'project', id: p.id });
    expect(g.map((x) => x.label)).toEqual(p.sections.map((s) => s.name));
    expect(g.flatMap((x) => x.tasks).every((t) => !t.parentId)).toBe(true);
  });

  it('a deleted section disappears with its tasks, undo restores both', () => {
    const p = st().projects[0]!;
    const sec = p.sections[0]!;
    const before = groups({ type: 'project', id: p.id }).find((x) => x.key === sec.id)!.tasks.length;
    expect(before).toBeGreaterThan(0);
    A.deleteSection(p.id, sec.id);
    expect(groups({ type: 'project', id: p.id }).some((x) => x.key === sec.id)).toBe(false);
    A.undo();
    expect(groups({ type: 'project', id: p.id }).find((x) => x.key === sec.id)!.tasks.length).toBe(before);
  });

  it('deleted projects also hide their tasks in "My tasks"', () => {
    const p = st().projects[0]!;
    A.deleteProject(p.id);
    expect(groups({ type: 'my' }).flatMap((x) => x.tasks).some((t) => t.projectId === p.id)).toBe(false);
  });

  it('due date filter Overdue', () => {
    const g = groups({ type: 'my' }, { due: 'overdue' });
    expect(g.flatMap((x) => x.tasks).every((t) => t.dueDate! < today())).toBe(true);
    expect(addDays(today(), 1) > today()).toBe(true);
  });
});
