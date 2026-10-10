import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { deleteProject, renameProject, useApp } from '../../store/appStore';
import { byOrder } from '../../store/selectors';
import type { ID } from '../../data/types';
import { t } from '../../i18n';
import { NewProjectDialog } from './NewProjectDialog';

/** Templates: saved project blueprints. Rename, delete, or create a project from one. */
export function TemplatesView({ onCreated }: { onCreated: (id: ID) => void }) {
  const projects = useApp((s) => s.projects);
  const tasks = useApp((s) => s.tasks);
  const [dialog, setDialog] = useState<{ templateId?: ID } | null>(null);
  const list = useMemo(() => projects.filter((p) => p.template && !p.deletedAt).sort(byOrder), [projects]);

  return (
    <div className="inbox tpl-view">
      <div className="inbox-tools">
        <p className="d-text tpl-intro">{t('templates.intro')}</p>
        <span className="sp" />
        <button type="button" className="tb" onClick={() => setDialog({})}>
          <Icon n="plus" s={15} />
          <span>{t('project.new')}</span>
        </button>
      </div>
      {!list.length && (
        <div className="empty-state">
          <p>{t('templates.empty')}</p>
        </div>
      )}
      <ul className="tpl-list" aria-label={t('nav.templates')}>
        {list.map((p) => {
          const sections = p.sections.filter((s) => !s.deletedAt).length;
          const count = Object.values(tasks).filter((x) => x.projectId === p.id && !x.deletedAt && !x.draft).length;
          return (
            <li key={p.id} className="tpl-row">
              <span className={'sq c-' + p.color} />
              <input
                key={p.name}
                className="tpl-name"
                defaultValue={p.name}
                aria-label={t('templates.name')}
                onBlur={(e) => {
                  const v = e.currentTarget.value.trim();
                  if (v && v !== p.name) renameProject(p.id, v);
                  else e.currentTarget.value = p.name;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    e.currentTarget.value = p.name;
                    e.currentTarget.blur();
                  }
                }}
              />
              <span className="tpl-meta">{t('templates.stats', { sections, tasks: count })}</span>
              <button type="button" className="btn sm" onClick={() => setDialog({ templateId: p.id })}>
                {t('templates.useIt')}
              </button>
              <button type="button" className="icon-btn" onClick={() => deleteProject(p.id)} aria-label={t('templates.delete')} title={t('templates.delete')}>
                <Icon n="trash" s={14} />
              </button>
            </li>
          );
        })}
      </ul>
      {dialog && <NewProjectDialog templateId={dialog.templateId} onClose={() => setDialog(null)} onCreated={(id) => { setDialog(null); onCreated(id); }} />}
    </div>
  );
}
