import { describe, expect, it } from 'vitest';
import { parseFiles, parseOne } from '../../src/data/parse/parseClient';
import { parseFile, parseFailure } from '../../src/data/parse/parseFile';
import { newestSeenIso } from '../../src/data/clock';
import { brandId } from '../../src/data/ids';
import { makeTask, SCHEMA_VERSION } from '../../src/data/schema';

const user = brandId<'UserId'>('u-ann');
const taskText = (over: Record<string, unknown> = {}) => JSON.stringify({ ...makeTask({ createdBy: user, title: 'Milk' }), ...over });

describe('parseFile (what the parse worker runs)', () => {
  it('accepts a valid task', () => {
    const r = parseFile('task', taskText());
    expect(r.ok && (r.value as { title: string }).title).toBe('Milk');
  });

  it('reports broken JSON as invalid, with the parser message', () => {
    const r = parseFile('task', '{ "id": ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('invalid');
  });

  it('names the broken field in the message of a rejected task', () => {
    const r = parseFile('task', taskText({ status: 'paused' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('unknown value');
  });

  it('reports a file from a newer app with its version', () => {
    const r = parseFile('task', taskText({ schemaVersion: SCHEMA_VERSION + 5 }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.error === 'newer') {
      expect(r.version).toBe(SCHEMA_VERSION + 5);
      expect(parseFailure('task', r).name).toBe('NewerSchemaError');
    } else throw new Error('expected a newer-schema failure');
  });

  it('keeps the valid users of a file with one broken user', () => {
    const good = { id: 'u-ann', name: 'Ann', color: 'blue', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    const text = JSON.stringify({ schemaVersion: SCHEMA_VERSION, users: [good, { id: 'u-bad' }] });
    const r = parseFile('users', text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect((r.value as { name: string }[]).map((u) => u.name)).toEqual(['Ann']);
      expect(r.rejected).toHaveLength(1);
    }
  });

  it('observes the timestamps it reads, so the main thread clock can follow', () => {
    parseFile('task', taskText({ createdAt: '2099-03-04T05:06:07.000Z' }));
    expect(newestSeenIso()?.startsWith('2099-03-04T05:06:07')).toBe(true);
  });
});

describe('parseFiles (main-thread fallback when no worker runs)', () => {
  it('returns the results in the order of the items', async () => {
    const results = await parseFiles([
      { kind: 'task', text: taskText({ title: 'first' }) },
      { kind: 'task', text: '[]' },
      { kind: 'task', text: taskText({ title: 'third' }) },
    ]);
    expect(results.map((r) => (r.ok ? (r.value as { title: string }).title : r.error))).toEqual(['first', 'invalid', 'third']);
  });

  it('parseOne gives the same result as parseFile', async () => {
    const text = taskText();
    expect(await parseOne('task', text)).toEqual(parseFile('task', text));
  });

  it('an empty batch needs no parse at all', async () => {
    expect(await parseFiles([])).toEqual([]);
  });
});
