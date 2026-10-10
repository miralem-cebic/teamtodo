import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { Check } from '../../components/Check';
import { Icon } from '../../components/Icon';
import { assign, AssigneeField, DueField, ProjectField, SectionField, StatusField } from '../../components/TaskFields';
import {
  addTask,
  claimFocus,
  deleteTask,
  openPanel,
  removeIfEmptyDraft,
  requestFocus,
  showToast,
  toggleDone,
  updateTask,
  useApp,
} from '../../store/appStore';
import { toggleExpanded, usePrefs } from '../../store/prefs';
import { orderBetween, type Group, type View } from '../../store/selectors';
import type { TaskState } from '../../data/types';
import { focusRow, focusTitle, isMod, neighbour, titleOf } from '../../hooks/listNav';
import { useDndRow } from '../dnd/TaskDnd';

export type ThirdColumn = 'project' | 'section' | null;

interface Props {
  task: TaskState;
  depth?: number;
  group?: Group;
  /** Siblings in display order (for the Enter chain and moving) */
  siblings: TaskState[];
  view: View;
  third: ThirdColumn;
  manual: boolean;
  kids: TaskState[];
}

export function TaskRow({ task, depth = 0, group, siblings, view, third, manual, kids }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const focusReq = useApp((s) => s.focusReq);
  const selected = useApp((s) => s.panelId === task.id);
  const flash = useApp((s) => s.flash.has(task.id));
  const parent = useApp((s) => (task.parentId ? s.tasks[task.parentId] : undefined));
  const expanded = usePrefs((p) => !!p.expanded[task.id]);
  const canExpand = view.type === 'project' && depth === 0;
  const dnd = useDndRow(
    `t:${task.id}`,
    depth > 0 ? { type: 'sub', taskId: task.id, parentId: task.parentId!, scope: 'list' } : { type: 'task', taskId: task.id, groupKey: group?.key ?? '' },
    !task.title.trim(),
  );

  useLayoutEffect(() => {
    if (claimFocus(focusReq, task.id, 'list')) focusTitle(inputRef.current);
    else if (claimFocus(focusReq, task.id, 'row')) focusRow(rowRef.current);
  }, [focusReq, task.id]);

  const doneKids = kids.filter((k) => k.completedAt).length;

  /** New row directly below this one */
  const createAfter = () => {
    const i = siblings.findIndex((x) => x.id === task.id);
    const order = orderBetween(task, siblings[i + 1]);
    const fields =
      depth > 0
        ? { parentId: task.parentId, projectId: task.projectId }
        : task.parentId
          ? { ...group?.defaults, parentId: task.parentId, projectId: task.projectId, sectionId: null }
          : { ...group?.defaults };
    requestFocus(addTask({ ...fields, order }), 'list');
  };

  const addSubtask = () => {
    if (!task.title.trim()) return;
    const last = kids[kids.length - 1];
    const id = addTask({ parentId: task.id, projectId: task.projectId, order: last ? last.order + 1 : 1 });
    if (canExpand) {
      toggleExpanded(task.id, true);
      requestFocus(id, 'list');
    } else {
      openPanel(task.id);
      requestFocus(id, 'panel');
    }
  };

  const moveBy = (dir: -1 | 1) => {
    if (!manual) {
      showToast('Moving only works with manual sorting');
      return;
    }
    const i = siblings.findIndex((x) => x.id === task.id);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) return;
    const a = siblings[j]!;
    const b = siblings[j + dir];
    updateTask(task.id, { order: dir < 0 ? orderBetween(b, a) : orderBetween(a, b) }, { undo: 'Moved' });
  };

  const openField = (name: 'assignee' | 'due') => {
    const btn = rowRef.current?.querySelector<HTMLButtonElement>(`[data-field="${name}"]`);
    if (!btn) return;
    btn.dataset.returnFocus = `${task.id}|list`;
    btn.click();
  };

  /** Shortcuts that work the same in the title field and on the selected row */
  const common = (e: KeyboardEvent): boolean => {
    const mod = isMod(e);
    if (mod && e.key === 'Enter') toggleDone(task.id);
    else if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) moveBy(e.key === 'ArrowUp' ? -1 : 1);
    else if (mod && e.key.toLowerCase() === 'o') openPanel(task.id);
    else if (e.altKey && e.code === 'KeyP') openField('assignee');
    else if (e.altKey && e.code === 'KeyD') openField('due');
    else if (e.altKey && e.code === 'KeyM') {
      const me = useApp.getState().meId;
      if (me) assign(task, me);
    } else if (e.altKey && e.code === 'KeyS') addSubtask();
    else return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  };

  const onTitleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || common(e)) return;
    const el = e.currentTarget;
    const row = rowRef.current!;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!task.title.trim()) {
        // empty new row: leave input, discard the row, select the previous row
        const prev = neighbour(row, -1);
        el.blur();
        removeIfEmptyDraft(task.id);
        focusRow(prev);
        return;
      }
      createAfter();
    } else if (e.key === 'Backspace' && task.title === '' && !kids.length) {
      e.preventDefault();
      focusTitle(titleOf(neighbour(row, -1)));
      deleteTask(task.id, { silent: true });
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (e.shiftKey) return;
      e.preventDefault();
      focusTitle(titleOf(neighbour(row, e.key === 'ArrowUp' ? -1 : 1)));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (task.draft && !task.title.trim()) {
        const prev = neighbour(row, -1);
        removeIfEmptyDraft(task.id);
        focusRow(prev);
      } else focusRow(row);
    }
  };

  /** Selected row (focus on the row, not in the field) */
  const onRowKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || common(e)) return;
    const row = e.currentTarget;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = neighbour(row, e.key === 'ArrowUp' ? -1 : 1);
      if (next) {
        focusRow(next);
        if (useApp.getState().panelId && next.dataset.row) openPanel(next.dataset.row);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      focusTitle(inputRef.current);
    } else if (e.key === ' ') {
      e.preventDefault();
      openPanel(task.id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const next = neighbour(row, 1) ?? neighbour(row, -1);
      deleteTask(task.id);
      focusRow(next);
    } else if (e.key === 'ArrowRight' && canExpand && kids.length) {
      toggleExpanded(task.id, true);
    } else if (e.key === 'ArrowLeft' && canExpand) {
      toggleExpanded(task.id, false);
    }
  };

  const onBlur = () => {
    if (task.draft && !task.title.trim()) setTimeout(() => removeIfEmptyDraft(task.id), 0);
  };

  return (
    <div
      ref={(el) => {
        rowRef.current = el;
        dnd.ref(el);
      }}
      className={'row' + (selected ? ' selected' : '') + (flash ? ' flash' : '') + (dnd.dragging ? ' dragging' : '') + (dnd.dropPos ? ' drop-' + dnd.dropPos : '') + (task.completedAt ? ' done' : '')}
      data-row={task.id}
      data-scope="list"
      tabIndex={-1}
      aria-selected={selected}
      onKeyDown={onRowKey}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button,input,textarea,a,.grip')) return;
        openPanel(task.id);
      }}
    >
      <div className="c-title" style={{ paddingLeft: depth ? 28 + depth * 22 : undefined }}>
        <span className="grip" {...dnd.handle} aria-label="Drag to move" title="Drag to move">
          <Icon n="grip" s={14} />
        </span>
        {canExpand ? (
          <button
            type="button"
            className={'caret' + (kids.length ? '' : ' hidden')}
            onClick={() => toggleExpanded(task.id)}
            aria-label={expanded ? 'Collapse subtasks' : 'Expand subtasks'}
            aria-expanded={expanded}
            tabIndex={-1}
          >
            <Icon n={expanded ? 'chevD' : 'chevR'} s={14} />
          </button>
        ) : (
          depth === 0 && <span className="caret-sp" />
        )}
        <Check done={!!task.completedAt} onToggle={() => toggleDone(task.id)} small={depth > 0} />
        <span className="tgrow" data-v={task.title || (depth ? 'Subtask' : 'Task')}>
          <input
            ref={inputRef}
            data-title
            className="t-in"
            value={task.title}
            placeholder={depth ? 'Subtask' : 'Task'}
            aria-label="Task title"
            onChange={(e) => updateTask(task.id, { title: e.target.value })}
            onKeyDown={onTitleKey}
            onBlur={onBlur}
          />
        </span>
        {parent && depth === 0 && (
          <button type="button" className="crumb" tabIndex={-1} onClick={() => openPanel(parent.id)} title="Open parent task">
            <Icon n="sub" s={12} />
            <span>{parent.title}</span>
          </button>
        )}
        {kids.length > 0 && (
          <button type="button" className="meta" tabIndex={-1} onClick={() => (canExpand ? toggleExpanded(task.id) : openPanel(task.id))}
            title={`${doneKids} of ${kids.length} subtasks done`}>
            {doneKids}/{kids.length}
            <Icon n="sub" s={13} />
          </button>
        )}
        {task.comments.length > 0 && (
          <span className="meta" title={`${task.comments.length} comments`}>
            {task.comments.length}
            <Icon n="comment" s={13} />
          </span>
        )}
        <button type="button" className="details" tabIndex={-1} onClick={() => openPanel(task.id)} aria-label="Open details">
          <span>Details</span>
          <Icon n="chevR" s={14} />
        </button>
      </div>
      <div className="c c-assignee"><AssigneeField task={task} /></div>
      <div className="c c-due"><DueField task={task} /></div>
      {third && (
        <div className="c c-proj">
          {depth > 0 ? null : third === 'project' ? <ProjectField task={task} /> : <SectionField task={task} />}
        </div>
      )}
      <div className="c c-status"><StatusField task={task} /></div>
    </div>
  );
}
