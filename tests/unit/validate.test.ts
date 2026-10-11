import { describe, expect, it } from 'vitest';
import { FsRepository } from '../../src/data/fs/FsRepository';
import { MemDir } from '../../src/data/fs/memoryFs';
import { writeJson } from '../../src/data/fs/jsonFile';
import { migrate, migrateCollection } from '../../src/data/migrations';
import { SCHEMA_VERSION, makeTask } from '../../src/data/schema';
import { sampleSnapshot } from '../../src/data/seed';
import type { Project, Task, User } from '../../src/data/types';
import { isValidId } from '../../src/data/validate';
import { must } from '../../src/data/result';

const T0 = '2026-10-01T10:00:00.000Z';
const UUID = '7f3c2a10-0b1e-4c8a-9d2f-1a2b3c4d5e6f';

/** A valid task as it is stored in a file */
const goodTask = (): Record<string, unknown> => ({
  schemaVersion: SCHEMA_VERSION,
  id: UUID,
  parentId: null,
  projectId: null,
  sectionId: null,
  title: 'Angebot schreiben',
  description: '',
  assigneeId: null,
  dueDate: '2026-10-20',
  dueTime: '09:30',
  status: 'todo',
  completedAt: null,
  order: 1,
  followerIds: [],
  attachments: [],
  comments: [],
  activity: [],
  createdAt: T0,
  createdBy: 'user-1',
  deletedAt: null,
  fieldUpdatedAt: { title: T0 },
});

const goodUser = (over: Record<string, unknown> = {}) => ({ id: 'user-1', name: 'Pia', color: 'teal', createdAt: T0, updatedAt: T0, deletedAt: null, ...over });
const goodProject = (over: Record<string, unknown> = {}) => ({ id: 'proj-1', name: 'Launch', color: 'blue', order: 1, sections: [], createdAt: T0, updatedAt: T0, ...over });

describe('task files reject wrong types instead of passing them on', () => {
  it('accepts a valid task', () => {
    expect(migrate<Task>('task', goodTask()).title).toBe('Angebot schreiben');
  });

  it.each<[string, Record<string, unknown>]>([
    ['order as text', { order: 'x' }],
    ['comments as a number', { comments: 5 }],
    ['followerIds as null', { followerIds: null }],
    ['unknown status', { status: 'someday' }],
    ['title as number', { title: 42 }],
    ['invalid due date', { dueDate: '20.10.2026' }],
    ['invalid timestamp', { createdAt: 'yesterday' }],
    ['attachment without name', { attachments: [{ id: 'a1', size: 1, mimeType: 'text/plain', addedAt: T0, addedBy: 'user-1' }] }],
    ['activity with unknown type', { activity: [{ id: 'a1', userId: 'user-1', type: 'exploded', at: T0 }] }],
    ['timestamp in fieldUpdatedAt', { fieldUpdatedAt: { title: 12345 } }],
    ['reference to an invalid ID', { projectId: '' }],
    ['task that is not an object', { id: UUID, title: undefined, comments: 'none' }],
  ])('rejects %s', (_label, change) => {
    expect(() => migrate<Task>('task', { ...goodTask(), ...change })).toThrow();
  });

  it('keeps unknown fields from newer versions', () => {
    const t = migrate<Task & { futureField?: string }>('task', { ...goodTask(), futureField: 'kept' });
    expect(t.futureField).toBe('kept');
  });

  it('keeps the rest of the fields when a value is missing and can be filled in', () => {
    const { status: _status, comments: _comments, ...rest } = goodTask();
    const t = migrate<Task>('task', rest);
    expect(t.status).toBe('todo');
    expect(t.comments).toEqual([]);
  });
});

describe('collection files quarantine single broken records', () => {
  it('returns the valid users and reports the broken one', () => {
    const res = migrateCollection('users', { schemaVersion: SCHEMA_VERSION, users: [goodUser(), goodUser({ id: 'user-2', color: 'pink' })] });
    expect((res.items as User[]).map((u) => u.id)).toEqual(['user-1']);
    expect(res.rejected).toHaveLength(1);
    expect(res.rejected[0]!.path).toBe('users[1]');
  });

  it('a broken project does not hide the valid ones', () => {
    const res = migrateCollection('projects', {
      schemaVersion: SCHEMA_VERSION,
      projects: [goodProject(), goodProject({ id: 'proj-2', sections: [{ id: 's1', name: 'x', order: 'first', updatedAt: T0 }] })],
    });
    expect((res.items as Project[]).map((p) => p.id)).toEqual(['proj-1']);
    expect(res.rejected.map((r) => r.path)).toEqual(['projects[1]']);
  });

  it('strict migration of a collection rejects the whole file', () => {
    expect(() => migrate('users', { schemaVersion: SCHEMA_VERSION, users: [goodUser(), { id: 'bad' }] })).toThrow(/users\[1\]/);
  });

  it('rejects a collection that is not a list', () => {
    expect(() => migrateCollection('users', { schemaVersion: SCHEMA_VERSION, users: 'Pia' })).toThrow();
  });
});

describe('IDs from file content', () => {
  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', '', 'a b', 'a/b', '../x'])('refuses the ID %j', (id) => {
    expect(isValidId(id)).toBe(false);
  });

  it('accepts UUIDs and the short IDs used in tests', () => {
    expect(isValidId(UUID)).toBe(true);
    expect(isValidId('user-1')).toBe(true);
  });

  it.each(['__proto__', 'constructor'])('refuses %s as a user, project, section and task ID', (id) => {
    expect(() => migrate('users', { schemaVersion: SCHEMA_VERSION, users: [goodUser({ id })] })).toThrow();
    expect(() => migrate('projects', { schemaVersion: SCHEMA_VERSION, projects: [goodProject({ id })] })).toThrow();
    expect(() => migrate('projects', { schemaVersion: SCHEMA_VERSION, projects: [goodProject({ sections: [{ id, name: 'x', order: 1, updatedAt: T0 }] })] })).toThrow();
    expect(() => migrate<Task>('task', { ...goodTask(), id })).toThrow();
  });

  it('a task with a prototype name as ID never reaches the loaded state', async () => {
    const root = new MemDir('teamtodo');
    const repo = new FsRepository(root.asHandle());
    must(await repo.initialize(sampleSnapshot('teamtodo')));
    const tasks = await root.getDirectoryHandle('tasks');
    await writeJson(tasks as unknown as FileSystemDirectoryHandle, `${UUID}.json`, { ...goodTask(), id: '__proto__' });
    const res = await repo.loadAll();
    expect(res.snapshot.tasks.some((t) => t.id === '__proto__')).toBe(false);
    expect(res.issues.some((i) => i.file.includes(UUID))).toBe(true);
  });

  it('reports a broken user in the folder and keeps loading the rest', async () => {
    const root = new MemDir('teamtodo');
    const repo = new FsRepository(root.asHandle());
    const snap = sampleSnapshot('teamtodo');
    must(await repo.initialize(snap));
    await writeJson(root.asHandle() as unknown as FileSystemDirectoryHandle, 'users.json', {
      schemaVersion: SCHEMA_VERSION,
      users: [...snap.users, { id: 'broken', name: 42 }],
    });
    const res = await repo.loadAll();
    expect(res.snapshot.users).toHaveLength(snap.users.length);
    expect(res.snapshot.tasks).toHaveLength(snap.tasks.length);
    expect(res.issues).toEqual([expect.objectContaining({ file: 'users.json › users[' + snap.users.length + ']' })]);
  });
});

describe('the sample data itself is valid', () => {
  it('passes the strict checks', () => {
    const snap = sampleSnapshot('teamtodo');
    for (const t of snap.tasks) expect(() => migrate<Task>('task', t)).not.toThrow();
    expect(makeTask({ createdBy: 'user-1' }).id).toBeTruthy();
  });
});
