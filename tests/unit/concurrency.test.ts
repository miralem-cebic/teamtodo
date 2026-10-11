// Two clients on one shared folder (simulated with one in-memory folder). The race is made deterministic:
// client A has checked the file, then client B writes, then A writes.
import { beforeEach, describe, expect, it } from 'vitest';
import * as A from '../../src/store/appStore';
import { useApp } from '../../src/store/appStore';
import { FsRepository } from '../../src/data/fs/FsRepository';
import { MemDir } from '../../src/data/fs/memoryFs';
import { writeJson } from '../../src/data/fs/jsonFile';
import { integrateTasks } from '../../src/data/sync';
import type { Persister } from '../../src/data/persister';
import { sampleSnapshot } from '../../src/data/seed';
import { SCHEMA_VERSION } from '../../src/data/schema';
import type { Task } from '../../src/data/types';
import { must } from '../../src/data/result';

/** The same folder, but writes that create a file wait until `gate` is released */
function gated(dir: MemDir, gate: () => Promise<void>): FileSystemDirectoryHandle {
  const wrap = (d: MemDir): unknown =>
    new Proxy(d, {
      get(target, prop) {
        if (prop === 'getFileHandle')
          return async (name: string, opts?: { create?: boolean }) => {
            if (opts?.create) await gate();
            return target.getFileHandle(name, opts);
          };
        if (prop === 'getDirectoryHandle')
          return async (name: string, opts?: { create?: boolean }) => wrap((await target.getDirectoryHandle(name, opts)) as MemDir);
        const v = Reflect.get(target, prop);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  return wrap(dir) as FileSystemDirectoryHandle;
}

async function readTask(root: MemDir, id: string): Promise<Task> {
  const tasks = await root.getDirectoryHandle('tasks');
  return JSON.parse(await (await (await tasks.getFileHandle(`${id}.json`)).getFile()).text()) as Task;
}

const cleanPersister = (clean: object) => ({ isClean: (o: object) => o === clean, markCleanObject: () => undefined }) as unknown as Persister;

describe('a broken user in the shared folder does not block saving', () => {
  it('saves users and projects, and keeps the broken record in the file', async () => {
    const root = new MemDir('teamtodo');
    const repo = new FsRepository(root.asHandle());
    const snap = sampleSnapshot('teamtodo');
    must(await repo.initialize(snap));
    // another client writes a user record that this version cannot read
    await writeJson(root.asHandle(), 'users.json', { schemaVersion: SCHEMA_VERSION, users: [...snap.users, { id: 'broken', name: 42 }] });

    const users = [{ ...snap.users[0]!, name: 'Renamed' }, ...snap.users.slice(1)];
    must(await repo.saveUsers(users));
    const text = JSON.parse(await (await (await root.getFileHandle('users.json')).getFile()).text()) as { users: { id: string; name: unknown }[] };
    expect(text.users).toContainEqual({ id: 'broken', name: 42 });
    expect(text.users.find((u) => u.id === snap.users[0]!.id)!.name).toBe('Renamed');
    expect(text.users.length).toBe(snap.users.length + 1);
  });
});

describe('lost update between two clients', () => {
  beforeEach(() => A.resetApp());

  it('the client that lost its change gets it back from its next poll and writes it again', async () => {
    const root = new MemDir('teamtodo');
    const snap = sampleSnapshot('teamtodo');
    const setup = new FsRepository(root.asHandle());
    must(await setup.initialize(snap));
    const base = (must(await setup.loadAll())).snapshot.tasks.find((t) => !t.parentId)!;

    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const repoA = new FsRepository(gated(root, () => gate));
    const repoB = new FsRepository(root.asHandle());
    must(await repoA.loadAll());
    must(await repoB.loadAll());

    const stamp = (n: number) => `2026-10-11T10:00:0${n}.000Z`;
    const aVersion: Task = { ...base, description: 'written by A', fieldUpdatedAt: { ...base.fieldUpdatedAt, description: stamp(2) } };
    const bVersion: Task = { ...base, title: 'written by B', fieldUpdatedAt: { ...base.fieldUpdatedAt, title: stamp(3) } };

    // A checks the file and waits; B saves its title change; A then writes its description
    const pendingA = repoA.saveTask(aVersion).then(must);
    must(await repoB.saveTask(bVersion));
    release();
    await pendingA;
    // B's title is gone from the file (read without loadAll, which would hide the change from B's next poll)
    expect((await readTask(root, base.id)).title).toBe(base.title);

    // B's next poll: its own copy is saved (clean), the file has changed, so B merges instead of replacing
    const change = must(await repoB.pullChanges());
    A.resetApp();
    A.loadSnapshot({ ...snap, tasks: [bVersion] });
    integrateTasks(cleanPersister(bVersion), change.tasks, change.removedTaskIds);
    const restored = useApp.getState().tasks[base.id]!;
    expect(restored.title).toBe('written by B');
    expect(restored.description).toBe('written by A');

    // and the restored state is written back
    must(await repoB.saveTask(restored));
    const final = await readTask(root, base.id);
    expect(final.title).toBe('written by B');
    expect(final.description).toBe('written by A');
  });
});

describe('clocks of different devices', () => {
  it('an edit made after seeing a newer stamp is newer than it, even if this device clock is behind', async () => {
    const { observeStamp, stampNow } = await import('../../src/data/clock');
    observeStamp('2026-10-11T12:00:00.000Z'); // another device, clock ahead
    const mine = stampNow(); // this device, clock at 11:00
    expect(mine > '2026-10-11T12:00:00.000Z').toBe(true);
  });
});
