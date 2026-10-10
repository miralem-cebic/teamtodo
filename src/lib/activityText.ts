import type { Activity, TaskStatus, User } from '../data/types';
import { t } from '../i18n';
import { statusLabel } from './labels';
import { fmtDate } from './dates';

/** Sentence describing an activity (without the name of the person who did it) */
export function activityText(a: Activity, users: User[]): string {
  const d = a.data ?? {};
  const name = (id?: string | null, fallback?: string | null) => users.find((u) => u.id === id)?.name ?? fallback ?? t('act.someone');
  switch (a.type) {
    case 'created':
      return t('act.created');
    case 'assigned':
      return t('act.assigned', { name: name(d.userId, d.name) });
    case 'unassigned':
      return t('act.unassigned');
    case 'due':
      return d.date ? t('act.due', { date: fmtDate(d.date) }) : t('act.dueChanged');
    case 'dueRemoved':
      return t('act.dueRemoved');
    case 'status':
      return t('act.status', { status: statusLabel(d.status as TaskStatus) });
    case 'completed':
      return t('act.completed');
    case 'reopened':
      return t('act.reopened');
    case 'section':
      return t('act.section', { name: d.name ?? '?' });
    case 'project':
      return t('act.project', { name: d.name ?? '?' });
    case 'projectRemoved':
      return t('act.projectRemoved');
    case 'renamed':
      return t('act.renamed');
    case 'deleted':
      return t('act.deleted');
    case 'restored':
      return t('act.restored');
    case 'attachment':
      return t('act.attachment', { name: d.name ?? t('act.file') });
  }
}
