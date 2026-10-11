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

const BATCH_CHARS = 1 << 20;

/**
 * Writes a JSON object whose big lists (for example all tasks of a backup) are serialized in batches:
 * the peak memory is one batch, not the whole file. The result is ordinary JSON.
 */
export async function writeLargeJson(
  dir: FileSystemDirectoryHandle,
  name: string,
  header: Record<string, unknown>,
  lists: Record<string, unknown[]>,
): Promise<number> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  try {
    let buf = '';
    const add = async (text: string) => {
      buf += text;
      if (buf.length >= BATCH_CHARS) {
        await w.write(buf);
        buf = '';
      }
    };
    await add('{');
    let first = true;
    const sep = () => {
      const s = first ? '' : ',';
      first = false;
      return s;
    };
    for (const [key, value] of Object.entries(header)) await add(`${sep()}${JSON.stringify(key)}:${JSON.stringify(value)}`);
    for (const [key, list] of Object.entries(lists)) {
      await add(`${sep()}${JSON.stringify(key)}:[`);
      for (let i = 0; i < list.length; i++) await add((i ? ',' : '') + JSON.stringify(list[i]));
      await add(']');
    }
    await add('}\n');
    if (buf) await w.write(buf);
    await w.close();
  } catch (e) {
    await w.abort().catch(() => undefined);
    throw e;
  }
  return (await fh.getFile()).lastModified;
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
