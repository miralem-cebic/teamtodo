import { useEffect, useState, type ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { Menu, Popover, usePop } from '../../components/Popover';
import { addSection, addTask, claimFocus, peekFocus, deleteSection, renameSection, requestFocus, useApp } from '../../store/appStore';
import { toggleCollapsed, usePrefs } from '../../store/prefs';
import type { Group, View, ViewSettings } from '../../store/selectors';
import type { ID, TaskState } from '../../data/types';
import { TaskRow, type ThirdColumn } from './TaskRow';
import { useDndGroup, useDndRow } from '../dnd/TaskDnd';

interface Props {
  groups: Group[];
  view: View;
  settings: ViewSettings;
  collapseKey: string;
  children: Record<ID, TaskState[]>;
}

export function ListView({ groups, view, settings, collapseKey, children }: Props) {
  const third: ThirdColumn = view.type === 'my' ? 'project' : settings.group !== 'section' ? 'section' : null;
  const manual = settings.sort === 'manual';
  const expanded = usePrefs((p) => p.expanded);
  const showDoneKids = settings.completed !== 'open';
  const recentDone = useApp((s) => s.recentDone);

  const addAt = (g: Group) => {
    const last = g.tasks[g.tasks.length - 1];
    requestFocus(addTask({ ...g.defaults, order: last ? last.order + 1 : Date.now() }), 'list');
  };

  return (
    <div className={'list' + (third ? '' : ' no3')} role="grid" aria-label="Aufgaben">
      <div className="lhead" role="row">
        <div className="h-title" role="columnheader">Aufgabe</div>
        <div className="c" role="columnheader">Verantwortlich</div>
        <div className="c" role="columnheader">Fällig</div>
        {third && <div className="c c-proj" role="columnheader">{third === 'project' ? 'Projekt' : 'Bereich'}</div>}
        <div className="c c-status" role="columnheader">Status</div>
      </div>
      {groups.map((g) => (
        <GroupSection key={g.key} g={g}>
          <GroupHeader g={g} view={view} collapseKey={collapseKey} />
          {!g.collapsed && (
            <>
              {g.tasks.map((t) => {
                const allKids = children[t.id] ?? [];
                const kids = showDoneKids ? allKids : allKids.filter((k) => !k.completedAt || recentDone.has(k.id));
                const open = view.type === 'project' && !!expanded[t.id];
                return (
                  <div key={t.id} className="row-wrap">
                    <TaskRow task={t} group={g} siblings={g.tasks} view={view} third={third} manual={manual} kids={allKids} />
                    {open &&
                      kids.map((k) => (
                        <TaskRow key={k.id} task={k} depth={1} siblings={kids} view={view} third={third} manual kids={children[k.id] ?? []} />
                      ))}
                    {open && (
                      <div className="row add-row sub">
                        <button
                          type="button"
                          className="add-btn"
                          style={{ paddingLeft: 72 }}
                          onClick={() => {
                            const last = allKids[allKids.length - 1];
                            requestFocus(addTask({ parentId: t.id, projectId: t.projectId, order: last ? last.order + 1 : 1 }), 'list');
                          }}
                        >
                          <Icon n="plus" s={14} />
                          Unteraufgabe hinzufügen
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {g.apply !== null && (
                <div className="row add-row">
                  <button type="button" className="add-btn" onClick={() => addAt(g)}>
                    <Icon n="plus" s={14} />
                    Aufgabe hinzufügen
                  </button>
                </div>
              )}
            </>
          )}
        </GroupSection>
      ))}
      {view.type === 'project' && settings.group === 'section' && (
        <button type="button" className="add-section" onClick={() => requestFocus(addSection(view.id, 'Neuer Bereich'), 'section')}>
          <Icon n="plus" s={15} />
          Bereich hinzufügen
        </button>
      )}
      {!groups.length && (
        <div className="empty-state">
          <p>Keine Aufgaben passen zu deinen Filtern.</p>
        </div>
      )}
    </div>
  );
}

/** Gruppe als Ablageziel (Ablegen am Ende der Gruppe, auch wenn sie leer ist) */
function GroupSection({ g, children }: { g: Group; children: ReactNode }) {
  const drop = useDndGroup(g.key);
  return (
    <section ref={drop.ref} className={'group' + (drop.over ? ' drop-group' : '')} aria-label={g.label}>
      {children}
    </section>
  );
}

function GroupHeader({ g, view, collapseKey }: { g: Group; view: View; collapseKey: string }) {
  const focusReq = useApp((s) => s.focusReq);
  // Neu angelegter Bereich startet sofort im Bearbeitungsmodus (synchron, damit kein Tastendruck verloren geht)
  const [editing, setEditing] = useState(() => {
    return !!g.section && peekFocus(useApp.getState().focusReq, g.section.id, 'section');
  });
  const [name, setName] = useState(g.label);
  const p = usePop();
  useEffect(() => setName(g.label), [g.label]);
  const sectionId = g.section?.id;
  useEffect(() => {
    // nur auf neue Fokus-Anfragen reagieren, nicht auf geänderte Bereichsdaten
    if (sectionId && claimFocus(focusReq, sectionId, 'section')) setEditing(true);
  }, [focusReq, sectionId]);

  const projectId = view.type === 'project' ? view.id : null;
  const dnd = useDndRow(`s:${g.key}`, { type: 'section', sectionId: g.section?.id ?? '', projectId: projectId ?? '' }, !g.section || !projectId);
  const commit = () => {
    setEditing(false);
    if (g.section && projectId && name.trim() && name !== g.label) renameSection(projectId, g.section.id, name.trim());
    else setName(g.label);
  };

  return (
    <div ref={dnd.ref} className={'ghead' + (g.tone ? ' tone-' + g.tone : '') + (dnd.dragging ? ' dragging' : '') + (dnd.dropPos ? ' drop-' + dnd.dropPos : '')}>
      {g.section ? (
        <span className="grip g-grip" {...dnd.handle} aria-label="Bereich ziehen" title="Bereich ziehen">
          <Icon n="grip" s={14} />
        </span>
      ) : (
        <span className="grip-sp" />
      )}
      <button type="button" className="caret" onClick={() => toggleCollapsed(collapseKey, g.key)} aria-expanded={!g.collapsed}
        aria-label={`${g.label} ${g.collapsed ? 'ausklappen' : 'einklappen'}`}>
        <Icon n={g.collapsed ? 'chevR' : 'chevD'} s={15} />
      </button>
      {g.dot && <span className={'dot c-' + g.dot} />}
      {g.user && <Avatar user={g.user} size={20} />}
      {g.project && <span className={'sq c-' + g.project.color} />}
      {editing ? (
        <input
          className="g-in"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commit}
          aria-label="Bereichsname"
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              e.stopPropagation();
              setName(g.label);
              setEditing(false);
            }
          }}
        />
      ) : (
        <h3 className="g-title" onDoubleClick={() => g.section && setEditing(true)}>{g.label}</h3>
      )}
      {g.hint && <span className="g-hint">{g.hint}</span>}
      <span className="g-count">{g.tasks.length}</span>
      {g.section && projectId && (
        <>
          <button type="button" className="icon-btn g-more" onClick={p.open} aria-label={`Optionen für Bereich ${g.label}`}>
            <Icon n="dots" />
          </button>
          {p.anchor && (
            <Popover anchor={p.anchor} onClose={p.close} width={230} label="Bereichsoptionen">
              <Menu
                onClose={p.close}
                items={[
                  { label: 'Umbenennen', icon: 'edit', onClick: () => setEditing(true), keepFocus: true },
                  {
                    label: 'Bereich darunter einfügen',
                    icon: 'plus',
                    onClick: () => requestFocus(addSection(projectId, 'Neuer Bereich', g.section!.order), 'section'),
                    keepFocus: true,
                  },
                  { sep: true },
                  { label: 'Bereich löschen', icon: 'trash', danger: true, onClick: () => deleteSection(projectId, g.section!.id) },
                ]}
              />
            </Popover>
          )}
        </>
      )}
    </div>
  );
}

