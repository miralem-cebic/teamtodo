import { create } from 'zustand';
import { FsRepository } from '../data/fs/FsRepository';
import { clearDirHandle, loadDirHandle, saveDirHandle } from '../data/fs/handleStore';
import { StorageDir } from '../data/fs/storageFs';
import { ensureReadWrite } from '../data/fs/permission';
import { checkSupport } from '../data/fs/support';
import { EMERGENCY_KEY, LEGACY_EMERGENCY_KEY, Persister } from '../data/persister';
import { dailyBackup, purge, restoreBackup } from '../data/maintenance';
import { SyncEngine } from '../data/sync';
import { classifyError, type LoadResult } from '../data/repository';
import { errorText } from '../lib/labels';
import { t } from '../i18n';
import { emptySnapshot, sampleSnapshot } from '../data/seed';
import type { ID, Task } from '../data/types';
import { addUser, loadSnapshot, resetApp, setMe, showToast, useApp } from '../store/appStore';
import { loadMe, saveMe } from '../store/prefs';
import { readStorage } from '../lib/storage';

// Startup flow: check browser → data folder (saved/new) → permission → load → choose person → app.

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
  /** The chosen folder is not empty and contains no workspace */
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

/* ---------- Test mode: data folder in localStorage (for Playwright, ?e2e) ---------- */

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const E2E = params.has('e2e');
const E2E_NS = 'teamtodo.e2e';
/** Sync interval, can be shortened in test mode with ?poll=ms */
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

/** User gesture: choose a folder */
export async function pickFolder() {
  try {
    if (E2E) {
      StorageDir.clear(localStorage, E2E_NS);
      handle = new StorageDir(localStorage, E2E_NS).asHandle();
    } else {
      handle = await window.showDirectoryPicker!({ id: 'teamtodo', mode: 'readwrite' });
      await saveDirHandle(handle);
    }
    set({ dirName: handle.name });
    await openFolder();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return;
    set({ phase: 'failed', error: t('session.openFailed', { reason: errorText(classifyError(e)) }) });
  }
}

/** User gesture: renew the permission for the saved folder */
export async function reconnect() {
  if (!handle) return set({ phase: 'welcome' });
  try {
    if (await ensureReadWrite(handle, true)) await openFolder();
  } catch (e) {
    set({ phase: 'failed', error: errorText(classifyError(e)) });
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
    set({ phase: 'failed', error: errorText(classifyError(e)) });
  }
}

const SUBFOLDER = 'teamtodo';
const LEGACY_SUBFOLDER = 'Teamaufgaben'; // folder name before the rename; used only if it holds a workspace

/** The workspace folder inside the chosen folder: an existing one (also the legacy name), otherwise a new one */
async function findWorkspaceFolder(parent: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
  for (const name of [SUBFOLDER, LEGACY_SUBFOLDER]) {
    const dir = await parent.getDirectoryHandle(name).catch(() => undefined);
    if (dir && (await new FsRepository(dir).hasWorkspace())) return dir;
  }
  return parent.getDirectoryHandle(SUBFOLDER, { create: true });
}

/** Create the data structure. `subfolder`: use a subfolder "teamtodo" inside the chosen folder. */
export async function initialize(opts: { samples: boolean; subfolder: boolean }) {
  if (!handle) return;
  try {
    if (opts.subfolder) {
      handle = await findWorkspaceFolder(handle);
      if (!E2E) await saveDirHandle(handle);
      set({ dirName: handle.name });
      repo = new FsRepository(handle);
      if (await repo.hasWorkspace()) return load();
    }
    const name = handle.name;
    await repo!.initialize(opts.samples ? sampleSnapshot(name) : emptySnapshot(name));
    await load();
  } catch (e) {
    set({ phase: 'failed', error: t('session.setupFailed', { reason: errorText(classifyError(e)) }) });
  }
}

async function load() {
  const res = await repo!.loadAll();
  if (res.newerSchema) {
    set({ phase: 'failed', error: errorText('newerSchema') });
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

/** Restore unsaved changes from an earlier session (the folder was not reachable then) */
function recoverEmergencyCopy(workspaceId: ID) {
  try {
    const raw = readStorage(EMERGENCY_KEY, LEGACY_EMERGENCY_KEY);
    if (!raw) return;
    const copy = JSON.parse(raw) as { workspaceId?: ID; tasks?: Task[] };
    if (copy.workspaceId !== workspaceId || !copy.tasks?.length) return;
    const newest = (t: Task) => Object.values(t.fieldUpdatedAt).sort().pop() ?? t.createdAt;
    const cur = useApp.getState().tasks;
    const take = copy.tasks.filter((t) => !cur[t.id] || newest(t) > newest(cur[t.id]!));
    if (!take.length) return;
    useApp.setState({ tasks: { ...cur, ...Object.fromEntries(take.map((t) => [t.id, t])) } });
    showToast(t('toast.restored', { n: take.length }));
  } catch {
    /* ignore */
  }
}

function stopEngines() {
  sync?.stop();
  sync = null;
  persister?.stop();
  persister = null;
}

/** Daily backup and cleanup. Errors here must not disturb the work. */
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

/** After a save error: "Reconnect" (user gesture) */
export async function reconnectAndRetry() {
  if (!handle || !persister) return;
  try {
    if (await ensureReadWrite(handle, true)) await persister.retry();
  } catch (e) {
    showToast(errorText(classifyError(e)));
  }
}

export function retrySave() {
  return persister?.retry();
}

export const isE2E = () => E2E;

/* ---------- Backups, attachments ---------- */

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
