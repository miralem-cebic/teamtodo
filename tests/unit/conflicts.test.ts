import { beforeEach, describe, expect, it } from 'vitest';
import * as A from '../../src/store/appStore';
import { FsRepository } from '../../src/data/fs/FsRepository';
import { writeJson } from '../../src/data/fs/jsonFile';
import { MemDir } from '../../src/data/fs/memoryFs';
import { SCHEMA_VERSION } from '../../src/data/schema';
import { sampleSnapshot } from '../../src/data/seed';
import type { Task, User } from '../../src/data/types';
import { must } from '../../src/data/result';

const COPY = 'c7d1f2a0-1111-4222-8333-944455556666';

async function setup() {
  const root = new MemDir('teamtodo');
  const repo = new FsRepository(root.asHandle());
  const snap = sampleSnapshot('teamtodo');
  must(await repo.initialize(snap));
  const base = snap.tasks.find((t) => !t.parentId)!;
  return { root, repo, snap, base };
}

describe('conflict copies in the shared folder', () => {
  it('a task copy is listed, read and removed', async () => {
    const { root, repo, base } = await setup();
    const copy: Task = { ...base, id: COPY, title: 'Copy of the task', fieldUpdatedAt: { title: '2026-10-11T09:00:00.000Z' } };
    await writeJson((await root.getDirectoryHandle('tasks')) as unknown as FileSystemDirectoryHandle, `${COPY}-LAPTOP-1.json`, copy);

    const res = must(await repo.loadAll());
    const name = `tasks/${COPY}-LAPTOP-1.json`;
    expect(res.conflictCopies).toContain(name);

    const payload = await repo.readConflictCopy(name);
    expect(payload.kind).toBe('task');
    if (payload.kind === 'task') expect(payload.task.title).toBe('Copy of the task');

    await repo.removeConflictCopy(name);
    expect((must(await repo.loadAll())).conflictCopies).not.toContain(name);
  });

  it('a users copy is read as the users it holds', async () => {
    const { root, repo, snap } = await setup();
    await writeJson(root.asHandle() as unknown as FileSystemDirectoryHandle, 'users-MacBook.json', {
      schemaVersion: SCHEMA_VERSION,
      users: [...snap.users, { ...snap.users[0]!, id: 'other-1', name: 'Laptop user' }],
    });
    const payload = await repo.readConflictCopy('users-MacBook.json');
    expect(payload.kind).toBe('users');
    if (payload.kind === 'users') expect(payload.users.map((u: User) => u.name)).toContain('Laptop user');
  });

  it('a copy that cannot be read is reported as unreadable, so that it can be discarded', async () => {
    const { root, repo } = await setup();
    await writeJson(root.asHandle() as unknown as FileSystemDirectoryHandle, 'projects-LAPTOP.json', { schemaVersion: SCHEMA_VERSION, projects: 'nonsense' });
    const payload = await repo.readConflictCopy('projects-LAPTOP.json');
    expect(payload.kind).toBe('unreadable');
    await repo.removeConflictCopy('projects-LAPTOP.json');
    expect(root.children.has('projects-LAPTOP.json')).toBe(false);
  });
});

describe('merging a conflict copy into the workspace', () => {
  beforeEach(() => A.resetApp());

  it('a task copy with a newer title is merged into the loaded task', async () => {
    const { snap, base } = await setup();
    A.loadSnapshot(snap);
    A.mergeConflictPayload({
      kind: 'task',
      modified: 0,
      task: { ...base, title: 'Newer title from the copy', fieldUpdatedAt: { title: '2999-01-01T00:00:00.000Z' } },
    });
    expect(A.useApp.getState().tasks[base.id]!.title).toBe('Newer title from the copy');
  });

  it('a users copy adds its users', async () => {
    const { snap } = await setup();
    A.loadSnapshot(snap);
    const extra: User = { ...snap.users[0]!, id: 'other-1', name: 'Laptop user' };
    A.mergeConflictPayload({ kind: 'users', users: [extra], modified: 0 });
    expect(A.useApp.getState().users.map((u) => u.name)).toContain('Laptop user');
  });

  it('an unreadable copy changes nothing', async () => {
    const { snap } = await setup();
    A.loadSnapshot(snap);
    const before = A.useApp.getState().users;
    A.mergeConflictPayload({ kind: 'unreadable', message: 'x', modified: 0 });
    expect(A.useApp.getState().users).toBe(before);
  });
});
