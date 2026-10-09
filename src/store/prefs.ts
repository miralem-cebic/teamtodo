import { create } from 'zustand';
import type { ID } from '../data/types';
import { defaultSettings, type View, type ViewSettings } from './selectors';

// Einstellungen pro Browser (nicht im geteilten Ordner): Ansicht, Gruppierung, Filter, eingeklappte Bereiche.

const KEY = 'teamaufgaben.prefs.v1';
const ME_KEY = (workspaceId: string) => `teamaufgaben.me.${workspaceId}`;

export type Layout = 'list' | 'board' | 'calendar';

export interface Prefs {
  view: View;
  layout: Record<string, Layout>;
  settings: Record<string, Partial<ViewSettings>>;
  collapsed: Record<string, Record<string, boolean>>;
  expanded: Record<ID, boolean>;
  /** Aktivitäten im Verlauf der Detailansicht zeigen */
  showActivity?: boolean;
  /** Eingang: nur ungelesene */
  inboxUnreadOnly?: boolean;
}

const fallback: Prefs = { view: { type: 'my' }, layout: {}, settings: {}, collapsed: {}, expanded: {} };

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fallback, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    /* localStorage nicht verfügbar */
  }
  return fallback;
}

export const usePrefs = create<Prefs>()(() => read());
usePrefs.subscribe((p) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignorieren */
  }
});

export const viewKey = (v: View) => (v.type === 'project' ? v.id : v.type);

export function settingsFor(p: Prefs, v: View): ViewSettings {
  return { ...defaultSettings(v), ...(p.settings[viewKey(v)] ?? {}) };
}

export const setView = (view: View) => usePrefs.setState({ view });
export const setLayout = (v: View, layout: Layout) => usePrefs.setState((p) => ({ layout: { ...p.layout, [viewKey(v)]: layout } }));
export const patchSettings = (v: View, patch: Partial<ViewSettings>) =>
  usePrefs.setState((p) => ({ settings: { ...p.settings, [viewKey(v)]: { ...settingsFor(p, v), ...patch } } }));

export const collapseKey = (v: View, s: ViewSettings) => `${viewKey(v)}:${s.group}`;
export const toggleCollapsed = (key: string, groupKey: string, value?: boolean) =>
  usePrefs.setState((p) => {
    const c = { ...(p.collapsed[key] ?? {}) };
    c[groupKey] = value ?? !c[groupKey];
    return { collapsed: { ...p.collapsed, [key]: c } };
  });
export const toggleExpanded = (id: ID, value?: boolean) =>
  usePrefs.setState((p) => ({ expanded: { ...p.expanded, [id]: value ?? !p.expanded[id] } }));

export function loadMe(workspaceId: string): ID | null {
  try {
    return localStorage.getItem(ME_KEY(workspaceId));
  } catch {
    return null;
  }
}
export function saveMe(workspaceId: string, id: ID | null) {
  try {
    if (id) localStorage.setItem(ME_KEY(workspaceId), id);
    else localStorage.removeItem(ME_KEY(workspaceId));
  } catch {
    /* ignorieren */
  }
}
