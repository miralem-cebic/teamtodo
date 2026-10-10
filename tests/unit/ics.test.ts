import { describe, expect, it } from 'vitest';
import { buildIcs, escapeIcsText, foldIcsLine, icsFileName, utcStamp } from '../../src/lib/ics';
import type { Task } from '../../src/data/types';

const now = new Date('2026-10-01T08:00:00Z');
const task = (over: Partial<Task> = {}): Task =>
  ({
    id: 't1',
    title: 'Angebot prüfen',
    projectId: 'p1',
    assigneeId: 'u1',
    dueDate: '2026-10-12',
    dueTime: null,
    completedAt: null,
    ...over,
  }) as Task;
const opts = { now, projectName: () => 'Website', userName: () => 'Anna', untitled: 'Untitled' };
const unfold = (s: string) => s.replace(/\r\n /g, '');

describe('escapeIcsText', () => {
  it('escapes separators and line breaks', () => {
    expect(escapeIcsText('a, b; c\\d\nzeile')).toBe('a\\, b\\; c\\\\d\\nzeile');
  });
});

describe('foldIcsLine', () => {
  it('folds lines longer than 75 octets and keeps characters whole', () => {
    const line = 'SUMMARY:' + 'ä'.repeat(60);
    const folded = foldIcsLine(line);
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(unfold(folded)).toBe(line);
  });

  it('leaves short lines alone', () => {
    expect(foldIcsLine('UID:abc')).toBe('UID:abc');
  });
});

describe('buildIcs', () => {
  it('writes a valid calendar wrapper with CRLF line endings', () => {
    const { content } = buildIcs([task()], opts);
    expect(content.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(content.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(content).toContain('METHOD:PUBLISH');
    expect(content.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('writes tasks without a time as all-day events with an exclusive end date', () => {
    const { content, exported } = buildIcs([task()], opts);
    expect(exported).toBe(1);
    expect(content).toContain('DTSTART;VALUE=DATE:20261012');
    expect(content).toContain('DTEND;VALUE=DATE:20261013');
  });

  it('writes tasks with a time in UTC, 30 minutes long', () => {
    const { content } = buildIcs([task({ dueTime: '14:30' })], opts);
    const start = new Date('2026-10-12T14:30');
    expect(content).toContain(`DTSTART:${utcStamp(start)}`);
    expect(content).toContain(`DTEND:${utcStamp(new Date(start.getTime() + 30 * 60_000))}`);
    expect(content).toMatch(/DTSTART:\d{8}T\d{6}Z/);
  });

  it('uses a stable UID so that a new export updates the same event', () => {
    const a = buildIcs([task()], opts).content;
    const b = buildIcs([task({ title: 'Anders' })], opts).content;
    expect(a).toContain('UID:t1@teamtodo');
    expect(b).toContain('UID:t1@teamtodo');
  });

  it('puts the project and the assignee in the description and escapes them', () => {
    const { content } = buildIcs([task({ title: 'A, B; C' })], { ...opts, projectName: () => 'Web, Shop', userName: () => 'Anna' });
    expect(unfold(content)).toContain('SUMMARY:A\\, B\\; C');
    expect(unfold(content)).toContain('DESCRIPTION:Web\\, Shop\\nAnna');
  });

  it('skips tasks without a due date and counts them', () => {
    const res = buildIcs([task(), task({ id: 't2', dueDate: null })], opts);
    expect(res.exported).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.content.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it('uses the untitled fallback for an empty title', () => {
    expect(unfold(buildIcs([task({ title: '  ' })], opts).content)).toContain('SUMMARY:Untitled');
  });
});

describe('icsFileName', () => {
  it('makes a safe file name', () => {
    expect(icsFileName('Meine Aufgaben')).toBe('teamtodo-Meine-Aufgaben.ics');
    expect(icsFileName('a/b:c*?')).toBe('teamtodo-a-b-c.ics');
    expect(icsFileName('   ')).toBe('teamtodo-tasks.ics');
  });
});
