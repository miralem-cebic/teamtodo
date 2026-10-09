import { STATUS_LABEL, type Activity, type TaskStatus, type User } from '../data/types';
import { fmtDate } from './dates';

/** Satz zur Aktivität (ohne Namen der handelnden Person) */
export function activityText(a: Activity, users: User[]): string {
  const d = a.data ?? {};
  const name = (id?: string | null, fallback?: string | null) => users.find((u) => u.id === id)?.name ?? fallback ?? 'jemanden';
  switch (a.type) {
    case 'created':
      return 'hat die Aufgabe erstellt';
    case 'assigned':
      return `hat ${name(d.userId, d.name)} zugewiesen`;
    case 'unassigned':
      return 'hat die Zuweisung entfernt';
    case 'due':
      return d.date ? `hat das Fälligkeitsdatum auf ${fmtDate(d.date)} gesetzt` : 'hat das Fälligkeitsdatum geändert';
    case 'dueRemoved':
      return 'hat das Fälligkeitsdatum entfernt';
    case 'status':
      return `hat den Status auf „${STATUS_LABEL[d.status as TaskStatus] ?? d.status}“ gesetzt`;
    case 'completed':
      return 'hat die Aufgabe erledigt';
    case 'reopened':
      return 'hat die Aufgabe wieder geöffnet';
    case 'section':
      return `hat die Aufgabe nach „${d.name ?? '?'}“ verschoben`;
    case 'project':
      return `hat die Aufgabe zu „${d.name ?? '?'}“ hinzugefügt`;
    case 'projectRemoved':
      return 'hat die Aufgabe aus dem Projekt entfernt';
    case 'renamed':
      return 'hat die Aufgabe umbenannt';
    case 'deleted':
      return 'hat die Aufgabe gelöscht';
    case 'restored':
      return 'hat die Aufgabe wiederhergestellt';
    case 'attachment':
      return `hat „${d.name ?? 'eine Datei'}“ angehängt`;
  }
}
