import { beforeEach, describe, expect, it } from 'vitest';
import { FsRepository } from '../../src/data/fs/FsRepository';
import { MemDir } from '../../src/data/fs/memoryFs';
import { sampleSnapshot } from '../../src/data/seed';
import { dailyBackup, purge, restoreBackup, KEEP_BACKUPS } from '../../src/data/maintenance';
import * as A from '../../src/store/appStore';
import type { Task } from '../../src/data/types';

// Change timestamps relative to now, as in the app. Fixed dates in the past
// are older than the sample data (createdAt = 3 days ago) and would lose when merging.
const at = (min: number) => new Date(Date.now() + min * 60_000).toISOString();
const tick = () => new Promise((r) => setTimeout(r, 2));

describe('Two people, one folder (repository level)', () => {
  let root: MemDir;
  let a: FsRepository;
  let b: FsRepository;
  let task: Task;

  beforeEach(async () => {
    root = new MemDir('T');
    const snap = sampleSnapshot('T');
    await new FsRepository(root.asHandle()).initialize(snap);
    a = new FsRepository(root.asHandle());
    b = new FsRepository(root.asHandle());
    await a.loadAll();
    await b.loadAll();
    task = snap.tasks[0]!;
  });

  it('simultaneous changes to different fields are not lost', async () => {
    const byA = { ...task, title: 'Titel von A', fieldUpdatedAt: { ...task.fieldUpdatedAt, title: at(1) } };
    const byB = { ...task, assigneeId: 'jemand', fieldUpdatedAt: { ...task.fieldUpdatedAt, assigneeId: at(2) } };
    expect(await a.saveTask(byA)).toBe(byA); // no conflict
    await tick();
    const stored = await b.saveTask(byB); // B is stale → merge
    expect(stored.title).toBe('Titel von A');
    expect(stored.assigneeId).toBe('jemand');

    const changes = await a.pullChanges();
    const seen = changes.tasks.find((t) => t.id === task.id)!;
    expect(seen.title).toBe('Titel von A');
    expect(seen.assigneeId).toBe('jemand');
    // a second sync finds nothing new
    expect((await a.pullChanges()).tasks).toEqual([]);
  });

  it('new tasks, removed tasks and projects are detected', async () => {
    const extra = { ...task, id: crypto.randomUUID(), title: 'Neu von B' };
    await b.saveTask(extra);
    await b.removeTask(task.id);
    const snap = await b.loadAll();
    await b.saveProjects([...snap.snapshot.projects.slice(1)]);
    const c = await a.pullChanges();
    expect(c.tasks.map((t) => t.title)).toContain('Neu von B');
    expect(c.removedTaskIds).toContain(task.id);
    expect(c.projects).toBeDefined();
  });

  it('detects conflict copies during sync', async () => {
    await (await root.getDirectoryHandle('tasks')).getFileHandle(`${task.id}-LAPTOP-2.json`, { create: true });
    expect((await a.pullChanges()).conflictCopies).toEqual([`tasks/${task.id}-LAPTOP-2.json`]);
  });

  it('attachments: unique names, read, remove', async () => {
    const n1 = await a.writeAttachment(task.id, 'bericht.pdf', new Blob(['%PDF eins'], { type: 'application/pdf' }));
    const n2 = await a.writeAttachment(task.id, 'bericht.pdf', new Blob(['%PDF zwei']));
    expect([n1, n2]).toEqual(['bericht.pdf', 'bericht (2).pdf']);
    expect(await (await a.readAttachment(task.id, n2)).text()).toBe('%PDF zwei');
    await a.removeAttachment(task.id, n1);
    await expect(a.readAttachment(task.id, n1)).rejects.toThrow();
  });
});

describe('Maintenance: backups and cleanup', () => {
  let root: MemDir;
  let repo: FsRepository;

  beforeEach(async () => {
    root = new MemDir('T');
    repo = new FsRepository(root.asHandle());
    await repo.initialize(sampleSnapshot('T'));
    A.resetApp();
    A.loadSnapshot((await repo.loadAll()).snapshot);
    A.setMe(A.useApp.getState().users[0]!.id);
  });

  it('backs up once a day and keeps 14 backups', async () => {
    for (let i = 1; i <= 16; i++) await repo.writeBackup(`2026-09-${String(i).padStart(2, '0')}`, A.useApp.getState() as never);
    const name = await dailyBackup(repo);
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await dailyBackup(repo)).toBeNull(); // already backed up today
    const list = await repo.listBackups();
    expect(list).toHaveLength(KEEP_BACKUPS);
    expect(list[0]!.name).toBe(name);
  });

  it('removes permanently after 30 days, younger deletions stay', async () => {
    // two independent parent tasks without subtasks
    const all = Object.values(A.useApp.getState().tasks);
    const roots = all.filter((t) => !t.parentId && !all.some((c) => c.parentId === t.id));
    const [oldDel, newDel] = roots;
    A.useApp.setState((s) => ({
      tasks: {
        ...s.tasks,
        [oldDel!.id]: { ...oldDel!, deletedAt: '2026-08-01T00:00:00.000Z' },
        [newDel!.id]: { ...newDel!, deletedAt: new Date().toISOString() },
      },
    }));
    await repo.saveTask(A.useApp.getState().tasks[oldDel!.id]!);
    const removed = await purge(repo);
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(A.useApp.getState().tasks[oldDel!.id]).toBeUndefined();
    expect(A.useApp.getState().tasks[newDel!.id]).toBeDefined();
    expect((await repo.loadAll()).snapshot.tasks.some((t) => t.id === oldDel!.id)).toBe(false);
    expect(await purge(repo)).toBe(0); // at most once a day
  });

  it('Restore setzt den Stand der Sicherung und sichert vorher', async () => {
    await dailyBackup(repo);
    const day = (await repo.listBackups())[0]!.name;
    const t = Object.values(A.useApp.getState().tasks)[0]!;
    A.updateTask(t.id, { title: 'Changed after the backup' });
    const extra = A.addTask({ title: 'Created later' });
    await restoreBackup(repo, day);
    const s = A.useApp.getState();
    expect(s.tasks[t.id]!.title).toBe(t.title);
    expect(s.tasks[extra]!.deletedAt).toBeTruthy();
    expect((await repo.listBackups()).some((b) => b.name.startsWith('before-restore-'))).toBe(true);
  });
});
