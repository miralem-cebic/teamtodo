// Stores the FileSystemDirectoryHandle of the data folder in IndexedDB,
// so the app can offer "Continue with folder …" after a restart.
const DB_NAME = 'teamtodo';
const LEGACY_DB_NAME = 'teamaufgaben'; // database name before the rename to teamtodo
const STORE = 'handles';
const KEY = 'dataDir';

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(name: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb(name);
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function legacyDbExists(): Promise<boolean> {
  const dbs = await indexedDB.databases?.().catch(() => undefined);
  return !!dbs?.some((d) => d.name === LEGACY_DB_NAME);
}

export async function loadDirHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  const current = await tx<FileSystemDirectoryHandle | undefined>(DB_NAME, 'readonly', (s) =>
    s.get(KEY) as IDBRequest<FileSystemDirectoryHandle | undefined>,
  );
  if (current || !(await legacyDbExists())) return current;
  // Move the handle over from the database used before the rename
  const legacy = await tx<FileSystemDirectoryHandle | undefined>(LEGACY_DB_NAME, 'readonly', (s) =>
    s.get(KEY) as IDBRequest<FileSystemDirectoryHandle | undefined>,
  );
  if (legacy) {
    await saveDirHandle(legacy);
    await tx(LEGACY_DB_NAME, 'readwrite', (s) => s.delete(KEY)).catch(() => undefined);
  }
  return legacy;
}
export const saveDirHandle = (h: FileSystemDirectoryHandle) => tx(DB_NAME, 'readwrite', (s) => s.put(h, KEY)).then(() => undefined);
export async function clearDirHandle(): Promise<void> {
  await tx(DB_NAME, 'readwrite', (s) => s.delete(KEY));
  // also forget the handle from the database used before the rename, or it would come back
  if (await legacyDbExists()) await tx(LEGACY_DB_NAME, 'readwrite', (s) => s.delete(KEY)).catch(() => undefined);
}
