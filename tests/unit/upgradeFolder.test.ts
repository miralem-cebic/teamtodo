import { describe, expect, it } from 'vitest';
import { FsRepository } from '../../src/data/fs/FsRepository';
import { MemDir } from '../../src/data/fs/memoryFs';
import { writeJson } from '../../src/data/fs/jsonFile';
import { must } from '../../src/data/result';
import { makeTask, makeWorkspace } from '../../src/data/schema';
import { brandId } from '../../src/data/ids';
import type { Project } from '../../src/data/types';

// A folder written by the version 1 app: its projects have archivedAt and deletedAt. The version 2 app must read it
// correctly and write it back in version 2.

const T0 = '2026-01-01T00:00:00.000Z';
const v1Project = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  color: 'teal',
  order: 0,
  sections: [{ id: `${id}-s`, name: 'Tasks', order: 0, updatedAt: T0, deletedAt: null }],
  createdAt: T0,
  updatedAt: T0,
  archivedAt: null,
  deletedAt: null,
  ...over,
});

describe('a folder from version 1', () => {
  it('loads with the project states it had, and is written back as version 2', async () => {
    const root = new MemDir('teamtodo');
    const user = { id: 'u-ann', name: 'Ann', color: 'teal', createdAt: T0, updatedAt: T0, deletedAt: null };
    const task = { ...makeTask({ createdBy: brandId<'UserId'>('u-ann'), title: 'Old task', projectId: brandId<'ProjectId'>('p-open') }), schemaVersion: 1 };
    const ws = { ...makeWorkspace('Team'), schemaVersion: 1 };
    await writeJson(root.asHandle() as unknown as FileSystemDirectoryHandle, 'workspace.json', ws);
    await writeJson(root.asHandle() as unknown as FileSystemDirectoryHandle, 'users.json', { schemaVersion: 1, users: [user] });
    await writeJson(root.asHandle() as unknown as FileSystemDirectoryHandle, 'projects.json', {
      schemaVersion: 1,
      projects: [
        v1Project('p-open'),
        v1Project('p-archived', { archivedAt: '2026-02-01T00:00:00.000Z' }),
        v1Project('p-deleted', { archivedAt: '2026-02-01T00:00:00.000Z', deletedAt: '2026-03-01T00:00:00.000Z' }),
      ],
    });
    const tasks = await root.getDirectoryHandle('tasks', { create: true });
    await writeJson(tasks as unknown as FileSystemDirectoryHandle, `${task.id}.json`, task);

    const repo = new FsRepository(root.asHandle());
    const res = must(await repo.loadAll());
    expect(res.issues).toEqual([]);
    expect(res.newerSchema).toBe(false);
    expect(res.snapshot.tasks.map((t) => t.title)).toEqual(['Old task']);
    const state = (id: string) => res.snapshot.projects.find((p) => p.id === id)?.state;
    expect(state('p-open')).toEqual({ kind: 'active' });
    expect(state('p-archived')).toEqual({ kind: 'archived', at: '2026-02-01T00:00:00.000Z' });
    expect(state('p-deleted')).toEqual({ kind: 'deleted', at: '2026-03-01T00:00:00.000Z' });

    // the next save of the projects rewrites the file in version 2, without the old fields
    must(await repo.saveProjects(res.snapshot.projects as Project[]));
    const file = JSON.parse(await (await (await root.getFileHandle('projects.json')).getFile()).text()) as { schemaVersion: number; projects: Record<string, unknown>[] };
    expect(file.schemaVersion).toBe(2);
    const saved = file.projects.find((p) => p['id'] === 'p-archived');
    expect(saved?.['state']).toEqual({ kind: 'archived', at: '2026-02-01T00:00:00.000Z' });
    expect(saved).not.toHaveProperty('archivedAt');
  });
});
