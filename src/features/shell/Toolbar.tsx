import type { ReactNode, RefObject } from 'react';
import { Icon } from '../../components/Icon';
import { Menu, Popover, usePop } from '../../components/Popover';
import { useApp } from '../../store/appStore';
import type { Layout } from '../../store/prefs';
import { defaultSettings, type CompletedFilter, type DueFilter, type GroupBy, type SortBy, type View, type ViewSettings } from '../../store/selectors';
import type { TaskStatus } from '../../data/types';
import { statusLabel, STATUSES } from '../../lib/labels';
import { t } from '../../i18n';

interface Props {
  view: View;
  settings: ViewSettings;
  setSettings: (p: Partial<ViewSettings>) => void;
  layout: Layout;
  setLayout: (l: Layout) => void;
  search: string;
  setSearch: (v: string) => void;
  searchRef: RefObject<HTMLInputElement>;
  onAdd: () => void;
  onExport: () => void;
}

const completedOptions = (): [CompletedFilter, string][] => [
  ['open', t('filter.open')],
  ['all', t('filter.all')],
  ['done', t('filter.done')],
];
const sortOptions = (): [SortBy, string][] => [
  ['manual', t('sort.manual')],
  ['due', t('sort.due')],
  ['title', t('sort.title')],
  ['assignee', t('group.assignee')],
  ['created', t('sort.created')],
];
const dueOptions = (): [DueFilter, string][] => [
  ['all', t('common.all')],
  ['overdue', t('due.overdue')],
  ['today', t('due.today')],
  ['week', t('due.week')],
  ['none', t('due.none')],
];

export function groupOptions(view: View): [GroupBy, string][] {
  return view.type === 'project'
    ? [['section', t('group.section')], ['assignee', t('group.assignee')], ['due', t('sort.due')], ['status', t('group.status')], ['none', t('group.none')]]
    : [['due', t('sort.due')], ['project', t('group.project')], ['status', t('group.status')], ['none', t('group.none')]];
}

export const activeFilterCount = (s: ViewSettings) => (s.due !== 'all' ? 1 : 0) + (s.status.length ? 1 : 0) + (s.assignee ? 1 : 0);

export function Toolbar({ view, settings: s, setSettings, layout, setLayout, search, setSearch, searchRef, onAdd, onExport }: Props) {
  const users = useApp((x) => x.users);
  const meId = useApp((x) => x.meId);
  const fp = usePop();
  const sp = usePop();
  const gp = usePop();
  const cp = usePop();
  const nFilters = activeFilterCount(s);
  const def = defaultSettings(view);
  const groups = groupOptions(view);
  const toggleStatus = (k: TaskStatus | 'done') => setSettings({ status: s.status.includes(k) ? s.status.filter((x) => x !== k) : [...s.status, k] });

  return (
    <div className="toolbar" role="toolbar" aria-label={t('toolbar.label')}>
      <button type="button" className="btn primary" onClick={onAdd}>
        <Icon n="plus" s={15} />
        {t('task.add')}
      </button>
      <div className="seg" role="tablist" aria-label={t('toolbar.layout')}>
        <button type="button" role="tab" aria-selected={layout === 'list'} className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')} title={t('toolbar.listTitle')}>
          <Icon n="list" s={15} />
          {t('view.list')}
        </button>
        <button type="button" role="tab" aria-selected={layout === 'board'} className={layout === 'board' ? 'on' : ''} onClick={() => setLayout('board')} title={t('toolbar.boardTitle')}>
          <Icon n="board" s={15} />
          {t('view.board')}
        </button>
        <button type="button" role="tab" aria-selected={layout === 'calendar'} className={layout === 'calendar' ? 'on' : ''} onClick={() => setLayout('calendar')} title={t('toolbar.calendarTitle')}>
          <Icon n="cal" s={15} />
          {t('view.calendar')}
        </button>
      </div>
      <span className="sp" />
      <label className={'search' + (search ? ' active' : '')}>
        <Icon n="search" s={15} />
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('toolbar.search')}
          aria-label={t('toolbar.searchTasks')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setSearch('');
              e.currentTarget.blur();
            }
          }}
        />
      </label>
      <button type="button" className={'tb' + (s.completed !== 'open' ? ' active' : '')} onClick={cp.open} aria-haspopup="menu">
        <Icon n="mine" s={15} />
        <span>{completedOptions().find((x) => x[0] === s.completed)![1]}</span>
      </button>
      <button type="button" className={'tb' + (nFilters ? ' active' : '')} onClick={fp.open} aria-haspopup="dialog" aria-label={nFilters ? t('toolbar.filterActive', { n: nFilters }) : t('toolbar.filter')}>
        <Icon n="filter" s={15} />
        <span>{t('toolbar.filter')}{nFilters ? ` (${nFilters})` : ''}</span>
      </button>
      {nFilters > 0 && (
        <button type="button" className="icon-btn tb-reset" onClick={() => setSettings({ due: 'all', status: [], assignee: '' })} aria-label={t('toolbar.resetFilters')} title={t('toolbar.resetFilters')}>
          <Icon n="x" s={14} />
        </button>
      )}
      <button type="button" className="tb" onClick={onExport} title={t('ics.exportViewTitle')}>
        <Icon n="cal" s={15} />
        <span>{t('ics.exportView')}</span>
      </button>
      <button type="button" className={'tb' + (s.sort !== 'manual' ? ' active' : '')} onClick={sp.open} aria-haspopup="menu">
        <Icon n="sort" s={15} />
        <span>{s.sort === 'manual' ? t('toolbar.sort') : sortOptions().find((x) => x[0] === s.sort)![1]}</span>
      </button>
      <button type="button" className={'tb' + (s.group !== def.group ? ' active' : '')} onClick={gp.open} aria-haspopup="menu">
        <Icon n="group" s={15} />
        <span>{s.group === def.group ? t('toolbar.group') : groups.find((x) => x[0] === s.group)?.[1] ?? t('toolbar.group')}</span>
      </button>

      {cp.anchor && (
        <Popover anchor={cp.anchor} onClose={cp.close} width={210} label={t('filter.done')}>
          <Menu onClose={cp.close} items={completedOptions().map(([k, l]) => ({ label: l, active: s.completed === k, onClick: () => setSettings({ completed: k }) }))} />
        </Popover>
      )}
      {sp.anchor && (
        <Popover anchor={sp.anchor} onClose={sp.close} width={210} label={t('toolbar.sort')}>
          <Menu onClose={sp.close} items={[{ head: t('toolbar.sortBy') }, ...sortOptions().map(([k, l]) => ({ label: l, active: s.sort === k, onClick: () => setSettings({ sort: k }) }))]} />
        </Popover>
      )}
      {gp.anchor && (
        <Popover anchor={gp.anchor} onClose={gp.close} width={210} label={t('toolbar.group')}>
          <Menu onClose={gp.close} items={[{ head: t('toolbar.groupBy') }, ...groups.map(([k, l]) => ({ label: l, active: s.group === k, onClick: () => setSettings({ group: k }) }))]} />
        </Popover>
      )}
      {fp.anchor && (
        <Popover anchor={fp.anchor} onClose={fp.close} width={320} label={t('toolbar.filter')}>
          <div className="filters">
            {view.type === 'project' && (
              <>
                <div className="f-sec" id="f-who">{t('group.assignee')}</div>
                <div className="chips" role="group" aria-labelledby="f-who">
                  <Chip on={!s.assignee} onClick={() => setSettings({ assignee: '' })} autoFocus>{t('common.all')}</Chip>
                  {meId && <Chip on={s.assignee === meId} onClick={() => setSettings({ assignee: meId })}>{t('filter.me')}</Chip>}
                  {users
                    .filter((u) => u.id !== meId && !u.deletedAt)
                    .map((u) => (
                      <Chip key={u.id} on={s.assignee === u.id} onClick={() => setSettings({ assignee: u.id })}>{u.name.split(' ')[0]}</Chip>
                    ))}
                  <Chip on={s.assignee === 'none'} onClick={() => setSettings({ assignee: 'none' })}>{t('filter.nobody')}</Chip>
                </div>
              </>
            )}
            <div className="f-sec" id="f-due">{t('sort.due')}</div>
            <div className="chips" role="group" aria-labelledby="f-due">
              {dueOptions().map(([k, l]) => (
                <Chip key={k} on={s.due === k} onClick={() => setSettings({ due: k })} autoFocus={view.type !== 'project' && k === 'all'}>{l}</Chip>
              ))}
            </div>
            <div className="f-sec" id="f-status">{t('group.status')}</div>
            <div className="chips" role="group" aria-labelledby="f-status">
              {[...STATUSES, 'done' as const].map((k) => (
                <Chip key={k} on={s.status.includes(k)} onClick={() => toggleStatus(k)}>{statusLabel(k)}</Chip>
              ))}
            </div>
            {nFilters > 0 && (
              <button type="button" className="link f-reset" onClick={() => setSettings({ due: 'all', status: [], assignee: '' })}>
                {t('toolbar.resetFilters')}
              </button>
            )}
          </div>
        </Popover>
      )}
    </div>
  );
}

function Chip({ on, onClick, children, autoFocus }: { on: boolean; onClick: () => void; children: ReactNode; autoFocus?: boolean }) {
  return (
    <button type="button" className={'chip' + (on ? ' on' : '')} onClick={onClick} aria-pressed={on} autoFocus={autoFocus}>
      {children}
    </button>
  );
}
