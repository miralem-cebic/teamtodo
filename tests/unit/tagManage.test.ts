import { beforeEach, describe, expect, it } from 'vitest';
import * as A from '../../src/store/appStore';
import { buildGroups, defaultSettings } from '../../src/store/selectors';
import { renameInList, tagCounts, withoutTagEverywhere } from '../../src/lib/tags';
import { sampleSnapshot } from '../../src/data/seed';
import type { Snapshot } from '../../src/data/types';

describe('tag lists', () => {
  it('renames a tag, keeping the order', () => {
    expect(renameInList(['a', 'Kunde', 'c'], 'kunde', 'Client')).toEqual(['a', 'Client', 'c']);
  });

  it('renaming onto a tag that exists merges them, without duplicates', () => {
    expect(renameInList(['Kunde', 'Client'], 'Kunde', 'client')).toEqual(['client']);
  });

  it('returns null when the task does not have the tag', () => {
    expect(renameInList(['a'], 'b', 'c')).toBeNull();
    expect(withoutTagEverywhere(['a'], 'b')).toBeNull();
  });

  it('counts live tasks per tag, ignoring the spelling of the second occurrence', () => {
    const counts = tagCounts([
      { tags: ['Kunde', 'Q4'] },
      { tags: ['kunde'] },
      { tags: ['Kunde'], deletedAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(counts).toEqual([
      { name: 'Kunde', count: 2 },
      { name: 'Q4', count: 1 },
    ]);
  });
});

describe('tags across the workspace', () => {
  let snap: Snapshot;
  beforeEach(() => {
    A.resetApp();
    snap = sampleSnapshot('T');
    const [a, b, c] = snap.tasks;
    const project = snap.projects[0]!.id;
    snap.tasks[0] = { ...a!, tags: ['Kunde'], projectId: project, parentId: null, sectionId: null, completedAt: null };
    snap.tasks[1] = { ...b!, tags: ['kunde', 'Q4'], projectId: project, parentId: null, sectionId: null, completedAt: null };
    snap.tasks[2] = { ...c!, tags: ['Q4'], projectId: project, parentId: null, sectionId: null, completedAt: null, deletedAt: '2026-01-01T00:00:00.000Z' };
    A.loadSnapshot(snap);
    A.setMe(snap.users[0]!.id);
  });

  it('renaming changes every live task that has the tag, and not deleted ones', () => {
    A.renameTag('Kunde', 'Client');
    const tasks = A.useApp.getState().tasks;
    expect(tasks[snap.tasks[0]!.id]!.tags).toEqual(['Client']);
    expect(tasks[snap.tasks[1]!.id]!.tags).toEqual(['Client', 'Q4']);
    expect(tasks[snap.tasks[2]!.id]!.tags).toEqual(['Q4']);
  });

  it('renaming onto an existing tag merges the two', () => {
    A.renameTag('Kunde', 'Q4');
    expect(A.useApp.getState().tasks[snap.tasks[1]!.id]!.tags).toEqual(['Q4']);
  });

  it('removing a tag takes it off every live task, and one undo brings it back', () => {
    A.removeTagEverywhere('Q4');
    expect(A.useApp.getState().tasks[snap.tasks[1]!.id]!.tags).toEqual(['kunde']);
    expect(A.useApp.getState().tasks[snap.tasks[2]!.id]!.tags).toEqual(['Q4']);
    A.undo();
    expect(A.useApp.getState().tasks[snap.tasks[1]!.id]!.tags).toEqual(['kunde', 'Q4']);
  });

  it('groups by tag: one group per tag, each task under its first tag', () => {
    const state = A.useApp.getState();
    const view = { type: 'project' as const, id: snap.projects[0]!.id };
    const settings = { ...defaultSettings(view), group: 'tag' as const };
    const groups = buildGroups({ ...state, view, settings, search: '', collapsed: {}, recentDone: state.recentDone });
    const labels = groups.map((g) => g.label);
    // Q4 is only a second tag of the live task that starts with kunde: no group of its own
    expect(labels).toEqual(['Kunde', 'No tag']);
    const kunde = groups.find((g) => g.label === 'Kunde')!;
    expect(kunde.tasks.map((x) => x.id)).toContain(snap.tasks[0]!.id);
    expect(kunde.tasks.map((x) => x.id)).toContain(snap.tasks[1]!.id);
    // the task with tags ['kunde', 'Q4'] is in one group only
    expect(groups.filter((g) => g.tasks.some((x) => x.id === snap.tasks[1]!.id))).toHaveLength(1);
  });
});
