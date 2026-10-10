import type { ISODate, Task } from '../data/types';
import { addDays } from './dates';

// iCalendar (RFC 5545) export. Each task with a due date becomes one VEVENT.
// Timed events are written in UTC (…Z) so every calendar app shows the same moment.
// Tasks have no end time, so timed events get a fixed length.

export const ICS_EVENT_MINUTES = 30;

const CRLF = '\r\n';
const pad = (n: number) => String(n).padStart(2, '0');

/** RFC 5545 §3.3.11: escape backslash, semicolon, comma and line breaks */
export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** RFC 5545 §3.1: at most 75 octets per line; continuation lines start with a space. Never splits a UTF-8 character. */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
      limit = 74; // the leading space of a continuation line counts as one octet
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join(CRLF + ' ');
}

/** 20261012T143000Z */
export function utcStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** 2026-10-12 → 20261012 */
export const dateValue = (iso: ISODate): string => iso.replace(/-/g, '');

export interface IcsOptions {
  now?: Date;
  /** Shown in DESCRIPTION, e.g. the project name */
  projectName?: (id: string) => string | null;
  /** Shown in DESCRIPTION, e.g. the assignee */
  userName?: (id: string) => string | null;
  /** SUMMARY for tasks without a title */
  untitled?: string;
}

export interface IcsResult {
  content: string;
  /** Events written */
  exported: number;
  /** Tasks without a due date, which cannot be placed in a calendar */
  skipped: number;
}

function eventLines(task: Task, opts: IcsOptions, stamp: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${task.id}@teamtodo`, `DTSTAMP:${stamp}`];
  if (task.dueTime) {
    const start = new Date(`${task.dueDate}T${task.dueTime}`);
    const end = new Date(start.getTime() + ICS_EVENT_MINUTES * 60_000);
    lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
  } else {
    // all-day: the end date is exclusive
    lines.push(`DTSTART;VALUE=DATE:${dateValue(task.dueDate!)}`, `DTEND;VALUE=DATE:${dateValue(addDays(task.dueDate!, 1))}`);
  }
  lines.push(`SUMMARY:${escapeIcsText(task.title.trim() || opts.untitled || 'Task')}`);
  const details = [
    task.projectId ? opts.projectName?.(task.projectId) : null,
    task.assigneeId ? opts.userName?.(task.assigneeId) : null,
  ].filter((x): x is string => !!x);
  if (details.length) lines.push(`DESCRIPTION:${escapeIcsText(details.join('\n'))}`);
  lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  return lines;
}

/** Builds one calendar file. Tasks without a due date are skipped. Passing tasks again later with the same ids updates the events in the calendar app. */
export function buildIcs(tasks: Task[], opts: IcsOptions = {}): IcsResult {
  const stamp = utcStamp(opts.now ?? new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//teamtodo//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  let exported = 0;
  let skipped = 0;
  for (const task of tasks) {
    if (!task.dueDate) {
      skipped++;
      continue;
    }
    lines.push(...eventLines(task, opts, stamp));
    exported++;
  }
  lines.push('END:VCALENDAR');
  return { content: lines.map(foldIcsLine).join(CRLF) + CRLF, exported, skipped };
}

/** teamtodo-Weekly-review.ics; characters that are invalid in file names are replaced */
export function icsFileName(name: string): string {
  const slug = name
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `teamtodo-${slug || 'tasks'}.ics`;
}

/** Saves the file through a temporary link, the same way attachments are downloaded */
export function downloadIcs(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
