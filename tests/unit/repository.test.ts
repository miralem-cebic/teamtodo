import { describe, expect, it } from 'vitest';
import { FsRepository } from '../../src/data/fs/FsRepository';
import { MemDir } from '../../src/data/fs/memoryFs';
import { sampleSnapshot } from '../../src/data/seed';
import { SCHEMA_VERSION } from '../../src/data/schema';

describe('FsRepository', () => {
  it('legt Struktur an und liest sie vollständig zurück', async () => {
    const root = new MemDir('Teamaufgaben');
    const repo = new FsRepository(root.asHandle());
    expect(await repo.isEmpty()).toBe(true);
    const snap = sampleSnapshot('Teamaufgaben');
    await repo.initialize(snap);

    expect(await repo.hasWorkspace()).toBe(true);
    expect([...root.children.keys()].sort()).toEqual(['attachments', 'backups', 'projects.json', 'tasks', 'users.json', 'workspace.json']);
    const res = await repo.loadAll();
    expect(res.issues).toEqual([]);
    expect(res.snapshot.tasks).toHaveLength(snap.tasks.length);
    expect(res.snapshot.users.map((u) => u.name)).toContain('Pia');
    expect(res.snapshot.projects[0]!.sections.length).toBeGreaterThan(0);
    for (const t of res.snapshot.tasks) expect(t.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('erkennt OneDrive-Konfliktkopien und ignoriert Hilfsdateien', async () => {
    const root = new MemDir('Teamaufgaben');
    const repo = new FsRepository(root.asHandle());
    const snap = sampleSnapshot('Teamaufgaben');
    await repo.initialize(snap);
    const tasks = await root.getDirectoryHandle('tasks');
    const t = snap.tasks[0]!;
    const copy = await tasks.getFileHandle(`${t.id}-LAPTOP-123.json`, { create: true });
    const w = await copy.createWritable();
    await w.write(JSON.stringify(t));
    await w.close();
    await tasks.getFileHandle(`${t.id}.json.crswap`, { create: true });
    await root.getFileHandle('users-MacBook.json', { create: true });

    const res = await repo.loadAll();
    expect(res.snapshot.tasks).toHaveLength(snap.tasks.length);
    expect(res.conflictCopies.sort()).toEqual([`tasks/${t.id}-LAPTOP-123.json`, 'users-MacBook.json'].sort());
  });

  it('meldet Dateien aus einer neueren Schema-Version', async () => {
    const root = new MemDir('T');
    const repo = new FsRepository(root.asHandle());
    const snap = sampleSnapshot('T');
    await repo.initialize(snap);
    const t = snap.tasks[0]!;
    await repo.saveTask({ ...t, schemaVersion: 99 } as typeof t);
    // saveTask setzt die aktuelle Version – direkt überschreiben
    const fh = await (await root.getDirectoryHandle('tasks')).getFileHandle(`${t.id}.json`);
    const w = await fh.createWritable();
    await w.write(JSON.stringify({ ...t, schemaVersion: 99 }));
    await w.close();
    const res = await repo.loadAll();
    expect(res.newerSchema).toBe(true);
    expect(res.issues).toHaveLength(1);
  });

  it('schreibt Entwürfe ohne draft-Flag', async () => {
    const root = new MemDir('T');
    const repo = new FsRepository(root.asHandle());
    const snap = sampleSnapshot('T');
    await repo.initialize(snap);
    await repo.saveTask({ ...snap.tasks[0]!, draft: true } as never);
    const f = await (await (await root.getDirectoryHandle('tasks')).getFileHandle(`${snap.tasks[0]!.id}.json`)).getFile();
    expect(JSON.parse(await f.text())).not.toHaveProperty('draft');
  });
});
