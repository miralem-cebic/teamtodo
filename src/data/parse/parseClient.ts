import { observeStamp } from '../clock';
import ParseWorker from './parseWorker?worker&inline';
import { parseFile, type ParseItem, type ParseKind, type ParseReply, type ParseRequest, type ParseResult } from './parseFile';

// Main-thread side of the parse worker. One message per call, so a whole startup or pull is one round trip.
// If the worker cannot start or fails, the same parse runs on the main thread: the results are the same either way.

interface Pending {
  items: ParseItem[];
  done: (results: ParseResult[]) => void;
}

let worker: Worker | null = null;
let failed = false;
let nextId = 1;
const pending = new Map<number, Pending>();

const onThisThread = (items: ParseItem[]): ParseResult[] => items.map((item) => parseFile(item.kind, item.text));

function giveUp(cause: unknown): null {
  console.warn('Parsing on the main thread: the parse worker failed', cause);
  failed = true;
  worker?.terminate();
  worker = null;
  for (const p of pending.values()) p.done(onThisThread(p.items));
  pending.clear();
  return null;
}

function connect(): Worker | null {
  if (failed) return null;
  if (worker) return worker;
  if (typeof Worker === 'undefined') {
    failed = true;
    return null;
  }
  try {
    worker = new ParseWorker();
  } catch (e) {
    return giveUp(e);
  }
  worker.onmessage = (e: MessageEvent<ParseReply>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    // the worker has its own clock: the newest timestamp it saw is observed here as well
    if (e.data.newest) observeStamp(e.data.newest);
    p.done(e.data.results);
  };
  worker.onerror = (e: ErrorEvent) => void giveUp(e.error ?? e.message);
  return worker;
}

/** Parses the files; the results are in the order of `items` */
export function parseFiles(items: ParseItem[]): Promise<ParseResult[]> {
  if (items.length === 0) return Promise.resolve([]);
  const w = connect();
  if (!w) return Promise.resolve(onThisThread(items));
  const id = nextId++;
  return new Promise((done) => {
    pending.set(id, { items, done });
    const request: ParseRequest = { id, items };
    w.postMessage(request);
  });
}

/** One file */
export async function parseOne(kind: ParseKind, text: string): Promise<ParseResult> {
  const [result] = await parseFiles([{ kind, text }]);
  return result ?? { ok: false, error: 'invalid', message: `${kind}: no parse result` };
}
