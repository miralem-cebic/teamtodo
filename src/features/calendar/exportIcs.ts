import { showToast, useApp } from '../../store/appStore';
import type { Task } from '../../data/types';
import { buildIcs, downloadIcs, icsFileName } from '../../lib/ics';
import { t } from '../../i18n';

/** Downloads the tasks as a calendar file and reports the result in a toast */
export function exportIcs(tasks: Task[], name: string): void {
  const { projects, users } = useApp.getState();
  const res = buildIcs(tasks, {
    now: new Date(),
    untitled: t('task.untitled'),
    projectName: (id) => projects.find((p) => p.id === id)?.name ?? null,
    userName: (id) => users.find((u) => u.id === id)?.name ?? null,
  });
  if (!res.exported) {
    showToast(t('ics.noDates'));
    return;
  }
  downloadIcs(icsFileName(name), res.content);
  showToast(res.skipped ? t('ics.exportedSkipped', { n: res.exported, skipped: res.skipped }) : t('ics.exported', { n: res.exported }));
}
