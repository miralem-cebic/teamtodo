import { useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { AutoText } from '../../components/AutoText';
import { Check } from '../../components/Check';
import { Icon } from '../../components/Icon';
import { Menu, Popover, usePop } from '../../components/Popover';
import { assign, AssigneeField, DueField, ProjectField, SectionField, StatusField } from '../../components/TaskFields';
import { focusRow, focusTitle, isMod, neighbour, titleOf } from '../../hooks/listNav';
import {
  addTask,
  claimFocus,
  closePanel,
  deleteTask,
  openPanel,
  panelHistory,
  removeIfEmptyDraft,
  requestFocus,
  toggleDone,
  updateTask,
  useApp,
} from '../../store/appStore';
import { orderBetween, visibleTasks } from '../../store/selectors';
import type { ID, TaskState } from '../../data/types';
import { Attachments } from './Attachments';
import { CommentBox, Feed } from './Feed';
import { t as tr } from '../../i18n';
import { Followers } from './Followers';
import { useDndRow } from '../dnd/TaskDnd';

const short = (s: string) => {
  const v = s.trim() || tr('task.untitled');
  return v.length > 40 ? v.slice(0, 38) + '…' : v;
};

export function TaskPanel({ id }: { id: ID }) {
  const t = useApp((s) => s.tasks[id]);
  const parent = useApp((s) => (t?.parentId ? s.tasks[t.parentId] : undefined));
  const canBack = useApp((s) => s.panelBack.length > 0);
  const canFwd = useApp((s) => s.panelFwd.length > 0);
  const focusReq = useApp((s) => s.focusReq);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const p = usePop();

  useEffect(() => {
    if (claimFocus(focusReq, id, 'panel-title')) titleRef.current?.focus();
  }, [focusReq, id]);

  if (!t || t.deletedAt) return null;
  const done = !!t.completedAt;

  return (
    <aside className="panel" aria-label={tr('panel.label')}>
      <div className="p-top">
        <button type="button" className={'done-btn' + (done ? ' on' : '')} onClick={() => toggleDone(t.id)} aria-pressed={done}>
          <Icon n="check" s={14} />
          {done ? tr('status.done') : tr('panel.markDone')}
        </button>
        <span className="sp" />
        <button type="button" className="icon-btn" onClick={() => panelHistory(-1)} disabled={!canBack} aria-label={tr('panel.back')}>
          <Icon n="chevL" />
        </button>
        <button type="button" className="icon-btn" onClick={() => panelHistory(1)} disabled={!canFwd} aria-label={tr('panel.forward')}>
          <Icon n="chevR" />
        </button>
        <button type="button" className="icon-btn" onClick={p.open} aria-label={tr('panel.more')}>
          <Icon n="dots" />
        </button>
        {p.anchor && (
          <Popover anchor={p.anchor} onClose={p.close} width={200} label={tr('panel.actions')}>
            <Menu onClose={p.close} items={[{ label: tr('task.delete'), icon: 'trash', danger: true, keepFocus: true, onClick: () => deleteTask(t.id) }]} />
          </Popover>
        )}
        <button type="button" className="icon-btn" onClick={closePanel} aria-label={tr('panel.close')}>
          <Icon n="x" />
        </button>
      </div>
      <div className="p-body">
        {parent && (
          <button type="button" className="crumb-link" onClick={() => openPanel(parent.id)}>
            <Icon n="chevL" s={13} />
            {short(parent.title)}
          </button>
        )}
        <AutoText
          inputRef={titleRef}
          className="p-title"
          value={t.title}
          placeholder={tr('task.title')}
          ariaLabel={tr('task.title')}
          onChange={(v) => updateTask(t.id, { title: v })}
          onEnter={(e) => e.currentTarget.blur()}
        />
        <div className="fields">
          <span className="f-l">{tr('group.assignee')}</span>
          <div><AssigneeField task={t} full /></div>
          <span className="f-l">{tr('panel.due')}</span>
          <div><DueField task={t} full /></div>
          <span className="f-l">{tr('group.project')}</span>
          <div><ProjectField task={t} showSection={false} /></div>
          {t.projectId && !t.parentId && (
            <>
              <span className="f-l">{tr('group.section')}</span>
              <div><SectionField task={t} /></div>
            </>
          )}
          <span className="f-l">{tr('group.status')}</span>
          <div><StatusField task={t} /></div>
        </div>
        <h4 className="p-h">{tr('panel.description')}</h4>
        <AutoText
          className="p-desc"
          value={t.description}
          onChange={(v) => updateTask(t.id, { description: v })}
          placeholder={tr('panel.descPlaceholder')}
          ariaLabel={tr('panel.description')}
        />
        <h4 className="p-h">{tr('panel.subtasks')}</h4>
        <SubtaskList parent={t} />
        <h4 className="p-h">{tr('panel.attachments')}</h4>
        <Attachments task={t} />
        <h4 className="p-h">{tr('panel.feed')}</h4>
        <Feed t={t} />
        <Followers t={t} />
      </div>
      <CommentBox t={t} />
    </aside>
  );
}

function SubtaskList({ parent }: { parent: TaskState }) {
  const tasks = useApp((s) => s.tasks);
  const projects = useApp((s) => s.projects);
  const children = useMemo(() => visibleTasks(tasks, projects).children, [tasks, projects]);
  const subs = children[parent.id] ?? [];
  const done = subs.filter((s) => s.completedAt).length;
  const addAtEnd = () => {
    const last = subs[subs.length - 1];
    requestFocus(addTask({ parentId: parent.id, projectId: parent.projectId, order: last ? last.order + 1 : 1 }), 'panel');
  };
  return (
    <div className="subs">
      {subs.length > 0 && (
        <div className="progress" aria-label={tr('panel.progress', { done, total: subs.length })}>
          <div className="bar"><div style={{ width: `${(done / subs.length) * 100}%` }} /></div>
          <span>{tr('panel.progress', { done, total: subs.length })}</span>
        </div>
      )}
      {subs.map((s) => (
        <SubRow key={s.id} t={s} parent={parent} siblings={subs} kids={children[s.id] ?? []} />
      ))}
      <button type="button" className="add-btn" onClick={addAtEnd}>
        <Icon n="plus" s={14} />
        {tr('panel.addSubtask')}
      </button>
    </div>
  );
}

function SubRow({ t, parent, siblings, kids }: { t: TaskState; parent: TaskState; siblings: TaskState[]; kids: TaskState[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const dnd = useDndRow(`p:${t.id}`, { type: 'sub', taskId: t.id, parentId: parent.id, scope: 'panel' }, !t.title.trim());
  const focusReq = useApp((s) => s.focusReq);
  useLayoutEffect(() => {
    if (claimFocus(focusReq, t.id, 'panel')) focusTitle(inputRef.current);
  }, [focusReq, t.id]);

  const createAfter = () => {
    const i = siblings.findIndex((x) => x.id === t.id);
    requestFocus(addTask({ parentId: parent.id, projectId: parent.projectId, order: orderBetween(t, siblings[i + 1]) }), 'panel');
  };
  const moveBy = (dir: -1 | 1) => {
    const i = siblings.findIndex((x) => x.id === t.id);
    const a = siblings[i + dir];
    if (!a) return;
    const b = siblings[i + 2 * dir];
    updateTask(t.id, { order: dir < 0 ? orderBetween(b, a) : orderBetween(a, b) }, { undo: tr('undo.moved') });
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const mod = isMod(e);
    const row = rowRef.current!;
    let handled = true;
    if (mod && e.key === 'Enter') toggleDone(t.id);
    else if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) moveBy(e.key === 'ArrowUp' ? -1 : 1);
    else if (mod && e.key.toLowerCase() === 'o') openPanel(t.id);
    else if (e.altKey && (e.code === 'KeyP' || e.code === 'KeyD')) {
      const btn = row.querySelector<HTMLButtonElement>(e.code === 'KeyP' ? '[data-field="assignee"]' : '[data-field="due"]');
      if (btn) {
        btn.dataset.returnFocus = `${t.id}|panel`;
        btn.click();
      }
    }
    else if (e.altKey && e.code === 'KeyM') {
      const me = useApp.getState().meId;
      if (me) assign(t, me);
    } else if (e.altKey && e.code === 'KeyS') {
      if (t.title.trim()) {
        const last = kids[kids.length - 1];
        const id = addTask({ parentId: t.id, projectId: t.projectId, order: last ? last.order + 1 : 1 });
        openPanel(t.id);
        requestFocus(id, 'panel');
      }
    } else if (e.key === 'Enter') {
      if (!t.title.trim()) {
        e.currentTarget.blur();
        removeIfEmptyDraft(t.id);
      } else createAfter();
    } else if (e.key === 'Backspace' && t.title === '' && !kids.length) {
      focusTitle(titleOf(neighbour(row, -1)));
      deleteTask(t.id, { silent: true });
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) {
      focusTitle(titleOf(neighbour(row, e.key === 'ArrowUp' ? -1 : 1)));
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      e.currentTarget.blur();
      if (t.draft && !t.title.trim()) removeIfEmptyDraft(t.id);
      else focusRow(row);
    } else handled = false;
    if (handled) e.preventDefault();
  };

  return (
    <div
      ref={(el) => {
        rowRef.current = el;
        dnd.ref(el);
      }}
      className={'srow' + (t.completedAt ? ' done' : '') + (dnd.dragging ? ' dragging' : '') + (dnd.dropPos ? ' drop-' + dnd.dropPos : '')}
      data-row={t.id}
      data-scope="panel"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          focusTitle(inputRef.current);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          focusRow(neighbour(e.currentTarget, e.key === 'ArrowUp' ? -1 : 1));
        }
      }}>
      <span className="grip" {...dnd.handle} aria-label={tr('panel.drag')} title={tr('panel.drag')}>
        <Icon n="grip" s={13} />
      </span>
      <Check done={!!t.completedAt} onToggle={() => toggleDone(t.id)} small />
      <input
        ref={inputRef}
        data-title
        className="s-in"
        value={t.title}
        placeholder={tr('panel.subtask')}
        aria-label={tr('panel.subtask')}
        onChange={(e) => updateTask(t.id, { title: e.target.value })}
        onKeyDown={onKey}
        onBlur={() => {
          if (t.draft && !t.title.trim()) setTimeout(() => removeIfEmptyDraft(t.id), 0);
        }}
      />
      {kids.length > 0 && (
        <span className="meta">
          {kids.filter((k) => k.completedAt).length}/{kids.length}
          <Icon n="sub" s={12} />
        </span>
      )}
      <div className="s-fields">
        <AssigneeField task={t} />
        <DueField task={t} />
      </div>
      <button type="button" className="icon-btn s-open" tabIndex={-1} onClick={() => openPanel(t.id)} aria-label={tr('panel.openSubtask')}>
        <Icon n="chevR" s={14} />
      </button>
    </div>
  );
}
