// Budget checks for memory use with a large workspace (10,000 tasks). They count what is written in one step and
// how much the undo stack holds, not the time, so they do not depend on the machine they run on.
import { beforeEach, describe, expect, it } from 'vitest';
import * as A from '../../src/store/appStore';
import { writeLargeJson } from '../../src/data/fs/jsonFile';
import { FsRepository } from '../../src/data/fs/FsRepository';
import { MemDir } from '../../src/data/fs/memoryFs';
import { makeTask, SCHEMA_VERSION } from '../../src/data/schema';
import { sampleSnapshot } from '../../src/data/seed';
import type { Snapshot, Task } from '../../src/data/types';

const BATCH_CHARS = 1 << 20;

/** A workspace with many tasks; each task has a few comments and activity entries, as real ones do */
function bigSnapshot(count: number): Snapshot {
  const base = sampleSnapshot('big');
  const user = base.users[0]!;
  const tasks: Task[] = [];
  for (let i = 0; i < count; i++) {
    const t = makeTask({ createdBy: user.id, title: `Task ${i}`, description: 'Lorem ipsum dolor sit amet. '.repeat(4), projectId: base.projects[0]!.id, order: i });
    t.comments = [0, 1].map((c) => ({ id: `${t.id}-c${c}`, userId: user.id, text: 'Looks good to me', mentions: [], at: t.createdAt }));
    t.activity = [{ id: `${t.id}-a0`, userId: user.id, type: 'created', at: t.createdAt }];
    tasks.push(t);
  }
  return { ...base, tasks };
}

/** Records what a file receives, instead of storing it */
function recordingDir() {
  const writes: string[] = [];
  const fh = {
    createWritable: async () => ({
      write: async (data: string) => void writes.push(data),
      close: async () => undefined,
      abort: async () => undefined,
    }),
    getFile: async () => ({ lastModified: 1 }),
  };
  const dir = { getFileHandle: async () => fh } as unknown as FileSystemDirectoryHandle;
  return { dir, writes };
}

describe('backup writing (budget)', () => {
  it('writes 10,000 tasks in batches, never as one large string', async () => {
    const snap = bigSnapshot(10_000);
    const { dir, writes } = recordingDir();
    const { tasks, ...rest } = snap;
    await writeLargeJson(dir, 'backup.json', { schemaVersion: SCHEMA_VERSION, createdAt: 'x', ...rest }, { tasks });

    const total = writes.reduce((n, w) => n + w.length, 0);
    const largest = Math.max(...writes.map((w) => w.length));
    expect(total).toBeGreaterThan(5_000_000);
    expect(largest).toBeLessThanOrEqual(BATCH_CHARS + 10_000);
    expect(largest).toBeLessThan(total / 4);
  });

  it('the batched file is ordinary JSON with the same content', async () => {
    const snap = bigSnapshot(300);
    const { dir, writes } = recordingDir();
    const { tasks, ...rest } = snap;
    await writeLargeJson(dir, 'backup.json', { schemaVersion: SCHEMA_VERSION, createdAt: 'x', ...rest }, { tasks });
    const parsed = JSON.parse(writes.join('')) as Snapshot & { schemaVersion: number; createdAt: string };
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.tasks).toEqual(snap.tasks);
    expect(parsed.workspace).toEqual(snap.workspace);
    expect(parsed.projects).toEqual(snap.projects);
  });

  it('a backup of a large workspace reads back completely', async () => {
    const snap = bigSnapshot(2_000);
    const root = new MemDir('teamtodo');
    const repo = new FsRepository(root.asHandle());
    await repo.initialize(sampleSnapshot('teamtodo'));
    await repo.writeBackup('2026-10-10', snap);
    const back = await repo.readBackup('2026-10-10');
    expect(back.tasks).toHaveLength(2_000);
    expect(back.tasks.map((t) => t.id).sort()).toEqual(snap.tasks.map((t) => t.id).sort());
  });
});

describe('undo stack (budget)', () => {
  beforeEach(() => {
    A.resetApp();
  });

  it('keeps at most UNDO_LIMIT steps', () => {
    const snap = bigSnapshot(5);
    A.loadSnapshot(snap);
    A.setMe(snap.users[0]!.id);
    const id = snap.tasks[0]!.id;
    for (let i = 0; i < A.UNDO_LIMIT + 10; i++) A.updateTask(id, { status: i % 2 ? 'doing' : 'todo' });
    expect(A.useApp.getState().undoStack.length).toBe(A.UNDO_LIMIT);
  });

  it('keeps the stored state of the steps within UNDO_MAX_BYTES, dropping the oldest', () => {
    const snap = bigSnapshot(3);
    // one task with a large description: every change keeps its previous state in the undo stack
    const big = { ...snap.tasks[0]!, description: 'x'.repeat(400_000) };
    snap.tasks[0] = big;
    A.loadSnapshot(snap);
    A.setMe(snap.users[0]!.id);
    for (let i = 0; i < 15; i++) A.updateTask(big.id, { status: i % 2 ? 'doing' : 'todo' });

    const stack = A.useApp.getState().undoStack;
    const total = stack.reduce((n, e) => n + (e.bytes ?? 0), 0);
    expect(stack.length).toBeLessThan(A.UNDO_LIMIT);
    expect(stack.length).toBeGreaterThan(1);
    expect(total).toBeLessThanOrEqual(A.UNDO_MAX_BYTES);
    // the newest step is always kept, even if it alone is over the budget
    expect(stack[stack.length - 1]!.bytes).toBeGreaterThan(0);
  });

  it('trimUndo never drops the newest entry', () => {
    const huge = { label: 'huge', tasks: {}, bytes: A.UNDO_MAX_BYTES * 2 };
    expect(A.trimUndo([huge])).toEqual([huge]);
  });
});
