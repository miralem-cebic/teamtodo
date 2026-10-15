import { describe, expect, it } from 'vitest';
import { FsRepository } from '../../src/data/fs/FsRepository';
import { MemDir } from '../../src/data/fs/memoryFs';
import { sampleSnapshot } from '../../src/data/seed';
import { SCHEMA_VERSION } from '../../src/data/schema';
import { must } from '../../src/data/result';

describe('FsRepository', () => {
  it('creates the structure and reads it back completely', async () => {
    const root = new MemDir('teamtodo');
    const repo = new FsRepository(root.asHandle());
    expect(await repo.isEmpty()).toBe(true);
    const snap = sampleSnapshot('teamtodo');
    must(await repo.initialize(snap));

    expect(await repo.hasWorkspace()).toBe(true);
    expect([...root.children.keys()].sort()).toEqual(['attachments', 'backups', 'projects.json', 'tasks', 'users.json', 'workspace.json']);
    const res = must(await repo.loadAll());
    expect(res.issues).toEqual([]);
    expect(res.snapshot.tasks).toHaveLength(snap.tasks.length);
    expect(res.snapshot.users.map((u) => u.name)).toContain('Pia');
    expect(res.snapshot.projects[0]!.sections.length).toBeGreaterThan(0);
    for (const t of res.snapshot.tasks) expect(t.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('detects OneDrive conflict copies and ignores helper files', async () => {
    const root = new MemDir('teamtodo');
    const repo = new FsRepository(root.asHandle());
    const snap = sampleSnapshot('teamtodo');
    must(await repo.initialize(snap));
    const tasks = await root.getDirectoryHandle('tasks');
    const t = snap.tasks[0]!;
    const copy = await tasks.getFileHandle(`${t.id}-LAPTOP-123.json`, { create: true });
    const w = await copy.createWritable();
    await w.write(JSON.stringify(t));
    await w.close();
    await tasks.getFileHandle(`${t.id}.json.crswap`, { create: true });
    await root.getFileHandle('users-MacBook.json', { create: true });

    const res = must(await repo.loadAll());
    expect(res.snapshot.tasks).toHaveLength(snap.tasks.length);
    expect(res.conflictCopies.sort()).toEqual([`tasks/${t.id}-LAPTOP-123.json`, 'users-MacBook.json'].sort());
  });

  it('detects conflict copies that other sync tools name with a space and a suffix', async () => {
    const root = new MemDir('teamtodo');
    const repo = new FsRepository(root.asHandle());
    const snap = sampleSnapshot('teamtodo');
    must(await repo.initialize(snap));
    const tasks = await root.getDirectoryHandle('tasks');
    const t = snap.tasks[0]!;
    await root.getFileHandle('users (conflicted copy 2026-10-15 0930).json', { create: true });
    await root.getFileHandle('projects (Conflicted copy 2026-10-15 093012 Name).json', { create: true });
    await tasks.getFileHandle(`${t.id} (conflicted copy 2026-10-15 0930).json`, { create: true });

    const res = must(await repo.loadAll());
    expect(res.snapshot.tasks).toHaveLength(snap.tasks.length);
    expect(res.conflictCopies.sort()).toEqual(
      [
        'users (conflicted copy 2026-10-15 0930).json',
        'projects (Conflicted copy 2026-10-15 093012 Name).json',
        `tasks/${t.id} (conflicted copy 2026-10-15 0930).json`,
      ].sort(),
    );
  });

  it('reports files from a newer schema version', async () => {
    const root = new MemDir('T');
    const repo = new FsRepository(root.asHandle());
    const snap = sampleSnapshot('T');
    must(await repo.initialize(snap));
    const t = snap.tasks[0]!;
    must(await repo.saveTask({ ...t, schemaVersion: 99 } as typeof t));
    // saveTask writes the current version – overwrite directly
    const fh = await (await root.getDirectoryHandle('tasks')).getFileHandle(`${t.id}.json`);
    const w = await fh.createWritable();
    await w.write(JSON.stringify({ ...t, schemaVersion: 99 }));
    await w.close();
    const res = must(await repo.loadAll());
    expect(res.newerSchema).toBe(true);
    expect(res.issues).toHaveLength(1);
  });

  it('writes drafts without the draft flag', async () => {
    const root = new MemDir('T');
    const repo = new FsRepository(root.asHandle());
    const snap = sampleSnapshot('T');
    must(await repo.initialize(snap));
    must(await repo.saveTask({ ...snap.tasks[0]!, draft: true } as never));
    const f = await (await (await root.getDirectoryHandle('tasks')).getFileHandle(`${snap.tasks[0]!.id}.json`)).getFile();
    expect(JSON.parse(await f.text())).not.toHaveProperty('draft');
  });
});
