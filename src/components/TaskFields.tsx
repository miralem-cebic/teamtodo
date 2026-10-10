import { toggleDone, updateTask, useApp } from '../store/appStore';
import { byOrder, isOverdue, liveSections } from '../store/selectors';
import { diffDays, fmtDue, today } from '../lib/dates';
import { STATUS_LABEL, type ID, type TaskState, type TaskStatus } from '../data/types';
import { AssigneePicker } from './AssigneePicker';
import { Avatar } from './Avatar';
import { DatePicker } from './DatePicker';
import { Icon } from './Icon';
import { Menu, Popover, usePop } from './Popover';

// Inline fields of a task. Each field is a button that opens a popover.
// `data-field` lets keyboard shortcuts (Alt+P, Alt+D) find the field of a row.

export function assign(task: TaskState, id: ID | null) {
  const s = useApp.getState();
  const leavesMe = !!s.meId && task.assigneeId === s.meId && id !== s.meId;
  // stays visible in "My tasks" until the view is left
  if (leavesMe) s.recentDone.add(task.id);
  const name = s.users.find((u) => u.id === id)?.name;
  updateTask(task.id, { assigneeId: id }, leavesMe ? { undo: name ? `Assigned to ${name}` : 'Assignment removed', toast: true } : { undo: 'Assignment changed' });
}

export function AssigneeField({ task, full }: { task: TaskState; full?: boolean }) {
  const u = useApp((s) => s.users.find((x) => x.id === task.assigneeId));
  const p = usePop();
  return (
    <>
      <button type="button" data-field="assignee" className={'fld' + (u ? '' : ' empty')} onClick={p.open}
        aria-label={u ? `Assignee: ${u.name}` : 'Assign person'} aria-haspopup="dialog">
        {u ? (
          <>
            <Avatar user={u} />
            <span className="fld-name">{u.name}</span>
          </>
        ) : (
          <>
            <span className="av ghost"><Icon n="user" s={12} /></span>
            {full && <span>Niemand</span>}
          </>
        )}
      </button>
      {p.anchor && (
        <Popover anchor={p.anchor} onClose={p.close} label="Assignee">
          <AssigneePicker value={task.assigneeId} onPick={(id) => { assign(task, id); p.close(true); }} />
        </Popover>
      )}
    </>
  );
}

export function DueField({ task, full }: { task: TaskState; full?: boolean }) {
  const p = usePop();
  const dd = task.dueDate ? diffDays(task.dueDate, today()) : null;
  const tone = task.completedAt ? '' : isOverdue(task) ? ' overdue' : dd === 0 || dd === 1 ? ' soon' : '';
  return (
    <>
      <button type="button" data-field="due" className={'fld due' + (task.dueDate ? tone : ' empty')} onClick={p.open}
        aria-label={task.dueDate ? `Due: ${fmtDue(task.dueDate, task.dueTime)}` : 'Set due date'} aria-haspopup="dialog">
        {task.dueDate ? <span>{fmtDue(task.dueDate, task.dueTime)}</span> : <><Icon n="cal" s={15} />{full && <span>No date</span>}</>}
      </button>
      {p.anchor && (
        <Popover anchor={p.anchor} onClose={p.close} width={280} label="Due date">
          <DatePicker
            value={task.dueDate}
            time={task.dueTime}
            onPick={(v) => {
              updateTask(task.id, v ? { dueDate: v } : { dueDate: null, dueTime: null }, { undo: 'Date changed' });
              p.close(true);
            }}
            onTime={(v) => updateTask(task.id, { dueTime: v })}
          />
        </Popover>
      )}
    </>
  );
}

export function StatusField({ task }: { task: TaskState }) {
  const p = usePop();
  const done = !!task.completedAt;
  const label = done ? 'Done' : STATUS_LABEL[task.status];
  return (
    <>
      <button type="button" data-field="status" className={'pill st-' + (done ? 'done' : task.status)} onClick={p.open}
        aria-label={'Status: ' + label} aria-haspopup="menu">
        {label}
      </button>
      {p.anchor && (
        <Popover anchor={p.anchor} onClose={p.close} width={180} label="Status">
          <Menu
            onClose={p.close}
            items={[
              ...(Object.entries(STATUS_LABEL) as [TaskStatus, string][]).map(([k, l]) => ({
                label: l,
                dot: 'st-' + k,
                active: !done && task.status === k,
                onClick: () => updateTask(task.id, { status: k, completedAt: null }, { undo: 'Status changed' }),
              })),
              { label: 'Done', dot: 'st-done', active: done, onClick: () => toggleDone(task.id, true) },
            ]}
          />
        </Popover>
      )}
    </>
  );
}

/** Project (in "My tasks" with the section as addition) */
export function ProjectField({ task, showSection = true }: { task: TaskState; showSection?: boolean }) {
  const projects = useApp((s) => s.projects);
  const p = usePop();
  const proj = projects.find((x) => x.id === task.projectId && !x.deletedAt);
  const sec = proj?.sections.find((x) => x.id === task.sectionId && !x.deletedAt);
  const locked = !!task.parentId;
  const choices = projects.filter((x) => !x.deletedAt && !x.archivedAt).sort(byOrder);
  return (
    <>
      <button type="button" data-field="project" className={'fld' + (proj ? '' : ' empty')} onClick={locked ? undefined : p.open}
        aria-disabled={locked || undefined} title={locked ? 'Subtasks belong to the project of their parent task' : undefined}
        aria-label={proj ? `Project: ${proj.name}` : 'Choose project'} aria-haspopup="menu">
        {proj ? (
          <>
            <span className={'sq c-' + proj.color} />
            <span className="fld-name">
              {proj.name}
              {sec && showSection ? <span className="fld-sub"> · {sec.name}</span> : null}
            </span>
          </>
        ) : (
          <>
            <Icon n="folder" s={15} />
            <span>No project</span>
          </>
        )}
      </button>
      {p.anchor && !locked && (
        <Popover anchor={p.anchor} onClose={p.close} width={240} label="Project">
          <Menu
            onClose={p.close}
            items={[
              ...choices.map((pr) => ({
                label: pr.name,
                dot: pr.color,
                active: pr.id === task.projectId,
                onClick: () => {
                  if (pr.id === task.projectId) return;
                  updateTask(task.id, { projectId: pr.id, sectionId: liveSections(pr)[0]?.id ?? null }, { undo: `Moved to "${pr.name}"`, toast: true });
                },
              })),
              { sep: true as const },
              {
                label: 'No project',
                active: !task.projectId,
                onClick: () => task.projectId && updateTask(task.id, { projectId: null, sectionId: null }, { undo: 'Removed from project', toast: true }),
              },
            ]}
          />
        </Popover>
      )}
    </>
  );
}

export function SectionField({ task }: { task: TaskState }) {
  const proj = useApp((s) => s.projects.find((x) => x.id === task.projectId));
  const p = usePop();
  const secs = liveSections(proj);
  const sec = secs.find((x) => x.id === task.sectionId);
  return (
    <>
      <button type="button" data-field="section" className={'fld' + (sec ? '' : ' empty')} onClick={p.open}
        aria-label={sec ? `Section: ${sec.name}` : 'Choose section'} aria-haspopup="menu">
        {sec ? <span className="fld-name">{sec.name}</span> : <span>No section</span>}
      </button>
      {p.anchor && (
        <Popover anchor={p.anchor} onClose={p.close} width={220} label="Section">
          <Menu
            onClose={p.close}
            items={secs.map((s) => ({
              label: s.name,
              active: s.id === task.sectionId,
              onClick: () => s.id !== task.sectionId && updateTask(task.id, { sectionId: s.id }, { undo: `Moved to "${s.name}"`, toast: true }),
            }))}
          />
        </Popover>
      )}
    </>
  );
}

