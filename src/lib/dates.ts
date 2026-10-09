import { addDays as dfAddDays, differenceInCalendarDays, format, isSameYear, nextMonday as dfNextMonday, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { ISODate, ISODateTime } from '../data/types';

// Fälligkeiten sind Kalendertage (lokal), keine Zeitstempel.

export const toIsoDate = (d: Date): ISODate => format(d, 'yyyy-MM-dd');
export const fromIsoDate = (s: ISODate): Date => parseISO(s);
export const today = (): ISODate => toIsoDate(new Date());
export const addDays = (iso: ISODate, n: number): ISODate => toIsoDate(dfAddDays(fromIsoDate(iso), n));
/** a − b in Kalendertagen */
export const diffDays = (a: ISODate, b: ISODate): number => differenceInCalendarDays(fromIsoDate(a), fromIsoDate(b));
export const nextMonday = (): ISODate => toIsoDate(dfNextMonday(new Date()));

/** „2. Okt.“ bzw. „2. Okt. 2027“ außerhalb des aktuellen Jahres */
export function fmtDate(iso: ISODate): string {
  const d = fromIsoDate(iso);
  return format(d, isSameYear(d, new Date()) ? 'd. MMM' : 'd. MMM yyyy', { locale: de });
}

/** Relative Anzeige für Fälligkeiten: Heute, Morgen, Gestern, Wochentag (nächste 6 Tage), sonst Datum */
export function fmtDue(iso: ISODate | null, time?: string | null): string {
  if (!iso) return '';
  const dd = diffDays(iso, today());
  let s: string;
  if (dd === 0) s = 'Heute';
  else if (dd === 1) s = 'Morgen';
  else if (dd === -1) s = 'Gestern';
  else if (dd > 1 && dd < 7) s = format(fromIsoDate(iso), 'EEEEEE.', { locale: de });
  else s = fmtDate(iso);
  return time ? `${s}, ${time}` : s;
}

export function fmtMonth(d: Date): string {
  return format(d, 'LLLL yyyy', { locale: de });
}

/** Zeitpunkt in Feeds: „gerade eben“, „vor 5 Min.“, „heute, 14:03“, „2. Okt., 14:03“ */
export function fmtTimestamp(at: ISODateTime): string {
  const d = new Date(at);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hm = format(d, 'HH:mm');
  if (toIsoDate(d) === today()) return `heute, ${hm}`;
  return `${fmtDate(toIsoDate(d))}, ${hm}`;
}

const WEEKDAYS = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];

/**
 * Freitext → Datum. Versteht: heute, morgen, übermorgen, nächste woche, Wochentage (mo, montag …),
 * +3 (in 3 Tagen), 12.10., 12.10.26, 12.10.2026, 2026-10-12. Gibt null zurück, wenn nichts passt.
 */
export function parseDateInput(input: string, base: ISODate = today()): ISODate | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  if (s === 'heute' || s === 'h') return base;
  if (s === 'morgen' || s === 'm') return addDays(base, 1);
  if (s === 'übermorgen' || s === 'uebermorgen') return addDays(base, 2);
  if (s === 'nächste woche' || s === 'naechste woche' || s === 'nw') {
    const d = fromIsoDate(base).getDay();
    return addDays(base, ((8 - d) % 7) || 7);
  }
  let m = /^\+(\d{1,3})$/.exec(s);
  if (m) return addDays(base, Number(m[1]));
  const wd = WEEKDAYS.findIndex((w) => s.startsWith(w) && s.length >= 2);
  if (wd >= 0 && /^[a-zäöü]+\.?$/.test(s)) {
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
    // ohne Jahr: nächstes Vorkommen ab heute
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
