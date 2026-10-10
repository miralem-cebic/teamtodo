import { beforeEach, describe, expect, it } from 'vitest';
import * as A from '../../src/store/appStore';
import { descendantIds } from '../../src/store/selectors';
import { currentSnapshot, dailyBackup } from '../../src/data/maintenance';
import { mergeTask } from '../../src/data/merge';
import { sampleSnapshot } from '../../src/data/seed';
import type { Repository } from '../../src/data/repository';
import type { TaskState } from '../../src/data/types';

const st = () => A.useApp.getState();

beforeEach(() => {
  A.resetApp();
});

describe('backup snapshot without a workspace', () => {
  it('returns null instead of an invalid snapshot', () => {
    expect(currentSnapshot()).toBeNull();
  });

  it('a daily backup does nothing while no workspace is loaded', async () => {
    const repo = {} as Repository; // must not be touched
    expect(await dailyBackup(repo, true)).toBeNull();
  });

  it('builds a full snapshot once the workspace is loaded', () => {
    A.loadSnapshot(sampleSnapshot('T'));
    const snap = currentSnapshot();
    expect(snap?.workspace.name).toBe('T');
    expect(snap?.projects.length).toBeGreaterThan(0);
  });
});

describe('descendantIds', () => {
  beforeEach(() => {
    A.loadSnapshot(sampleSnapshot('T'));
  });

  it('returns all subtasks at any depth, each once', () => {
    const root = A.addTask({ title: 'Root' });
    const child = A.addTask({ parentId: root, title: 'Child' });
    const grand = A.addTask({ parentId: child, title: 'Grandchild' });
    const other = A.addTask({ parentId: root, title: 'Second child' });
    expect(descendantIds(st().tasks, root).sort()).toEqual([child, grand, other].sort());
    expect(descendantIds(st().tasks, grand)).toEqual([]);
  });

  it('sees tasks added after an earlier call (the index follows the state)', () => {
    const root = A.addTask({ title: 'Root' });
    expect(descendantIds(st().tasks, root)).toEqual([]);
    const child = A.addTask({ parentId: root, title: 'Late child' });
    expect(descendantIds(st().tasks, root)).toEqual([child]);
  });

  it('does not loop forever on a cycle in the data', () => {
    const a = A.addTask({ title: 'A' });
    const b = A.addTask({ parentId: a, title: 'B' });
    const tasks = { ...st().tasks, [a]: { ...st().tasks[a]!, parentId: b } as TaskState };
    expect(descendantIds(tasks, a).sort()).toEqual([b].sort());
  });
});

describe('mergeTask', () => {
  it('takes the newer value per field and keeps the timestamps', () => {
    A.loadSnapshot(sampleSnapshot('T'));
    const id = A.addTask({ title: 'Old' });
    const local = st().tasks[id]!;
    const remote: TaskState = { ...local, title: 'New', fieldUpdatedAt: { ...local.fieldUpdatedAt, title: '2999-01-01T00:00:00.000Z' } };
    const merged = mergeTask(local, remote);
    expect(merged.title).toBe('New');
    expect(merged.fieldUpdatedAt.title).toBe('2999-01-01T00:00:00.000Z');
    expect(merged.description).toBe(local.description);
  });
});
