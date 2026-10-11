import { describe, expect, it } from 'vitest';
import { projectState } from '../../src/store/selectors';
import { makeProject } from '../../src/data/schema';

const base = () => makeProject('P', 'blue', 0);

describe('projectState', () => {
  it('a new project is active', () => {
    expect(projectState(base())).toBe('active');
  });

  it('archived and template are told apart by their fields', () => {
    expect(projectState({ ...base(), archivedAt: '2026-01-02T00:00:00.000Z' })).toBe('archived');
    expect(projectState({ ...base(), template: true })).toBe('template');
  });

  it('deleted wins over template and archived', () => {
    const p = { ...base(), deletedAt: '2026-01-03T00:00:00.000Z', template: true, archivedAt: '2026-01-02T00:00:00.000Z' };
    expect(projectState(p)).toBe('deleted');
    expect(projectState({ ...base(), deletedAt: '2026-01-03T00:00:00.000Z', archivedAt: '2026-01-02T00:00:00.000Z' })).toBe('deleted');
  });

  it('template wins over archived', () => {
    expect(projectState({ ...base(), template: true, archivedAt: '2026-01-02T00:00:00.000Z' })).toBe('template');
  });
});
