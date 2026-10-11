import { describe, expect, it } from 'vitest';
import { projectStatus } from '../../src/store/selectors';
import { makeProject } from '../../src/data/schema';

const AT = '2026-01-02T00:00:00.000Z';
const base = () => makeProject('P', 'blue', 0);

describe('projectStatus', () => {
  it('a new project is active', () => {
    expect(projectStatus(base())).toBe('active');
  });

  it('archived and template are told apart by their fields', () => {
    expect(projectStatus({ ...base(), state: { kind: 'archived', at: AT } })).toBe('archived');
    expect(projectStatus({ ...base(), template: true })).toBe('template');
  });

  it('deleted wins over template and archived', () => {
    expect(projectStatus({ ...base(), state: { kind: 'deleted', at: AT }, template: true })).toBe('deleted');
  });

  it('template wins over archived', () => {
    expect(projectStatus({ ...base(), state: { kind: 'archived', at: AT }, template: true })).toBe('template');
  });
});
