import { InvalidFileError, migrate, migrateCollection, NewerSchemaError, type FileKind, type RejectedRecord } from '../migrations';

// Reading one file of the data folder: JSON.parse, then upgrade, normalize and validate.
// Runs in the parse worker (parseWorker.ts) or, when no worker is available, on the main thread (parseClient.ts).
// Pure: no DOM, no store, so both places give the same result.

export type ParseKind = FileKind;

export interface ParseItem {
  kind: ParseKind;
  text: string;
}

export type ParseResult =
  | { ok: true; value: unknown; rejected: RejectedRecord[] }
  | { ok: false; error: 'newer'; version: number; message: string }
  | { ok: false; error: 'invalid'; message: string };

/**
 * Users and projects are read leniently: a broken record is reported and the rest of the file is kept.
 * Tasks and the workspace are strict: the whole file is rejected.
 */
export function parseFile(kind: ParseKind, text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'invalid', message: e instanceof Error ? e.message : String(e) };
  }
  try {
    if (kind === 'users' || kind === 'projects') {
      const res = migrateCollection(kind, raw);
      return { ok: true, value: res.items, rejected: res.rejected };
    }
    return { ok: true, value: migrate(kind, raw), rejected: [] };
  } catch (e) {
    if (e instanceof NewerSchemaError) return { ok: false, error: 'newer', version: e.version, message: e.message };
    return { ok: false, error: 'invalid', message: e instanceof Error ? e.message : String(e) };
  }
}

/** The error of a failed parse, in the form the migrations have always thrown it */
export function parseFailure(kind: ParseKind, r: Extract<ParseResult, { ok: false }>): Error {
  return r.error === 'newer' ? new NewerSchemaError(kind, r.version) : new InvalidFileError(r.message);
}

/** Several files in one message: one round trip for a whole startup or pull */
export interface ParseRequest {
  id: number;
  items: ParseItem[];
}

export interface ParseReply {
  id: number;
  results: ParseResult[];
  /** Newest timestamp the worker has seen, so that the main thread's clock can observe it too */
  newest: string | null;
}
