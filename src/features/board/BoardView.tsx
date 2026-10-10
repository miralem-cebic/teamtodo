import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Avatar } from '../../components/Avatar';
import { Check } from '../../components/Check';
import { Icon } from '../../components/Icon';
import { addTask, claimFocus, openPanel, toggleDone, useApp } from '../../store/appStore';
import { isOverdue, type Group, type View } from '../../store/selectors';
import { diffDays, fmtDue, today } from '../../lib/dates';
import type { ID, TaskState } from '../../data/types';
import { useDndGroup, useDndRow } from '../dnd/TaskDnd';

// Board: Spalten = aktuelle Grouping. Karten per Drag and Drop verschieben.
// Keyboard: Tab/arrows between cards, Enter/Space opens details, Ctrl/⌘+Enter completes.

export function BoardView({ groups, view, children }: { groups: Group[]; view: View; children: Record<ID, TaskState[]> }) {
  return (
    <div className="board" role="list" aria-label="Board">
      {groups.map((g) => (
        <Column key={g.key} g={g} view={view} children={children} />
      ))}
      {!groups.length && (
        <div className="empty-state">
          <p>No tasks match your filters.</p>
        </div>
      )}
    </div>
  );
}

function Column({ g, view, children }: { g: Group; view: View; children: Record<ID, TaskState[]> }) {
  const drop = useDndGroup(g.key);
  return (
    <section ref={drop.ref} className={'col' + (drop.over ? ' drop-group' : '')} role="listitem" aria-label={g.label}>
      <div className={'col-head' + (g.tone ? ' tone-' + g.tone : '')}>
        {g.dot && <span className={'dot c-' + g.dot} />}
        {g.user && <Avatar user={g.user} size={20} />}
        {g.project && <span className={'sq c-' + g.project.color} />}
        <h3>{g.label}</h3>
        <span className="g-count">{g.tasks.length}</span>
      </div>
      <div className="col-body">
        {g.tasks.map((t) => (
          <Card key={t.id} t={t} g={g} view={view} kids={children[t.id] ?? []} />
        ))}
        {g.apply !== null && <AddCard g={g} />}
      </div>
    </section>
  );
}

function Card({ t, g, view, kids }: { t: TaskState; g: Group; view: View; kids: TaskState[] }) {
  const user = useApp((s) => s.users.find((u) => u.id === t.assigneeId));
  const proj = useApp((s) => s.projects.find((p) => p.id === t.projectId));
  const selected = useApp((s) => s.panelId === t.id);
  const flash = useApp((s) => s.flash.has(t.id));
  const dnd = useDndRow(`t:${t.id}`, { type: 'task', taskId: t.id, groupKey: g.key });
  // the whole card is the handle
  const { ref: _activator, ...handleProps } = dnd.handle;
  const dd = t.dueDate ? diffDays(t.dueDate, today()) : null;
  const tone = isOverdue(t) ? ' overdue' : dd !== null && dd <= 1 && dd >= 0 && !t.completedAt ? ' soon' : '';

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      toggleDone(t.id);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPanel(t.id);
    } else if (e.key.startsWith('Arrow')) {
      const cards = [...document.querySelectorAll<HTMLElement>('.board .card[data-card]')];
      const me = e.currentTarget;
      const r = me.getBoundingClientRect();
      const cand = cards.filter((c) => c !== me).map((c) => ({ c, r: c.getBoundingClientRect() }));
      const pick =
        e.key === 'ArrowDown' || e.key === 'ArrowUp'
          ? cand.filter((x) => Math.abs(x.r.left - r.left) < 5 && (e.key === 'ArrowDown' ? x.r.top > r.top : x.r.top < r.top)).sort((a, b) => (e.key === 'ArrowDown' ? a.r.top - b.r.top : b.r.top - a.r.top))[0]
          : cand
              .filter((x) => (e.key === 'ArrowRight' ? x.r.left > r.right - 5 : x.r.right < r.left + 5))
              .sort((a, b) => Math.abs(a.r.left - r.left) - Math.abs(b.r.left - r.left) || Math.abs(a.r.top - r.top) - Math.abs(b.r.top - r.top))[0];
      if (pick) {
        e.preventDefault();
        pick.c.focus();
      }
    }
  };

  return (
    <div
      ref={dnd.ref}
      {...handleProps}
      tabIndex={0}
      role="button"
      data-card={t.id}
      aria-label={`${t.title || 'Untitled'}${t.completedAt ? ', done' : ''}`}
      className={'card' + (selected ? ' selected' : '') + (t.completedAt ? ' done' : '') + (flash ? ' flash' : '') + (dnd.dragging ? ' dragging' : '') + (dnd.dropPos ? ' drop-' + dnd.dropPos : '')}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        openPanel(t.id);
      }}
      onKeyDown={onKey}
    >
      <div className="card-top">
        <Check done={!!t.completedAt} onToggle={() => toggleDone(t.id)} />
        <span className="card-title">{t.title || 'Untitled'}</span>
      </div>
      {view.type !== 'project' && proj && (
        <div className="card-proj">
          <span className={'sq c-' + proj.color} />
          {proj.name}
        </div>
      )}
      <div className="card-meta">
        {user ? <Avatar user={user} /> : <span className="av ghost"><Icon n="user" s={12} /></span>}
        {t.dueDate && <span className={'card-due' + tone}>{fmtDue(t.dueDate, t.dueTime)}</span>}
        <span className="sp" />
        {kids.length > 0 && (
          <span className="meta">
            {kids.filter((k) => k.completedAt).length}/{kids.length}
            <Icon n="sub" s={13} />
          </span>
        )}
        {t.comments.filter((c) => !c.deletedAt).length > 0 && (
          <span className="meta">
            {t.comments.filter((c) => !c.deletedAt).length}
            <Icon n="comment" s={13} />
          </span>
        )}
      </div>
    </div>
  );
}

/** "Add task" at the end of the column, with Enter chain */
function AddCard({ g }: { g: Group }) {
  const focusReq = useApp((s) => s.focusReq);
  const [open, setOpen] = useState(false);
  const [v, setV] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (claimFocus(focusReq, g.key, 'board-add')) setOpen(true);
  }, [focusReq, g.key]);
  useLayoutEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);

  if (!open)
    return (
      <button type="button" className="add-card" onClick={() => setOpen(true)}>
        <Icon n="plus" s={14} />
        Add task
      </button>
    );
  return (
    <div className="card add-open">
      <textarea
        ref={ref}
        className="card-in"
        rows={2}
        value={v}
        placeholder="What needs to be done?"
        aria-label={`New task in ${g.label}`}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => !v.trim() && setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!v.trim()) return setOpen(false);
            const last = g.tasks[g.tasks.length - 1];
            addTask({ ...g.defaults, title: v.trim(), order: last ? last.order + 1 : Date.now() });
            setV('');
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setV('');
            setOpen(false);
          }
        }}
      />
      <div className="card-hint">Enter saves, then the next one right away</div>
    </div>
  );
}
