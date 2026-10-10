import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Menu, Popover, usePop } from '../../components/Popover';
import { archiveProject, deleteProject, renameProject, saveAsTemplate, setProjectColor, showToast, useApp } from '../../store/appStore';
import { lastDueDate } from '../../lib/calendar';
import { fmtDate } from '../../lib/dates';
import { COLORS, type Project } from '../../data/types';
import { errorText } from '../../lib/labels';
import { reconnectAndRetry, retrySave } from '../../app/session';
import type { View } from '../../store/selectors';
import { t } from '../../i18n';

const colorName = (c: (typeof COLORS)[number]) => t(`color.${c}` as 'color.teal');

export function Header({ view, onBurger }: { view: View; onBurger: () => void }) {
  const project = useApp((s) => (view.type === 'project' ? s.projects.find((p) => p.id === view.id) : undefined));
  // latest due date of the open tasks of the project (visible, not deleted, including subtasks)
  const lastDue = useApp((s) => {
    if (view.type !== 'project') return null;
    const proj = s.projects.find((p) => p.id === view.id);
    if (!proj || proj.deletedAt) return null;
    return lastDueDate(Object.values(s.tasks).filter((x) => x.projectId === view.id && !x.deletedAt));
  });
  return (
    <header className="top">
      <button type="button" className="icon-btn burger" onClick={onBurger} aria-label={t('nav.open')}>
        <Icon n="menu" />
      </button>
      {project ? (
        <>
          <ProjectTitle proj={project} />
          {lastDue && <span className="last-due">{t('project.lastDue', { date: fmtDate(lastDue) })}</span>}
        </>
      ) : view.type === 'inbox' ? (
        <div className="ttl">
          <span className="ttl-ic"><Icon n="bell" s={18} /></span>
          <h1>{t('nav.inbox')}</h1>
        </div>
      ) : view.type === 'templates' ? (
        <div className="ttl">
          <span className="ttl-ic"><Icon n="copy" s={18} /></span>
          <h1>{t('nav.templates')}</h1>
        </div>
      ) : (
        <div className="ttl">
          <span className="ttl-ic"><Icon n="mine" s={18} /></span>
          <h1>{t('nav.myTasks')}</h1>
        </div>
      )}
      <span className="sp" />
      <SaveIndicator />
    </header>
  );
}

function SaveIndicator() {
  const save = useApp((s) => s.save);
  if (save.state === 'saving') return <span className="save saving" role="status">{t('save.saving')}</span>;
  if (save.state === 'saved')
    return (
      <span className="save saved" role="status">
        <Icon n="check" s={13} />
        {t('save.saved')}
      </span>
    );
  return (
    <span className="save error" role="alert">
      <Icon n="alert" s={14} />
      {errorText(save.kind)}
      {save.kind === 'permission' ? (
        <button type="button" className="btn sm" onClick={() => void reconnectAndRetry()}>{t('save.reconnect')}</button>
      ) : save.kind !== 'newerSchema' ? (
        <button type="button" className="btn sm" onClick={() => void retrySave()}>{t('save.retry')}</button>
      ) : null}
    </span>
  );
}

function ProjectTitle({ proj }: { proj: Project }) {
  const [v, setV] = useState(proj.name);
  const p = usePop();
  useEffect(() => setV(proj.name), [proj.name]);
  return (
    <div className="ttl">
      <span className={'sq lg c-' + proj.color} />
      <input
        className="ttl-in"
        value={v}
        aria-label={t('project.name')}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (v.trim() && v.trim() !== proj.name) renameProject(proj.id, v.trim());
          else setV(proj.name);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setV(proj.name);
            setTimeout(() => (document.activeElement as HTMLElement | null)?.blur(), 0);
          }
        }}
      />
      {proj.archivedAt && <span className="badge">{t('project.archived')}</span>}
      <button type="button" className="icon-btn" onClick={p.open} aria-label={t('project.options')}>
        <Icon n="dots" />
      </button>
      {p.anchor && (
        <Popover anchor={p.anchor} onClose={p.close} width={220} label={t('project.options')}>
          <Menu
            onClose={p.close}
            items={[
              { head: t('project.color') },
              ...COLORS.map((c) => ({ label: colorName(c), dot: c, active: proj.color === c, onClick: () => setProjectColor(proj.id, c) })),
              { sep: true as const },
              proj.archivedAt
                ? { label: t('project.restore'), icon: 'archive' as const, onClick: () => archiveProject(proj.id, false) }
                : { label: t('project.archive'), icon: 'archive' as const, onClick: () => archiveProject(proj.id, true) },
              { label: t('templates.saveAs'), icon: 'copy' as const, onClick: () => saveAsTemplate(proj.id, proj.name) && showToast(t('templates.saved', { name: proj.name })) },
              { label: t('project.delete'), icon: 'trash' as const, danger: true, keepFocus: true, onClick: () => deleteProject(proj.id) },
            ]}
          />
        </Popover>
      )}
    </div>
  );
}

