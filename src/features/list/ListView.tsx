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
import { t, t as tr } from '../../i18n';

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
    <div className={'list' + (third ? '' : ' no3')} role="grid" aria-label="Tasks">
      <div className="lhead" role="row">
        <div className="h-title" role="columnheader">{t('list.task')}</div>
        <div className="c" role="columnheader">{t('group.assignee')}</div>
        <div className="c" role="columnheader">{t('panel.due')}</div>
        {third && <div className="c c-proj" role="columnheader">{third === 'project' ? 'Project' : 'Section'}</div>}
        <div className="c c-status" role="columnheader">{t('group.status')}</div>
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
                          {tr('panel.addSubtask')}
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
                    {t('task.add')}
                  </button>
                </div>
              )}
            </>
          )}
        </GroupSection>
      ))}
      {view.type === 'project' && settings.group === 'section' && (
        <button type="button" className="add-section" onClick={() => requestFocus(addSection(view.id, 'New section'), 'section')}>
          <Icon n="plus" s={15} />
          {t('section.add')}
        </button>
      )}
      {!groups.length && (
        <div className="empty-state">
          <p>{t('list.empty')}</p>
        </div>
      )}
    </div>
  );
}

/** Group as drop target (dropping at the end of the group, even if it is empty) */
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
  // A newly created section starts in edit mode at once (synchronously, so that no keystroke is lost)
  const [editing, setEditing] = useState(() => {
    return !!g.section && peekFocus(useApp.getState().focusReq, g.section.id, 'section');
  });
  const [name, setName] = useState(g.label);
  const p = usePop();
  useEffect(() => setName(g.label), [g.label]);
  const sectionId = g.section?.id;
  useEffect(() => {
    // react only to new focus requests, not to changed section data
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
        <span className="grip g-grip" {...dnd.handle} aria-label="Drag section" title="Drag section">
          <Icon n="grip" s={14} />
        </span>
      ) : (
        <span className="grip-sp" />
      )}
      <button type="button" className="caret" onClick={() => toggleCollapsed(collapseKey, g.key)} aria-expanded={!g.collapsed}
        aria-label={g.collapsed ? t('group.expand', { name: g.label }) : t('group.collapse', { name: g.label })}>
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
          aria-label={t('section.name')}
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
          <button type="button" className="icon-btn g-more" onClick={p.open} aria-label={`Options for section ${g.label}`}>
            <Icon n="dots" />
          </button>
          {p.anchor && (
            <Popover anchor={p.anchor} onClose={p.close} width={230} label={t('section.options')}>
              <Menu
                onClose={p.close}
                items={[
                  { label: t('section.rename'), icon: 'edit', onClick: () => setEditing(true), keepFocus: true },
                  {
                    label: t('section.insertBelow'),
                    icon: 'plus',
                    onClick: () => requestFocus(addSection(projectId, t('section.new'), g.section!.order), 'section'),
                    keepFocus: true,
                  },
                  { sep: true },
                  { label: t('section.delete'), icon: 'trash', danger: true, onClick: () => deleteSection(projectId, g.section!.id) },
                ]}
              />
            </Popover>
          )}
        </>
      )}
    </div>
  );
}

