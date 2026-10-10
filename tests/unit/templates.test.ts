import { beforeEach, describe, expect, it } from 'vitest';
import * as A from '../../src/store/appStore';
import { buildGroups, defaultSettings, visibleTasks, type View } from '../../src/store/selectors';
import { sampleSnapshot } from '../../src/data/seed';
import { addDays } from '../../src/lib/dates';
import type { ID, TaskState } from '../../src/data/types';

const st = () => A.useApp.getState();
let me = '';
let src: ID;

beforeEach(() => {
  A.resetApp();
  const snap = sampleSnapshot('T');
  A.loadSnapshot(snap);
  me = snap.users[0]!.id;
  A.setMe(me);
  // A project with a subtask, assigned tasks and due dates
  src = A.addProject('Webinar');
  const sec = A.addSection(src, 'Vorbereitung');
  const parent = A.addTask({ projectId: src, sectionId: sec, title: 'Landing page', description: 'Siehe https://abc.de/efg', assigneeId: me, dueDate: addDays(new Date().toISOString().slice(0, 10), 3) });
  A.addTask({ projectId: src, sectionId: sec, parentId: parent, title: 'Texte', assigneeId: me, dueDate: '2026-12-01' });
  A.toggleDone(A.addTask({ projectId: src, sectionId: sec, title: 'Erledigt' }));
});

const tasksOf = (projectId: ID) => Object.values(st().tasks).filter((t) => t.projectId === projectId && !t.deletedAt);
const sourceSections = () => st().projects.find((p) => p.id === src)!.sections.map((s) => s.name);
const groupsFor = (view: View) => buildGroups({ ...st(), view, settings: defaultSettings(view), search: '', collapsed: {}, recentDone: st().recentDone });

describe('Templates', () => {
  it('saving a project keeps sections, tasks, descriptions and subtasks, but not the project itself', () => {
    const tid = A.saveAsTemplate(src, 'Webinar-Vorlage')!;
    const tpl = st().projects.find((p) => p.id === tid)!;
    expect(tpl.template).toBe(true);
    expect(tpl.name).toBe('Webinar-Vorlage');
    expect(tpl.sections.map((s) => s.name)).toEqual(sourceSections());
    expect(tpl.sections.find((s) => s.name === 'Vorbereitung')!.id).not.toBe(st().projects.find((p) => p.id === src)!.sections[0]!.id);

    const copies = tasksOf(tid);
    expect(copies.map((t) => t.title).sort()).toEqual(['Erledigt', 'Landing page', 'Texte']);
    const parent = copies.find((t) => t.title === 'Landing page')!;
    expect(parent.description).toBe('Siehe https://abc.de/efg');
    expect(parent.sectionId).toBe(tpl.sections.find((s) => s.name === 'Vorbereitung')!.id);
    expect(copies.find((t) => t.title === 'Texte')!.parentId).toBe(parent.id);
  });

  it('template copies drop assignments, due dates and completion', () => {
    const tid = A.saveAsTemplate(src, 'Vorlage')!;
    for (const t of tasksOf(tid)) {
      expect(t.assigneeId).toBeNull();
      expect(t.dueDate).toBeNull();
      expect(t.completedAt).toBeNull();
      expect(t.draft).toBe(false);
    }
  });

  it('templates do not show in the project list or in any view', () => {
    const tid = A.saveAsTemplate(src, 'Vorlage')!;
    expect(st().projects.find((p) => p.id === tid)).toBeDefined();
    expect(visibleTasks(st().tasks, st().projects).visible.some((t) => t.projectId === tid)).toBe(false);
    expect(groupsFor({ type: 'my' }).flatMap((g) => g.tasks).some((t) => t.projectId === tid)).toBe(false);
    expect(groupsFor({ type: 'project', id: src }).flatMap((g) => g.tasks).length).toBeGreaterThan(0);
  });

  it('a new project from a template has the same structure, no assignments and no due dates', () => {
    const tid = A.saveAsTemplate(src, 'Vorlage')!;
    const id = A.addProjectFromTemplate(tid, 'Webinar Juni')!;
    const p = st().projects.find((x) => x.id === id)!;
    expect(p.name).toBe('Webinar Juni');
    expect(p.template).toBeFalsy();
    expect(p.sections.map((s) => s.name)).toEqual(sourceSections());

    const copies = tasksOf(id);
    expect(copies).toHaveLength(3);
    const parent = copies.find((t: TaskState) => t.title === 'Landing page')!;
    const sub = copies.find((t: TaskState) => t.title === 'Texte')!;
    expect(sub.parentId).toBe(parent.id);
    expect(sub.sectionId).toBeNull();
    expect(parent.sectionId).toBe(p.sections.find((s) => s.name === 'Vorbereitung')!.id);
    expect(copies.every((t) => t.assigneeId === null && t.dueDate === null)).toBe(true);
    // the template itself is untouched
    expect(tasksOf(tid)).toHaveLength(3);
  });

  it('a project from a template appears in the project list, the template does not', () => {
    const tid = A.saveAsTemplate(src, 'Vorlage')!;
    const id = A.addProjectFromTemplate(tid, 'Neu')!;
    const names = groupsFor({ type: 'my' }).map((g) => g.key);
    expect(names).not.toContain(tid);
    expect(st().projects.filter((p) => !p.template).map((p) => p.id)).toContain(id);
  });

  it('empty names and unknown templates create nothing', () => {
    const tid = A.saveAsTemplate(src, 'Vorlage')!;
    const before = st().projects.length;
    expect(A.addProjectFromTemplate(tid, '   ')).toBeNull();
    expect(A.addProjectFromTemplate(src, 'Kein Template')).toBeNull();
    expect(A.saveAsTemplate(src, '')).toBeNull();
    expect(st().projects.length).toBe(before);
  });
});
