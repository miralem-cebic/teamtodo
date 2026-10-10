import { useMemo, useState, type KeyboardEvent } from 'react';
import { Check } from '../../components/Check';
import { Icon } from '../../components/Icon';
import { addTask, openPanel, requestFocus, toggleDone } from '../../store/appStore';
import { byOrder, isOverdue } from '../../store/selectors';
import type { Task, TaskState } from '../../data/types';
import { addDays, fmtDate, fmtMonth, fromIsoDate, toIsoDate, today } from '../../lib/dates';
import { monthDays, tasksByDay } from '../../lib/calendar';
import { fmt, t } from '../../i18n';

// Calendar: month grid (weeks start on Monday) with the open tasks per due day, and the open tasks without a date.
// Keyboard: arrows move between days, Enter on a day adds a task, Enter/Space on a task opens it, Ctrl/⌘+Enter completes it.

interface Props {
  /** Open tasks of the current view, after filters */
  tasks: TaskState[];
  /** Defaults for a task created on a day (project or assignee of the view) */
  defaults: Partial<Task>;
}

export function CalendarView({ tasks, defaults }: Props) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const todayIso = today();
  const [focusIso, setFocusIso] = useState(todayIso);
  const days = useMemo(() => monthDays(month), [month]);
  const byDay = useMemo(() => tasksByDay(tasks), [tasks]);
  const undated = useMemo(() => tasks.filter((x) => !x.dueDate).sort(byOrder), [tasks]);
  const weekdays = days.slice(0, 7);

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  const addOn = (iso: string) => {
    const id = addTask({ ...defaults, dueDate: iso, dueTime: null, order: Date.now() });
    requestFocus(id, 'panel-title');
    openPanel(id);
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cell = e.target as HTMLElement;
    const iso = cell.dataset.day;
    // only when the day cell itself has focus, not a task inside it
    if (iso === undefined) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      addOn(iso);
      return;
    }
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const n = step[e.key];
    if (n === undefined) return;
    e.preventDefault();
    const next = addDays(iso, n);
    const nd = fromIsoDate(next);
    if (nd.getFullYear() !== month.getFullYear() || nd.getMonth() !== month.getMonth()) setMonth(new Date(nd.getFullYear(), nd.getMonth(), 1));
    setFocusIso(next);
    // the day may be rendered only after this update: focus it afterwards
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`.cal [data-day="${next}"]`)?.focus());
  };

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label={t('cal.prev')}>
          <Icon n="chevL" />
        </button>
        <h2 className="cal-title">{fmtMonth(month)}</h2>
        <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label={t('cal.next')}>
          <Icon n="chevR" />
        </button>
        <button type="button" className="btn sm" onClick={() => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setFocusIso(todayIso); }}>
          {t('cal.today')}
        </button>
      </div>

      <div className="cal-body">
        <div className="cal-grid" onKeyDown={onGridKey}>
          {weekdays.map((d) => (
            <div key={d.toISOString()} className="cal-wd" aria-hidden="true">
              {fmt(d, 'EEEEEE')}
            </div>
          ))}
          {days.map((d) => {
            const iso = toIsoDate(d);
            const list = byDay.get(iso) ?? [];
            const cls = ['cal-day', d.getMonth() !== month.getMonth() && 'other', iso === todayIso && 'today', [0, 6].includes(d.getDay()) && 'we']
              .filter(Boolean)
              .join(' ');
            return (
              <div
                key={iso}
                className={cls}
                data-day={iso}
                tabIndex={iso === focusIso ? 0 : -1}
                role="group"
                aria-label={fmt(d, 'PPPP') + (list.length ? `, ${list.length}` : '')}
                onFocus={() => setFocusIso(iso)}
              >
                <div className="cal-daytop">
                  <span className="cal-num">{d.getDate() === 1 ? fmt(d, 'MMM d') : d.getDate()}</span>
                  <button type="button" className="cal-add" tabIndex={-1} onClick={() => addOn(iso)} aria-label={t('cal.addOn', { date: fmtDate(iso) })} title={t('cal.addOn', { date: fmtDate(iso) })}>
                    <Icon n="plus" s={12} />
                  </button>
                </div>
                <ul className="cal-list">
                  {list.map((x) => (
                    <li key={x.id}>
                      <Chip t={x} showTime />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <aside className="cal-undated" aria-label={t('cal.noDate')}>
          <h3>
            {t('cal.noDate')} <span className="g-count">{undated.length}</span>
          </h3>
          {undated.length ? (
            <ul className="cal-list">
              {undated.map((x) => (
                <li key={x.id}>
                  <Chip t={x} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="cal-empty">{t('cal.allDated')}</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Chip({ t: x, showTime }: { t: TaskState; showTime?: boolean }) {
  const overdue = isOverdue(x);
  return (
    <div
      role="button"
      tabIndex={0}
      className={'cal-chip' + (overdue ? ' overdue' : '')}
      title={x.title}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        openPanel(x.id);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          toggleDone(x.id);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPanel(x.id);
        }
      }}
    >
      <Check done={!!x.completedAt} onToggle={() => toggleDone(x.id)} small />
      {showTime && x.dueTime && <span className="cal-time">{x.dueTime}</span>}
      <span className="cal-text">{x.title || t('task.untitled')}</span>
    </div>
  );
}
