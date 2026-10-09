import { create } from 'zustand';
import { FsRepository } from '../data/fs/FsRepository';
import { clearDirHandle, loadDirHandle, saveDirHandle } from '../data/fs/handleStore';
import { StorageDir } from '../data/fs/storageFs';
import { ensureReadWrite } from '../data/fs/permission';
import { checkSupport } from '../data/fs/support';
import { EMERGENCY_KEY, Persister } from '../data/persister';
import { dailyBackup, purge, restoreBackup } from '../data/maintenance';
import { SyncEngine } from '../data/sync';
import { classifyError, ERROR_TEXT, type LoadResult } from '../data/repository';
import { emptySnapshot, sampleSnapshot } from '../data/seed';
import type { ID, Task } from '../data/types';
import { addUser, loadSnapshot, resetApp, setMe, showToast, useApp } from '../store/appStore';
import { loadMe, saveMe } from '../store/prefs';

// Ablauf beim Start: Browser prüfen → Datenordner (gespeichert/neu) → Berechtigung → Laden → Person wählen → App.

export type Phase =
  | 'checking'
  | 'unsupported'
  | 'welcome'
  | 'reconnect'
  | 'setup'
  | 'loading'
  | 'failed'
  | 'who'
  | 'ready';

interface SessionState {
  phase: Phase;
  dirName: string | null;
  /** Gewählter Ordner ist nicht leer und enthält keinen Workspace */
  dirNotEmpty: boolean;
  error: string | null;
  conflictCopies: string[];
  issues: LoadResult['issues'];
}

export const useSession = create<SessionState>()(() => ({
  phase: 'checking',
  dirName: null,
  dirNotEmpty: false,
  error: null,
  conflictCopies: [],
  issues: [],
}));
const set = useSession.setState;

let handle: FileSystemDirectoryHandle | null = null;
let repo: FsRepository | null = null;
let persister: Persister | null = null;
let sync: SyncEngine | null = null;

/* ---------- Testmodus: Datenordner in localStorage (für Playwright, ?e2e) ---------- */

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const E2E = params.has('e2e');
const E2E_NS = 'teamaufgaben.e2e';
/** Abgleich-Intervall, im Testmodus per ?poll=ms verkürzbar */
const POLL = E2E && params.get('poll') ? Number(params.get('poll')) : undefined;

if (E2E) {
  (window as unknown as { __e2e: unknown }).__e2e = {
    flush: () => persister?.flush(),
    sync: () => sync?.poll(),
    repo: () => repo,
  };
}

/* ---------- Start ---------- */

export async function boot() {
  if (E2E) {
    if (!StorageDir.exists(localStorage, E2E_NS)) return set({ phase: 'welcome' });
    handle = new StorageDir(localStorage, E2E_NS).asHandle();
    set({ dirName: handle.name });
    return openFolder();
  }
  if (!checkSupport().supported) return set({ phase: 'unsupported' });
  try {
    const h = await loadDirHandle();
    if (!h) return set({ phase: 'welcome' });
    handle = h;
    set({ dirName: h.name });
    if (await ensureReadWrite(h, false)) await openFolder();
    else set({ phase: 'reconnect' });
  } catch {
    set({ phase: 'welcome' });
  }
}

/** Nutzergeste: Ordner wählen */
export async function pickFolder() {
  try {
    if (E2E) {
      StorageDir.clear(localStorage, E2E_NS);
      handle = new StorageDir(localStorage, E2E_NS).asHandle();
    } else {
      handle = await window.showDirectoryPicker!({ id: 'teamaufgaben', mode: 'readwrite' });
      await saveDirHandle(handle);
    }
    set({ dirName: handle.name });
    await openFolder();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    set({ phase: 'failed', error: `Der Ordner konnte nicht geöffnet werden. ${ERROR_TEXT[classifyError(e)]}` });
  }
}

/** Nutzergeste: Berechtigung für den gespeicherten Ordner erneuern */
export async function reconnect() {
  if (!handle) return set({ phase: 'welcome' });
  try {
    if (await ensureReadWrite(handle, true)) await openFolder();
  } catch (e) {
    set({ phase: 'failed', error: ERROR_TEXT[classifyError(e)] });
  }
}

export async function forgetFolder() {
  stopEngines();
  repo = null;
  handle = null;
  if (E2E) StorageDir.clear(localStorage, E2E_NS);
  else await clearDirHandle().catch(() => undefined);
  resetApp();
  set({ phase: 'welcome', dirName: null, error: null, conflictCopies: [], issues: [] });
}

async function openFolder() {
  if (!handle) return;
  set({ phase: 'loading', error: null });
  repo = new FsRepository(handle);
  try {
    if (!(await repo.hasWorkspace())) {
      set({ phase: 'setup', dirNotEmpty: !(await repo.isEmpty()) });
      return;
    }
    await load();
  } catch (e) {
    set({ phase: 'failed', error: ERROR_TEXT[classifyError(e)] });
  }
}

/** Datenstruktur anlegen. `subfolder`: im gewählten Ordner einen Unterordner „Teamaufgaben“ verwenden. */
export async function initialize(opts: { samples: boolean; subfolder: boolean }) {
  if (!handle) return;
  try {
    if (opts.subfolder) {
      handle = await handle.getDirectoryHandle('Teamaufgaben', { create: true });
      if (!E2E) await saveDirHandle(handle);
      set({ dirName: handle.name });
      repo = new FsRepository(handle);
      if (await repo.hasWorkspace()) return load();
    }
    const name = handle.name;
    await repo!.initialize(opts.samples ? sampleSnapshot(name) : emptySnapshot(name));
    await load();
  } catch (e) {
    set({ phase: 'failed', error: `Anlegen fehlgeschlagen. ${ERROR_TEXT[classifyError(e)]}` });
  }
}

async function load() {
  const res = await repo!.loadAll();
  if (res.newerSchema) {
    set({ phase: 'failed', error: ERROR_TEXT.newerSchema });
    return;
  }
  stopEngines();
  loadSnapshot(res.snapshot);
  persister = new Persister(repo!);
  persister.start();
  recoverEmergencyCopy(res.snapshot.workspace.id);
  set({ conflictCopies: res.conflictCopies, issues: res.issues });
  sync = new SyncEngine(repo!, persister, (names) => set({ conflictCopies: names }), POLL);
  sync.start();
  void maintenance();

  const me = loadMe(res.snapshot.workspace.id);
  if (me && res.snapshot.users.some((u) => u.id === me && !u.deletedAt)) {
    setMe(me);
    set({ phase: 'ready' });
  } else set({ phase: 'who' });
}

/** Ungespeicherte Änderungen aus einer früheren Sitzung (Ordner war nicht erreichbar) zurückholen */
function recoverEmergencyCopy(workspaceId: ID) {
  try {
    const raw = localStorage.getItem(EMERGENCY_KEY);
    if (!raw) return;
    const copy = JSON.parse(raw) as { workspaceId?: ID; tasks?: Task[] };
    if (copy.workspaceId !== workspaceId || !copy.tasks?.length) return;
    const newest = (t: Task) => Object.values(t.fieldUpdatedAt).sort().pop() ?? t.createdAt;
    const cur = useApp.getState().tasks;
    const take = copy.tasks.filter((t) => !cur[t.id] || newest(t) > newest(cur[t.id]!));
    if (!take.length) return;
    useApp.setState({ tasks: { ...cur, ...Object.fromEntries(take.map((t) => [t.id, t])) } });
    showToast(`${take.length} ungespeicherte Änderungen wiederhergestellt`);
  } catch {
    /* ignorieren */
  }
}

function stopEngines() {
  sync?.stop();
  sync = null;
  persister?.stop();
  persister = null;
}

/** Tagessicherung und Aufräumen – Fehler hier dürfen die Arbeit nicht stören */
async function maintenance() {
  if (!repo) return;
  try {
    await dailyBackup(repo);
    await purge(repo);
  } catch (e) {
    console.warn('Pflege des Datenordners fehlgeschlagen', e);
  }
}

/* ---------- Person ---------- */

export function chooseUser(id: ID) {
  const ws = useApp.getState().workspace;
  if (ws) saveMe(ws.id, id);
  setMe(id);
  set({ phase: 'ready' });
}

export function createUserAndChoose(name: string) {
  chooseUser(addUser(name));
}

export function switchUser() {
  set({ phase: 'who' });
}

/* ---------- Laufzeit ---------- */

/** Nach Speicherfehler „Erneut verbinden“ (Nutzergeste) */
export async function reconnectAndRetry() {
  if (!handle || !persister) return;
  try {
    if (await ensureReadWrite(handle, true)) await persister.retry();
  } catch (e) {
    showToast(ERROR_TEXT[classifyError(e)]);
  }
}

export function retrySave() {
  return persister?.retry();
}

export const isE2E = () => E2E;

/* ---------- Sicherungen, Anhänge ---------- */

export const getRepo = () => repo;
export const syncNow = () => sync?.poll();

export async function backupNow() {
  if (!repo) return;
  await persister?.flush();
  await dailyBackup(repo, true);
}

export async function restore(name: string) {
  if (!repo) return;
  await persister?.flush();
  await restoreBackup(repo, name);
}
