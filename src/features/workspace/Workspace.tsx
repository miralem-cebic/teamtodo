import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ToastHost } from '../../components/Toast';
import { isTyping, isMod } from '../../hooks/listNav';
import { addTask, clearRecentDone, closePanel, requestFocus, undo, useApp } from '../../store/appStore';
import { collapseKey, patchSettings, setLayout, setView, settingsFor, toggleCollapsed, usePrefs, type Layout } from '../../store/prefs';
import { buildGroups, visibleTasks, type View, type ViewSettings } from '../../store/selectors';
import { KeysDialog } from '../keys/KeysDialog';
import { ListView } from '../list/ListView';
import { Header } from '../shell/Header';
import { Toolbar } from '../shell/Toolbar';
import { DataDialog } from '../shell/DataDialog';
import { TeamDialog } from '../team/TeamDialog';
import { BoardView } from '../board/BoardView';
import { TaskDnd } from '../dnd/TaskDnd';
import { Sidebar } from '../shell/Sidebar';
import { TaskPanel } from '../task-panel/TaskPanel';
import { InboxView } from '../inbox/InboxView';
import { loadInboxRead } from '../inbox/inbox';

export function Workspace() {
  const tasks = useApp((s) => s.tasks);
  const projects = useApp((s) => s.projects);
  const users = useApp((s) => s.users);
  const meId = useApp((s) => s.meId);
  const recentDone = useApp((s) => s.recentDone);
  const panelId = useApp((s) => s.panelId);
  const prefs = usePrefs();
  const [search, setSearch] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const workspaceId = useApp((s) => s.workspace?.id);
  useEffect(() => {
    if (workspaceId && meId) loadInboxRead(workspaceId, meId);
  }, [workspaceId, meId]);

  // view of a deleted project → back to "My tasks"
  let view: View = prefs.view;
  if (view.type === 'project' && !projects.some((p) => p.id === (view as { id: string }).id && !p.deletedAt)) view = { type: 'my' };
  const settings = settingsFor(prefs, view);
  const cKey = collapseKey(view, settings);
  const collapsed = prefs.collapsed[cKey] ?? {};
  const setSettings = useCallback((p: Partial<ViewSettings>) => patchSettings(view, p), [view]);
  const layout: Layout = prefs.layout[view.type === 'project' ? view.id : view.type] === 'board' ? 'board' : 'list';
  const changeLayout = useCallback((l: Layout) => setLayout(view, l), [view]);

  const children = useMemo(() => visibleTasks(tasks, projects).children, [tasks, projects]);
  const groups = useMemo(
    () => buildGroups({ tasks, projects, users, meId, view, settings, search, recentDone, collapsed }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, projects, users, meId, JSON.stringify(view), JSON.stringify(settings), search, recentDone, collapsed],
  );
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const go = useCallback((v: View) => {
    setView(v);
    closePanel();
    clearRecentDone();
    setSearch('');
    setNavOpen(false);
  }, []);

  const newTask = useCallback(() => {
    const g = groupsRef.current.find((x) => x.apply !== null);
    if (!g) return;
    if (layout === 'board') return requestFocus(g.key, 'board-add');
    if (g.collapsed) toggleCollapsed(cKey, g.key, false);
    const first = g.tasks[0];
    requestFocus(addTask({ ...g.defaults, order: first ? first.order - 1 : Date.now() }), 'list');
  }, [cKey, layout]);

  // Global keyboard shortcuts (only when no input field is focused)
  useEffect(() => {
    let gPressed = 0;
    const h = (e: KeyboardEvent) => {
      if (keysOpen || dataOpen) return;
      const typing = isTyping(e.target);
      if (e.key === 'Escape' && !typing) {
        if (navOpen) setNavOpen(false);
        else if (useApp.getState().panelId) {
          const id = useApp.getState().panelId!;
          closePanel();
          requestFocus(id, 'row');
        }
        return;
      }
      if (typing) return;
      if (isMod(e) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (isMod(e) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (gPressed && Date.now() - gPressed < 1500 && (k === 'm' || k === 'i')) {
        e.preventDefault();
        gPressed = 0;
        go(k === 'm' ? { type: 'my' } : { type: 'inbox' });
        return;
      }
      gPressed = 0;
      if (k === 'n') {
        e.preventDefault();
        newTask();
      } else if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === '?') {
        e.preventDefault();
        setKeysOpen(true);
      } else if (k === 'l') changeLayout('list');
      else if (k === 'b') changeLayout('board');
      else if (k === 'g') gPressed = Date.now();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [keysOpen, dataOpen, navOpen, go, newTask, changeLayout]);

  return (
    <div className={'app' + (navOpen ? ' nav-open' : '') + (panelId ? ' has-panel' : '')}>
      <Sidebar view={view} go={go} openKeys={() => setKeysOpen(true)} openData={() => setDataOpen(true)} openTeam={() => setTeamOpen(true)} />
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <TaskDnd groups={groups} settings={settings} childrenOf={children}>
      <main className="main">
        <div className="content">
          <Header view={view} onBurger={() => setNavOpen(true)} />
          {view.type === 'inbox' ? (
            <div className="scroll" data-testid="list-scroll">
              <InboxView />
            </div>
          ) : (
            <>
              <Toolbar view={view} settings={settings} setSettings={setSettings} layout={layout} setLayout={changeLayout} search={search} setSearch={setSearch} searchRef={searchRef} onAdd={newTask} />
              <div className="scroll" data-testid="list-scroll">
                {layout === 'board' ? (
                  <BoardView groups={groups} view={view} children={children} />
                ) : (
                  <ListView groups={groups} view={view} settings={settings} collapseKey={cKey} children={children} />
                )}
              </div>
            </>
          )}
        </div>
        {panelId && <TaskPanel key={panelId} id={panelId} />}
      </main>
      </TaskDnd>
      <ToastHost />
      {keysOpen && <KeysDialog onClose={() => setKeysOpen(false)} />}
      {dataOpen && <DataDialog onClose={() => setDataOpen(false)} />}
      {teamOpen && <TeamDialog onClose={() => setTeamOpen(false)} />}
    </div>
  );
}
