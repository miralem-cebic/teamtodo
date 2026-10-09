import type { ReactNode, RefObject } from 'react';
import { Icon } from '../../components/Icon';
import { Menu, Popover, usePop } from '../../components/Popover';
import { useApp } from '../../store/appStore';
import type { Layout } from '../../store/prefs';
import { defaultSettings, type CompletedFilter, type DueFilter, type GroupBy, type SortBy, type View, type ViewSettings } from '../../store/selectors';
import { STATUS_LABEL, type TaskStatus } from '../../data/types';

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
}

const COMPLETED: [CompletedFilter, string][] = [
  ['open', 'Offene Aufgaben'],
  ['all', 'Alle Aufgaben'],
  ['done', 'Erledigte Aufgaben'],
];
const SORT: [SortBy, string][] = [
  ['manual', 'Manuell'],
  ['due', 'Fälligkeit'],
  ['title', 'Alphabetisch'],
  ['assignee', 'Verantwortlich'],
  ['created', 'Zuletzt erstellt'],
];
const DUE: [DueFilter, string][] = [
  ['all', 'Alle'],
  ['overdue', 'Überfällig'],
  ['today', 'Heute'],
  ['week', 'Nächste 7 Tage'],
  ['none', 'Ohne Datum'],
];

export function groupOptions(view: View): [GroupBy, string][] {
  return view.type === 'project'
    ? [['section', 'Bereich'], ['assignee', 'Verantwortlich'], ['due', 'Fälligkeit'], ['status', 'Status'], ['none', 'Keine Gruppierung']]
    : [['due', 'Fälligkeit'], ['project', 'Projekt'], ['status', 'Status'], ['none', 'Keine Gruppierung']];
}

export const activeFilterCount = (s: ViewSettings) => (s.due !== 'all' ? 1 : 0) + (s.status.length ? 1 : 0) + (s.assignee ? 1 : 0);

export function Toolbar({ view, settings: s, setSettings, layout, setLayout, search, setSearch, searchRef, onAdd }: Props) {
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
    <div className="toolbar" role="toolbar" aria-label="Ansicht anpassen">
      <button type="button" className="btn primary" onClick={onAdd}>
        <Icon n="plus" s={15} />
        Aufgabe hinzufügen
      </button>
      <div className="seg" role="tablist" aria-label="Darstellung">
        <button type="button" role="tab" aria-selected={layout === 'list'} className={layout === 'list' ? 'on' : ''} onClick={() => setLayout('list')} title="Liste (L)">
          <Icon n="list" s={15} />
          Liste
        </button>
        <button type="button" role="tab" aria-selected={layout === 'board'} className={layout === 'board' ? 'on' : ''} onClick={() => setLayout('board')} title="Board (B)">
          <Icon n="board" s={15} />
          Board
        </button>
      </div>
      <span className="sp" />
      <label className={'search' + (search ? ' active' : '')}>
        <Icon n="search" s={15} />
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen"
          aria-label="Aufgaben durchsuchen"
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
        <span>{COMPLETED.find((x) => x[0] === s.completed)![1]}</span>
      </button>
      <button type="button" className={'tb' + (nFilters ? ' active' : '')} onClick={fp.open} aria-haspopup="dialog" aria-label={nFilters ? `Filter, ${nFilters} aktiv` : 'Filter'}>
        <Icon n="filter" s={15} />
        <span>Filter{nFilters ? ` (${nFilters})` : ''}</span>
      </button>
      {nFilters > 0 && (
        <button type="button" className="icon-btn tb-reset" onClick={() => setSettings({ due: 'all', status: [], assignee: '' })} aria-label="Filter zurücksetzen" title="Filter zurücksetzen">
          <Icon n="x" s={14} />
        </button>
      )}
      <button type="button" className={'tb' + (s.sort !== 'manual' ? ' active' : '')} onClick={sp.open} aria-haspopup="menu">
        <Icon n="sort" s={15} />
        <span>{s.sort === 'manual' ? 'Sortieren' : SORT.find((x) => x[0] === s.sort)![1]}</span>
      </button>
      <button type="button" className={'tb' + (s.group !== def.group ? ' active' : '')} onClick={gp.open} aria-haspopup="menu">
        <Icon n="group" s={15} />
        <span>{s.group === def.group ? 'Gruppieren' : groups.find((x) => x[0] === s.group)?.[1] ?? 'Gruppieren'}</span>
      </button>

      {cp.anchor && (
        <Popover anchor={cp.anchor} onClose={cp.close} width={210} label="Erledigte Aufgaben">
          <Menu onClose={cp.close} items={COMPLETED.map(([k, l]) => ({ label: l, active: s.completed === k, onClick: () => setSettings({ completed: k }) }))} />
        </Popover>
      )}
      {sp.anchor && (
        <Popover anchor={sp.anchor} onClose={sp.close} width={210} label="Sortieren">
          <Menu onClose={sp.close} items={[{ head: 'Sortieren nach' }, ...SORT.map(([k, l]) => ({ label: l, active: s.sort === k, onClick: () => setSettings({ sort: k }) }))]} />
        </Popover>
      )}
      {gp.anchor && (
        <Popover anchor={gp.anchor} onClose={gp.close} width={210} label="Gruppieren">
          <Menu onClose={gp.close} items={[{ head: 'Gruppieren nach' }, ...groups.map(([k, l]) => ({ label: l, active: s.group === k, onClick: () => setSettings({ group: k }) }))]} />
        </Popover>
      )}
      {fp.anchor && (
        <Popover anchor={fp.anchor} onClose={fp.close} width={320} label="Filter">
          <div className="filters">
            {view.type === 'project' && (
              <>
                <div className="f-sec" id="f-who">Verantwortlich</div>
                <div className="chips" role="group" aria-labelledby="f-who">
                  <Chip on={!s.assignee} onClick={() => setSettings({ assignee: '' })} autoFocus>Alle</Chip>
                  {meId && <Chip on={s.assignee === meId} onClick={() => setSettings({ assignee: meId })}>Ich</Chip>}
                  {users
                    .filter((u) => u.id !== meId && !u.deletedAt)
                    .map((u) => (
                      <Chip key={u.id} on={s.assignee === u.id} onClick={() => setSettings({ assignee: u.id })}>{u.name.split(' ')[0]}</Chip>
                    ))}
                  <Chip on={s.assignee === 'none'} onClick={() => setSettings({ assignee: 'none' })}>Niemand</Chip>
                </div>
              </>
            )}
            <div className="f-sec" id="f-due">Fälligkeit</div>
            <div className="chips" role="group" aria-labelledby="f-due">
              {DUE.map(([k, l]) => (
                <Chip key={k} on={s.due === k} onClick={() => setSettings({ due: k })} autoFocus={view.type !== 'project' && k === 'all'}>{l}</Chip>
              ))}
            </div>
            <div className="f-sec" id="f-status">Status</div>
            <div className="chips" role="group" aria-labelledby="f-status">
              {[...(Object.entries(STATUS_LABEL) as [TaskStatus, string][]), ['done', 'Erledigt'] as ['done', string]].map(([k, l]) => (
                <Chip key={k} on={s.status.includes(k)} onClick={() => toggleStatus(k)}>{l}</Chip>
              ))}
            </div>
            {nFilters > 0 && (
              <button type="button" className="link f-reset" onClick={() => setSettings({ due: 'all', status: [], assignee: '' })}>
                Filter zurücksetzen
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
