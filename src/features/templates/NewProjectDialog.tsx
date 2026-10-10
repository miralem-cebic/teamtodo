import { useMemo, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { addProject, addProjectFromTemplate, useApp } from '../../store/appStore';
import { byOrder } from '../../store/selectors';
import type { ID } from '../../data/types';
import { t } from '../../i18n';

/** New project: from scratch or from a template. Template tasks come without assignments and due dates. */
export function NewProjectDialog({ onClose, onCreated, templateId }: { onClose: () => void; onCreated: (id: ID) => void; templateId?: ID }) {
  const projects = useApp((s) => s.projects);
  const templates = useMemo(() => projects.filter((p) => p.template && !p.deletedAt).sort(byOrder), [projects]);
  const [name, setName] = useState('');
  const [from, setFrom] = useState<ID | ''>(templateId && templates.some((x) => x.id === templateId) ? templateId : '');

  const create = () => {
    const n = name.trim();
    if (!n) return;
    const id = from ? addProjectFromTemplate(from, n) : addProject(n);
    if (id) onCreated(id);
  };

  return (
    <Dialog title={t('project.new')} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}>
        <label className="tpl-field">
          <span>{t('project.name')}</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('project.name')} />
        </label>
        {templates.length > 0 && (
          <fieldset className="tpl-source">
            <legend>{t('project.source')}</legend>
            <label className="tpl-opt">
              <input type="radio" name="source" checked={from === ''} onChange={() => setFrom('')} />
              <span>{t('project.startBlank')}</span>
            </label>
            {templates.map((tpl) => (
              <label key={tpl.id} className="tpl-opt">
                <input type="radio" name="source" checked={from === tpl.id} onChange={() => setFrom(tpl.id)} />
                <span className={'sq c-' + tpl.color} />
                <span>{tpl.name}</span>
              </label>
            ))}
            {from && <p className="d-text tpl-hint">{t('project.templateHint')}</p>}
          </fieldset>
        )}
        <div className="d-row">
          <span className="sp" />
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>
            {t('project.create')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
