import { describe, expect, it } from 'vitest';
import { migrate, NewerSchemaError } from '../../src/data/migrations';
import type { Task } from '../../src/data/types';
import { classifyError } from '../../src/data/repository';

describe('migrate', () => {
  it('ergänzt fehlende Felder einer Aufgabe', () => {
    const t = migrate<Task>('task', { id: 'x', title: 'A', createdAt: '2026-01-01T00:00:00Z', createdBy: 'u' });
    expect(t.schemaVersion).toBe(1);
    expect(t.comments).toEqual([]);
    expect(t.fieldUpdatedAt).toEqual({});
    expect(t.status).toBe('todo');
  });
  it('lehnt neuere Versionen ab', () => {
    expect(() => migrate('task', { schemaVersion: 2 })).toThrow(NewerSchemaError);
    try {
      migrate('users', { schemaVersion: 5 });
    } catch (e) {
      expect(classifyError(e)).toBe('newerSchema');
    }
  });
  it('lehnt Unsinn ab', () => {
    expect(() => migrate('task', null)).toThrow();
    expect(() => migrate('task', [])).toThrow();
  });
});
