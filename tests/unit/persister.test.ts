import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FsRepository } from '../../src/data/fs/FsRepository';
import { MemDir } from '../../src/data/fs/memoryFs';
import { Persister } from '../../src/data/persister';
import { sampleSnapshot } from '../../src/data/seed';
import * as A from '../../src/store/appStore';

beforeAll(() => {
  (globalThis as unknown as { window: unknown }).window = { addEventListener() {}, removeEventListener() {} };
});

let root: MemDir;
let repo: FsRepository;
let persister: Persister;

beforeEach(async () => {
  root = new MemDir('T');
  repo = new FsRepository(root.asHandle());
  await repo.initialize(sampleSnapshot('T'));
  const res = await repo.loadAll();
  A.resetApp();
  A.loadSnapshot(res.snapshot);
  A.setMe(res.snapshot.users[0]!.id);
  persister = new Persister(repo);
  persister.start();
});

const fileCount = async () => (await root.getDirectoryHandle('tasks')).children.size;

describe('Persister', () => {
  it('schreibt nur echte Aufgaben, keine leeren Entwürfe', async () => {
    const n = await fileCount();
    const id = A.addTask();
    await persister.flush();
    expect(await fileCount()).toBe(n);
    A.updateTask(id, { title: 'Gespeichert' });
    await persister.flush();
    expect(await fileCount()).toBe(n + 1);
    const res = await repo.loadAll();
    expect(res.snapshot.tasks.find((t) => t.id === id)?.title).toBe('Gespeichert');
    expect(A.useApp.getState().save.state).toBe('saved');
    persister.stop();
  });

  it('überlebt Neuladen: Änderungen und Bereiche', async () => {
    const t = Object.values(A.useApp.getState().tasks)[0]!;
    A.toggleDone(t.id);
    const p = A.useApp.getState().projects[0]!;
    A.addSection(p.id, 'Neu hier');
    await persister.flush();
    const res = await repo.loadAll();
    expect(res.snapshot.tasks.find((x) => x.id === t.id)?.completedAt).toBeTruthy();
    expect(res.snapshot.projects[0]!.sections.map((s) => s.name)).toContain('Neu hier');
    persister.stop();
  });

  it('meldet Fehler und behält die Änderung für einen neuen Versuch', async () => {
    const orig = repo.saveTask.bind(repo);
    let fail = true;
    repo.saveTask = async (t) => {
      if (fail) throw new DOMException('nein', 'NotAllowedError');
      return orig(t);
    };
    const t = Object.values(A.useApp.getState().tasks)[0]!;
    A.updateTask(t.id, { title: 'Nach Fehler' });
    await persister.flush();
    expect(A.useApp.getState().save).toEqual({ state: 'error', kind: 'permission' });
    fail = false;
    await persister.retry();
    expect(A.useApp.getState().save.state).toBe('saved');
    expect((await repo.loadAll()).snapshot.tasks.find((x) => x.id === t.id)?.title).toBe('Nach Fehler');
    persister.stop();
  });
});
