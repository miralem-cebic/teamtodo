import { describe, expect, it } from 'vitest';
import { fmtDue, parseDateInput } from '../../src/lib/dates';

const base = '2026-10-02'; // Friday

describe('parseDateInput', () => {
  it.each([
    ['today', '2026-10-02'],
    ['tomorrow', '2026-10-03'],
    ['day after tomorrow', '2026-10-04'],
    ['next week', '2026-10-05'],
    ['mon', '2026-10-05'],
    ['Friday', '2026-10-09'],
    ['+3', '2026-10-05'],
    ['12.10.', '2026-10-12'],
    ['1.1', '2027-01-01'],
    ['12.10.27', '2027-10-12'],
    ['2026-12-24', '2026-12-24'],
  ])('%s → %s', (input, out) => expect(parseDateInput(input, base)).toBe(out));

  it.each([
    ['heute', '2026-10-02'],
    ['morgen', '2026-10-03'],
    ['übermorgen', '2026-10-04'],
    ['nächste woche', '2026-10-05'],
    ['montag', '2026-10-05'],
    ['fr', '2026-10-09'],
  ])('still accepts the German shorthand %s → %s', (input, out) => expect(parseDateInput(input, base)).toBe(out));

  it('rejects invalid input', () => {
    expect(parseDateInput('31.2.', base)).toBeNull();
    expect(parseDateInput('sometime', base)).toBeNull();
    expect(parseDateInput('', base)).toBeNull();
  });
});

describe('fmtDue', () => {
  it('relative', () => {
    expect(fmtDue(null)).toBe('');
    const t = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(fmtDue(iso(t))).toBe('Today');
    expect(fmtDue(iso(t), '09:30')).toBe('Today, 09:30');
  });
});
