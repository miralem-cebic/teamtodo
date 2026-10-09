export interface JsonRead<T> {
  data: T;
  lastModified: number;
}

export async function readJson<T>(dir: FileSystemDirectoryHandle, name: string): Promise<JsonRead<T> | null> {
  let fh: FileSystemFileHandle;
  try {
    fh = await dir.getFileHandle(name);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') return null;
    throw e;
  }
  const file = await fh.getFile();
  return { data: JSON.parse(await file.text()) as T, lastModified: file.lastModified };
}

export async function writeJson(dir: FileSystemDirectoryHandle, name: string, data: unknown): Promise<number> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  try {
    await w.write(JSON.stringify(data, null, 2) + '\n');
    await w.close();
  } catch (e) {
    await w.abort().catch(() => undefined);
    throw e;
  }
  return (await fh.getFile()).lastModified;
}

export async function listEntries(dir: FileSystemDirectoryHandle) {
  const out: { name: string; kind: 'file' | 'directory'; lastModified?: number; size?: number }[] = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'file') {
      const f = await (h as FileSystemFileHandle).getFile();
      out.push({ name, kind: 'file', lastModified: f.lastModified, size: f.size });
    } else out.push({ name, kind: 'directory' });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
