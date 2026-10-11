import { beforeEach, describe, expect, it } from 'vitest';
import * as A from '../../src/store/appStore';
import { buildGroups, defaultSettings } from '../../src/store/selectors';
import { sampleSnapshot } from '../../src/data/seed';
import { migrate } from '../../src/data/migrations';
import { mergeTask } from '../../src/data/merge';
import { MAX_TAG_LENGTH, normalizeTag, uniqueTags, withTag, withoutTag } from '../../src/lib/tags';
import type { Task } from '../../src/data/types';

describe('tag names', () => {
  it('trims and collapses spaces', () => {
    expect(normalizeTag('  Big   client  ')).toBe('Big client');
    expect(normalizeTag('   ')).toBe('');
  });

  it('is limited in length', () => {
    expect(normalizeTag('x'.repeat(MAX_TAG_LENGTH + 10))).toHaveLength(MAX_TAG_LENGTH);
  });

  it('is unique within a task regardless of case', () => {
    expect(withTag(['Kunde'], 'kunde')).toEqual(['Kunde']);
    expect(withTag(['Kunde'], ' Q4 ')).toEqual(['Kunde', 'Q4']);
    expect(withTag(['Kunde'], '  ')).toEqual(['Kunde']);
    expect(withoutTag(['Kunde', 'Q4'], 'Kunde')).toEqual(['Q4']);
  });

  it('lists every tag in use once', () => {
    expect(uniqueTags([['b', 'A'], undefined, ['a', 'c']])).toEqual(['A', 'b', 'c']);
  });

  it('a stored task keeps valid tags and rejects others', () => {
    const base = { schemaVersion: 1, id: 'task-1', title: 'x', createdAt: '2026-01-01T00:00:00Z', createdBy: 'u' };
    expect(migrate<Task>('task', { ...base, tags: ['Kunde', 'Q4'] }).tags).toEqual(['Kunde', 'Q4']);
    expect(() => migrate<Task>('task', { ...base, tags: [' padded '] })).toThrow();
    expect(() => migrate<Task>('task', { ...base, tags: [''] })).toThrow();
    expect(() => migrate<Task>('task', { ...base, tags: 'Kunde' })).toThrow();
  });

  it('tags merge like other fields: the newer change wins', () => {
    const t = migrate<Task>('task', { schemaVersion: 1, id: 'task-1', title: 'x', createdAt: '2026-01-01T00:00:00Z', createdBy: 'u', tags: ['a'], fieldUpdatedAt: { tags: '2026-01-02T00:00:00Z' } });
    const remote = { ...t, tags: ['b'], fieldUpdatedAt: { tags: '2026-01-03T00:00:00Z' } };
    expect(mergeTask(t, remote).tags).toEqual(['b']);
    expect(mergeTask(remote, t).tags).toEqual(['b']);
  });
});

describe('tags in the store', () => {
  beforeEach(() => {
    A.resetApp();
    const snap = sampleSnapshot('T');
    A.loadSnapshot(snap);
    A.setMe(snap.users[0]!.id);
  });

  const firstProjectTask = () => Object.values(A.useApp.getState().tasks).find((t) => t.projectId && !t.parentId && !t.deletedAt)!;

  it('adds and removes tags on a task', () => {
    const t = firstProjectTask();
    A.addTag(t.id, 'Kunde');
    A.addTag(t.id, 'kunde');
    expect(A.useApp.getState().tasks[t.id]!.tags).toEqual(['Kunde']);
    A.removeTag(t.id, 'Kunde');
    expect(A.useApp.getState().tasks[t.id]!.tags).toEqual([]);
  });

  it('filters the view by tag', () => {
    const t = firstProjectTask();
    A.addTag(t.id, 'Kunde');
    const view = { type: 'project' as const, id: t.projectId! };
    const settings = { ...defaultSettings(view), tag: 'kunde' };
    const state = A.useApp.getState();
    const ids = buildGroups({ ...state, view, settings, search: '', collapsed: {}, recentDone: state.recentDone })
      .flatMap((g) => g.tasks.map((x) => x.id));
    expect(ids).toEqual([t.id]);
  });
});
