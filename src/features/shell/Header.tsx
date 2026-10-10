import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Menu, Popover, usePop } from '../../components/Popover';
import { archiveProject, deleteProject, renameProject, setProjectColor, useApp } from '../../store/appStore';
import { COLORS, type Project } from '../../data/types';
import { ERROR_TEXT } from '../../data/repository';
import { reconnectAndRetry, retrySave } from '../../app/session';
import type { View } from '../../store/selectors';

const COLOR_NAMES: Record<(typeof COLORS)[number], string> = {
  teal: 'Teal', violet: 'Violet', amber: 'Amber', rose: 'Rose', blue: 'Blue', green: 'Green', slate: 'Slate',
};

export function Header({ view, onBurger }: { view: View; onBurger: () => void }) {
  const project = useApp((s) => (view.type === 'project' ? s.projects.find((p) => p.id === view.id) : undefined));
  return (
    <header className="top">
      <button type="button" className="icon-btn burger" onClick={onBurger} aria-label="Open navigation">
        <Icon n="menu" />
      </button>
      {project ? (
        <ProjectTitle proj={project} />
      ) : view.type === 'inbox' ? (
        <div className="ttl">
          <span className="ttl-ic"><Icon n="bell" s={18} /></span>
          <h1>Inbox</h1>
        </div>
      ) : (
        <div className="ttl">
          <span className="ttl-ic"><Icon n="mine" s={18} /></span>
          <h1>My tasks</h1>
        </div>
      )}
      <span className="sp" />
      <SaveIndicator />
    </header>
  );
}

function SaveIndicator() {
  const save = useApp((s) => s.save);
  if (save.state === 'saving') return <span className="save saving" role="status">Saving …</span>;
  if (save.state === 'saved')
    return (
      <span className="save saved" role="status">
        <Icon n="check" s={13} />
        Saved
      </span>
    );
  return (
    <span className="save error" role="alert">
      <Icon n="alert" s={14} />
      {ERROR_TEXT[save.kind]}
      {save.kind === 'permission' ? (
        <button type="button" className="btn sm" onClick={() => void reconnectAndRetry()}>Reconnect</button>
      ) : save.kind !== 'newerSchema' ? (
        <button type="button" className="btn sm" onClick={() => void retrySave()}>Try again</button>
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
        aria-label="Project name"
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
      {proj.archivedAt && <span className="badge">Archiviert</span>}
      <button type="button" className="icon-btn" onClick={p.open} aria-label="Project options">
        <Icon n="dots" />
      </button>
      {p.anchor && (
        <Popover anchor={p.anchor} onClose={p.close} width={220} label="Project options">
          <Menu
            onClose={p.close}
            items={[
              { head: 'Farbe' },
              ...COLORS.map((c) => ({ label: COLOR_NAMES[c], dot: c, active: proj.color === c, onClick: () => setProjectColor(proj.id, c) })),
              { sep: true as const },
              proj.archivedAt
                ? { label: 'Restore', icon: 'archive' as const, onClick: () => archiveProject(proj.id, false) }
                : { label: 'Archivieren', icon: 'archive' as const, onClick: () => archiveProject(proj.id, true) },
              { label: 'Delete project', icon: 'trash' as const, danger: true, keepFocus: true, onClick: () => deleteProject(proj.id) },
            ]}
          />
        </Popover>
      )}
    </div>
  );
}

