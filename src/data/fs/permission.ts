/**
 * Prüft bzw. erneuert die Schreibberechtigung für den Datenordner.
 * `request` darf nur aus einer Nutzergeste (Klick) heraus true sein.
 */
export async function ensureReadWrite(handle: FileSystemDirectoryHandle, request: boolean): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if (!request) return false;
  return (await handle.requestPermission(opts)) === 'granted';
}
