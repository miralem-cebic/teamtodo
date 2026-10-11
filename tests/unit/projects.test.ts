import { beforeEach, describe, expect, it } from 'vitest';
import * as A from '../../src/store/appStore';
import { byPinnedThenOrder, reorderWithinGroup } from '../../src/store/selectors';
import { sampleSnapshot } from '../../src/data/seed';
import type { Project } from '../../src/data/types';

const AT = '2026-10-11T09:00:00.000Z';
const proj = (id: string, order: number, over: Partial<Project> = {}): Project => ({
  id,
  name: id,
  color: 'teal',
  order,
  sections: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});
const ids = (list: Project[]) => [...list].sort(byPinnedThenOrder).map((p) => p.id);

describe('project order', () => {
  it('pinned projects come first, then by order', () => {
    const list = [proj('a', 1), proj('b', 2, { pinned: true }), proj('c', 0), proj('d', 3, { pinned: true })];
    expect(ids(list)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('moves within the group and renumbers it', () => {
    const list = [proj('p1', 0, { pinned: true }), proj('p2', 1, { pinned: true }), proj('u1', 2), proj('u2', 3)];
    const next = reorderWithinGroup(list, 'p2', -1, AT)!;
    expect(ids(next)).toEqual(['p2', 'p1', 'u1', 'u2']);
    expect(next.find((p) => p.id === 'p2')!.updatedAt).toBe(AT);
    // projects that did not change keep their timestamp
    expect(next.find((p) => p.id === 'u1')).toBe(list.find((p) => p.id === 'u1'));
  });

  it('never moves a project across the pinned boundary', () => {
    const list = [proj('p1', 0, { pinned: true }), proj('u1', 1), proj('u2', 2)];
    expect(reorderWithinGroup(list, 'u1', -1, AT)).toBeNull();
    // the only pinned project cannot move down into the unpinned group, nor up out of the list
    expect(reorderWithinGroup(list, 'p1', 1, AT)).toBeNull();
    expect(reorderWithinGroup(list, 'p1', -1, AT)).toBeNull();
  });

  it('does not move past the ends of the group', () => {
    const list = [proj('u1', 0), proj('u2', 1)];
    expect(reorderWithinGroup(list, 'u1', -1, AT)).toBeNull();
    expect(reorderWithinGroup(list, 'u2', 1, AT)).toBeNull();
  });

  it('archived and deleted projects are not part of the arrangement', () => {
    const list = [proj('u1', 0), proj('old', 1, { archivedAt: AT }), proj('u2', 2)];
    const next = reorderWithinGroup(list, 'u1', 1, AT)!;
    expect(ids(next.filter((p) => !p.archivedAt))).toEqual(['u2', 'u1']);
  });
});

describe('pinning and moving in the store', () => {
  let order: string[];
  beforeEach(() => {
    A.resetApp();
    const snap = sampleSnapshot('T');
    A.loadSnapshot(snap);
    A.setMe(snap.users[0]!.id);
    order = ids(A.useApp.getState().projects);
  });

  const live = () => ids(A.useApp.getState().projects.filter((p) => !p.deletedAt && !p.template));

  it('pinning moves a project to the top, unpinning puts it under the others', () => {
    const [first, second, third] = order as [string, string, string];
    A.setProjectPinned(third, true);
    expect(live()).toEqual([third, first, second]);
    A.setProjectPinned(third, false);
    // unpinned: it goes to the start of the unpinned group
    expect(live()).toEqual([third, first, second]);
    expect(A.useApp.getState().projects.find((p) => p.id === third)!.pinned).toBe(false);
  });

  it('a pinned project moves only among pinned projects', () => {
    const [first, second] = order as [string, string];
    A.setProjectPinned(second, true);
    A.moveProject(first, -1);
    expect(live()[0]).toBe(second);
    const before = JSON.stringify(A.useApp.getState().projects);
    A.moveProject(first, 1);
    expect(JSON.stringify(A.useApp.getState().projects)).not.toBe(before);
  });

  it('a move that is not allowed changes nothing and adds no undo step', () => {
    const [first] = order as [string];
    const steps = A.useApp.getState().undoStack.length;
    const projects = A.useApp.getState().projects;
    A.moveProject(first, -1);
    expect(A.useApp.getState().projects).toBe(projects);
    expect(A.useApp.getState().undoStack.length).toBe(steps);
  });

  it('a move adds an undo step', () => {
    const [first] = order as [string];
    const steps = A.useApp.getState().undoStack.length;
    A.moveProject(first, 1);
    expect(A.useApp.getState().undoStack.length).toBe(steps + 1);
  });
});
