import { describe, expect, it } from 'vitest';
import { fmtDue, parseDateInput } from '../../src/lib/dates';

const base = '2026-10-02'; // Freitag

describe('parseDateInput', () => {
  it.each([
    ['heute', '2026-10-02'],
    ['morgen', '2026-10-03'],
    ['übermorgen', '2026-10-04'],
    ['nächste woche', '2026-10-05'],
    ['mo', '2026-10-05'],
    ['Freitag', '2026-10-09'],
    ['+3', '2026-10-05'],
    ['12.10.', '2026-10-12'],
    ['1.1', '2027-01-01'],
    ['12.10.27', '2027-10-12'],
    ['2026-12-24', '2026-12-24'],
  ])('%s → %s', (input, out) => expect(parseDateInput(input, base)).toBe(out));

  it('lehnt Ungültiges ab', () => {
    expect(parseDateInput('31.2.', base)).toBeNull();
    expect(parseDateInput('irgendwann', base)).toBeNull();
    expect(parseDateInput('', base)).toBeNull();
  });
});

describe('fmtDue', () => {
  it('relativ', () => {
    expect(fmtDue(null)).toBe('');
    const t = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(fmtDue(iso(t))).toBe('Heute');
    expect(fmtDue(iso(t), '09:30')).toBe('Heute, 09:30');
  });
});
