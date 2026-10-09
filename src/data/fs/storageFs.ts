// Nachbildung eines Ordners auf Basis von Web Storage (localStorage).
// Nur für Ende-zu-Ende-Tests (?e2e): Zwei Browserfenster desselben Profils teilen sich
// localStorage und damit diesen „Ordner“ – so lässt sich die Mehrbenutzer-Synchronisation testen.

interface Entry {
  /** Inhalt als Text oder data:-URL (Binärdateien) */
  c: string;
  /** lastModified */
  m: number;
  /** Inhalt ist data:-URL */
  b?: boolean;
  t?: string;
}

const join = (a: string, b: string) => (a ? `${a}/${b}` : b);

function dataUrlToBlob(url: string, type?: string): Blob {
  const [, b64 = ''] = url.split(',');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

class StorageFile {
  readonly kind = 'file' as const;
  constructor(
    private readonly s: Storage,
    private readonly key: string,
    readonly name: string,
  ) {}

  private read(): Entry {
    const raw = this.s.getItem(this.key);
    if (!raw) throw new DOMException(`${this.name} nicht gefunden`, 'NotFoundError');
    return JSON.parse(raw) as Entry;
  }

  async getFile() {
    const e = this.read();
    const body = e.b ? dataUrlToBlob(e.c, e.t) : e.c;
    return new File([body], this.name, { lastModified: e.m, type: e.t ?? '' });
  }

  async createWritable() {
    const parts: (string | Blob)[] = [];
    return {
      write: async (d: string | Blob) => {
        parts.push(d);
      },
      close: async () => {
        const prev = this.s.getItem(this.key);
        const m = Math.max(Date.now(), prev ? (JSON.parse(prev) as Entry).m + 1 : 0);
        const binary = parts.some((p) => typeof p !== 'string');
        const entry: Entry = binary
          ? { c: await blobToDataUrl(new Blob(parts)), m, b: true, t: parts.find((p): p is Blob => typeof p !== 'string')?.type }
          : { c: parts.join(''), m };
        this.s.setItem(this.key, JSON.stringify(entry));
      },
      abort: async () => undefined,
    };
  }

  async queryPermission() {
    return 'granted' as PermissionState;
  }
  async requestPermission() {
    return 'granted' as PermissionState;
  }
}

export class StorageDir {
  readonly kind = 'directory' as const;

  constructor(
    private readonly s: Storage,
    private readonly ns: string,
    private readonly path = '',
    readonly name = 'teamtodo-Test',
  ) {
    if (!path) s.setItem(`${ns}:d:`, '1');
  }

  private fk = (p: string) => `${this.ns}:f:${p}`;
  private dk = (p: string) => `${this.ns}:d:${p}`;

  /** Gibt es diesen Ordner schon (wurde er je angelegt)? */
  static exists(s: Storage, ns: string) {
    return s.getItem(`${ns}:d:`) !== null;
  }

  static clear(s: Storage, ns: string) {
    for (const k of Object.keys(s)) if (k.startsWith(`${ns}:`)) s.removeItem(k);
  }

  async getFileHandle(name: string, opts?: { create?: boolean }) {
    const p = join(this.path, name);
    if (this.s.getItem(this.fk(p)) === null) {
      if (!opts?.create) throw new DOMException(`${name} nicht gefunden`, 'NotFoundError');
      this.s.setItem(this.fk(p), JSON.stringify({ c: '', m: Date.now() } satisfies Entry));
    }
    return new StorageFile(this.s, this.fk(p), name);
  }

  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    const p = join(this.path, name);
    if (this.s.getItem(this.dk(p)) === null) {
      if (!opts?.create) throw new DOMException(`${name} nicht gefunden`, 'NotFoundError');
      this.s.setItem(this.dk(p), '1');
    }
    return new StorageDir(this.s, this.ns, p, name);
  }

  async removeEntry(name: string, opts?: { recursive?: boolean }) {
    const p = join(this.path, name);
    let found = false;
    for (const k of Object.keys(this.s)) {
      if (k === this.fk(p) || k === this.dk(p) || (opts?.recursive && (k.startsWith(this.fk(p) + '/') || k.startsWith(this.dk(p) + '/')))) {
        this.s.removeItem(k);
        found = true;
      }
    }
    if (!found) throw new DOMException(`${name} nicht gefunden`, 'NotFoundError');
  }

  async *entries(): AsyncIterableIterator<[string, StorageFile | StorageDir]> {
    const prefixF = this.fk(this.path ? this.path + '/' : '');
    const prefixD = this.dk(this.path ? this.path + '/' : '');
    for (const k of Object.keys(this.s)) {
      if (k.startsWith(prefixF)) {
        const rest = k.slice(prefixF.length);
        if (rest && !rest.includes('/')) yield [rest, new StorageFile(this.s, k, rest)];
      } else if (k.startsWith(prefixD)) {
        const rest = k.slice(prefixD.length);
        if (rest && !rest.includes('/')) yield [rest, new StorageDir(this.s, this.ns, join(this.path, rest), rest)];
      }
    }
  }

  async queryPermission() {
    return 'granted' as PermissionState;
  }
  async requestPermission() {
    return 'granted' as PermissionState;
  }

  asHandle() {
    return this as unknown as FileSystemDirectoryHandle;
  }
}
