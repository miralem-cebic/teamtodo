import { describe, expect, it } from 'vitest';
import { migrate, migrateCollection, NewerSchemaError } from '../../src/data/migrations';
import type { Project, Task } from '../../src/data/types';
import { classifyError } from '../../src/data/repository';

describe('migrate', () => {
  it('fills in missing fields of a task', () => {
    const t = migrate<Task>('task', { id: 'x', title: 'A', createdAt: '2026-01-01T00:00:00Z', createdBy: 'u' });
    expect(t.schemaVersion).toBe(2);
    expect(t.comments).toEqual([]);
    expect(t.fieldUpdatedAt).toEqual({});
    expect(t.status).toBe('todo');
  });
  it('rejects newer versions', () => {
    expect(() => migrate('task', { schemaVersion: 3 })).toThrow(NewerSchemaError);
    try {
      migrate('users', { schemaVersion: 5 });
    } catch (e) {
      expect(classifyError(e)).toBe('newerSchema');
    }
  });
  it('rejects nonsense', () => {
    expect(() => migrate('task', null)).toThrow();
    expect(() => migrate('task', [])).toThrow();
  });
});

describe('version 1 → 2: project state', () => {
  const v1 = (projects: unknown[]) => ({ schemaVersion: 1, projects });
  const project = (over: Record<string, unknown> = {}) => ({
    id: 'p1',
    name: 'Launch',
    color: 'teal',
    order: 0,
    sections: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    deletedAt: null,
    ...over,
  });

  it('an active project gets the active state, and the old fields are gone', () => {
    const [p] = migrate<{ projects: Project[] }>('projects', v1([project()])).projects;
    expect(p?.state).toEqual({ kind: 'active' });
    expect(p).not.toHaveProperty('archivedAt');
    expect(p).not.toHaveProperty('deletedAt');
  });

  it('an archived project keeps the time it was archived', () => {
    const [p] = migrate<{ projects: Project[] }>('projects', v1([project({ archivedAt: '2026-02-01T00:00:00.000Z' })])).projects;
    expect(p?.state).toEqual({ kind: 'archived', at: '2026-02-01T00:00:00.000Z' });
  });

  it('a deleted project wins over archived and keeps the time it was deleted', () => {
    const [p] = migrate<{ projects: Project[] }>(
      'projects',
      v1([project({ archivedAt: '2026-02-01T00:00:00.000Z', deletedAt: '2026-03-01T00:00:00.000Z' })]),
    ).projects;
    expect(p?.state).toEqual({ kind: 'deleted', at: '2026-03-01T00:00:00.000Z' });
  });

  it('a broken timestamp is not turned into a state: the record is rejected, the rest of the file is kept', () => {
    const file = migrateCollection('projects', v1([project({ deletedAt: 42 }), project({ id: 'p2' })]));
    expect(file.items.map((p) => p.id)).toEqual(['p2']);
    expect(file.rejected).toHaveLength(1);
  });

  it('the other file types are read at version 1 without changes', () => {
    const user = { id: 'u1', name: 'Pia', color: 'teal', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    expect(migrate<{ users: unknown[] }>('users', { schemaVersion: 1, users: [user] }).users).toHaveLength(1);
    expect(migrate<Task>('task', { id: 'x', title: 'A', createdAt: '2026-01-01T00:00:00Z', createdBy: 'u', schemaVersion: 1 }).title).toBe('A');
  });
});
