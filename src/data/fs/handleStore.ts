// Speichert das FileSystemDirectoryHandle des Datenordners in IndexedDB,
// damit die App nach einem Neustart „Weiter mit Ordner …“ anbieten kann.
const DB_NAME = 'teamtodo';
const STORE = 'handles';
const KEY = 'dataDir';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
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

export const loadDirHandle = () =>
  tx<FileSystemDirectoryHandle | undefined>('readonly', (s) => s.get(KEY) as IDBRequest<FileSystemDirectoryHandle | undefined>);
export const saveDirHandle = (h: FileSystemDirectoryHandle) => tx('readwrite', (s) => s.put(h, KEY)).then(() => undefined);
export const clearDirHandle = () => tx('readwrite', (s) => s.delete(KEY)).then(() => undefined);
