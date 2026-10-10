import { addDays as dfAddDays, differenceInCalendarDays, format, isSameYear, nextMonday as dfNextMonday, parseISO } from 'date-fns';
import type { ISODate, ISODateTime } from '../data/types';

// Due dates are calendar days (local time), not timestamps.

export const toIsoDate = (d: Date): ISODate => format(d, 'yyyy-MM-dd');
export const fromIsoDate = (s: ISODate): Date => parseISO(s);
export const today = (): ISODate => toIsoDate(new Date());
export const addDays = (iso: ISODate, n: number): ISODate => toIsoDate(dfAddDays(fromIsoDate(iso), n));
/** a − b in calendar days */
export const diffDays = (a: ISODate, b: ISODate): number => differenceInCalendarDays(fromIsoDate(a), fromIsoDate(b));
export const nextMonday = (): ISODate => toIsoDate(dfNextMonday(new Date()));

/** "Oct 2" or "Oct 2, 2027" outside the current year */
export function fmtDate(iso: ISODate): string {
  const d = fromIsoDate(iso);
  return format(d, isSameYear(d, new Date()) ? 'MMM d' : 'MMM d, yyyy');
}

/** Relative label for due dates: Today, Tomorrow, Yesterday, weekday (next 6 days), otherwise the date */
export function fmtDue(iso: ISODate | null, time?: string | null): string {
  if (!iso) return '';
  const dd = diffDays(iso, today());
  let s: string;
  if (dd === 0) s = 'Today';
  else if (dd === 1) s = 'Tomorrow';
  else if (dd === -1) s = 'Yesterday';
  else if (dd > 1 && dd < 7) s = format(fromIsoDate(iso), 'EEE');
  else s = fmtDate(iso);
  return time ? `${s}, ${time}` : s;
}

export function fmtMonth(d: Date): string {
  return format(d, 'LLLL yyyy');
}

/** Timestamp in feeds: "just now", "5 min ago", "today, 14:03", "Oct 2, 14:03" */
export function fmtTimestamp(at: ISODateTime): string {
  const d = new Date(at);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hm = format(d, 'HH:mm');
  if (toIsoDate(d) === today()) return `today, ${hm}`;
  return `${fmtDate(toIsoDate(d))}, ${hm}`;
}

/** Weekdays (Sunday first, as in `getDay()`). Each entry lists its accepted names, English and German. */
const WEEKDAYS: string[][] = [
  ['sun', 'sunday', 'so', 'sonntag'],
  ['mon', 'monday', 'mo', 'montag'],
  ['tue', 'tues', 'tuesday', 'di', 'dienstag'],
  ['wed', 'wednesday', 'mi', 'mittwoch'],
  ['thu', 'thur', 'thurs', 'thursday', 'do', 'donnerstag'],
  ['fri', 'friday', 'fr', 'freitag'],
  ['sat', 'saturday', 'sa', 'samstag'],
];

/**
 * Free text → date. Understands: today/heute, tomorrow/morgen, day after tomorrow/übermorgen,
 * next week/nächste woche, weekdays (mon, monday, montag …), +3 (in 3 days), 12.10., 12.10.26, 12.10.2026, 2026-10-12.
 * Returns null if nothing matches.
 */
export function parseDateInput(input: string, base: ISODate = today()): ISODate | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  if (s === 'today' || s === 'heute' || s === 'h') return base;
  if (s === 'tomorrow' || s === 'morgen' || s === 'm') return addDays(base, 1);
  if (s === 'day after tomorrow' || s === 'übermorgen' || s === 'uebermorgen') return addDays(base, 2);
  if (s === 'next week' || s === 'nächste woche' || s === 'naechste woche' || s === 'nw') {
    const d = fromIsoDate(base).getDay();
    return addDays(base, ((8 - d) % 7) || 7);
  }
  let m = /^\+(\d{1,3})$/.exec(s);
  if (m) return addDays(base, Number(m[1]));
  const word = s.replace(/\.$/, '');
  const wd = word.length >= 2 ? WEEKDAYS.findIndex((names) => names.some((n) => n.startsWith(word))) : -1;
  if (wd >= 0 && /^[a-zäöü]+$/.test(word)) {
    const d = fromIsoDate(base).getDay();
    return addDays(base, ((wd - d + 7) % 7) || 7);
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const b = fromIsoDate(base);
    if (m[3]) {
      const y = Number(m[3]);
      return valid(y < 100 ? 2000 + y : y, month, day);
    }
    // without a year: next occurrence from today
    const thisYear = valid(b.getFullYear(), month, day);
    if (thisYear && thisYear >= base) return thisYear;
    return valid(b.getFullYear() + 1, month, day);
  }
  return null;
}

function valid(y: number, m: number, d: number): ISODate | null {
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return toIsoDate(dt);
}
