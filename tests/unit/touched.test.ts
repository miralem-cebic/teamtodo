import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as A from '../../src/store/appStore';
import { Persister, DEBOUNCE_MS, SWEEP_MS } from '../../src/data/persister';
import { makeTask } from '../../src/data/schema';
import { sampleSnapshot } from '../../src/data/seed';
import { ok, type Result } from '../../src/data/result';
import type { Repository, StorageError } from '../../src/data/repository';
import type { Snapshot, Task } from '../../src/data/types';

beforeAll(() => {
  (globalThis as unknown as { window: unknown }).window = { addEventListener() {}, removeEventListener() {} };
});

/** A repository that only records which tasks it is asked to save */
function recording() {
  const saved: string[] = [];
  const repo = {
    saveTask: async (t: Task): Promise<Result<Task, StorageError>> => {
      saved.push(t.id);
      return ok(t);
    },
    saveUsers: async <T>(v: T): Promise<Result<T, StorageError>> => ok(v),
    saveProjects: async <T>(v: T): Promise<Result<T, StorageError>> => ok(v),
    saveWorkspace: async <T>(v: T): Promise<Result<T, StorageError>> => ok(v),
  } as unknown as Repository;
  return { repo, saved };
}

function workspace(count: number): Snapshot {
  const base = sampleSnapshot('T');
  const user = base.users[0]!;
  const tasks = Array.from({ length: count }, (_, i) => makeTask({ createdBy: user.id, title: `Task ${i}`, projectId: base.projects[0]!.id, order: i }));
  return { ...base, tasks };
}

let persister: Persister | null = null;
afterEach(() => {
  persister?.stop();
  persister = null;
  vi.useRealTimers();
});

describe('the persister writes what changed', () => {
  it('one change in a workspace of 300 tasks saves exactly that task', async () => {
    const snap = workspace(300);
    A.resetApp();
    A.loadSnapshot(snap);
    A.setMe(snap.users[0]!.id);
    const { repo, saved } = recording();
    persister = new Persister(repo);
    persister.start();

    const id = snap.tasks[42]!.id;
    A.updateTask(id, { status: 'doing' });
    await persister.flush();
    expect(saved).toEqual([id]);
  });

  it('a change that was not reported is still written by the periodic sweep', async () => {
    vi.useFakeTimers();
    const snap = workspace(5);
    A.resetApp();
    A.loadSnapshot(snap);
    const { repo, saved } = recording();
    persister = new Persister(repo);
    persister.start();

    // written around the store's own actions, so nothing is reported as touched
    const id = snap.tasks[1]!.id;
    const current = A.useApp.getState().tasks;
    A.useApp.setState({ tasks: { ...current, [id]: { ...current[id]!, title: 'Changed without a report' } } });
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toEqual([]);

    await vi.advanceTimersByTimeAsync(SWEEP_MS + DEBOUNCE_MS + 10);
    expect(saved).toEqual([id]);
  });

  it('removing a person saves the unassigned tasks at once, not on the next sweep', async () => {
    const snap = workspace(4);
    const jonas = snap.users[1]!;
    snap.tasks[0] = { ...snap.tasks[0]!, assigneeId: jonas.id };
    snap.tasks[2] = { ...snap.tasks[2]!, assigneeId: jonas.id };
    A.resetApp();
    A.loadSnapshot(snap);
    A.setMe(snap.users[0]!.id);
    const { repo, saved } = recording();
    persister = new Persister(repo);
    persister.start();

    expect(A.deleteUser(jonas.id)).toBe(2);
    await persister.flush();
    expect(saved.sort()).toEqual([snap.tasks[0]!.id, snap.tasks[2]!.id].sort());
  });
});
