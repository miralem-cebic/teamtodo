import { SCHEMA_VERSION } from './schema';
import { InvalidRecordError, validateProject, validateTask, validateUser, validateWorkspace } from './validate';
import type { Project, User } from './types';

// Migration layer: every file is upgraded to SCHEMA_VERSION when it is read, then normalized and validated.
// New migration: add an entry { from: n, up } to the matching list and increase SCHEMA_VERSION.

export type FileKind = 'workspace' | 'users' | 'projects' | 'task';

interface Migration {
  from: number;
  up: (raw: Record<string, unknown>) => Record<string, unknown>;
}

/** Version 2 changed projects only. The version is shared by all files, so the other file types need a step that changes nothing. */
const unchanged = (from: number): Migration => ({ from, up: (raw) => raw });

/**
 * Projects: `archivedAt` and `deletedAt` become one `state` with its time. Deleted wins over archived,
 * as it did before. A timestamp that is not a string is left as it is, so that validation rejects the record.
 */
function projectV1ToV2(raw: unknown): unknown {
  if (!isDoc(raw)) return raw;
  const { archivedAt, deletedAt, ...rest } = raw;
  if ((deletedAt !== undefined && deletedAt !== null && typeof deletedAt !== 'string') || (archivedAt !== undefined && archivedAt !== null && typeof archivedAt !== 'string')) {
    return raw;
  }
  const state =
    typeof deletedAt === 'string' ? { kind: 'deleted', at: deletedAt } : typeof archivedAt === 'string' ? { kind: 'archived', at: archivedAt } : { kind: 'active' };
  return { ...rest, state };
}

const MIGRATIONS: Record<FileKind, Migration[]> = {
  workspace: [unchanged(1)],
  users: [unchanged(1)],
  projects: [
    {
      from: 1,
      up: (doc) => ({ ...doc, projects: Array.isArray(doc['projects']) ? doc['projects'].map(projectV1ToV2) : doc['projects'] }),
    },
  ],
  task: [unchanged(1)],
};

export class NewerSchemaError extends Error {
  override name = 'NewerSchemaError';
  constructor(
    public readonly kind: FileKind,
    public readonly version: number,
  ) {
    super(`File (${kind}) has schema version ${version}, this app only knows up to ${SCHEMA_VERSION}.`);
  }
}

export class InvalidFileError extends Error {}

/** A record of a collection file that was left out, with the reason. */
export interface RejectedRecord {
  path: string;
  message: string;
}

type Doc = Record<string, unknown>;

const isDoc = (v: unknown): v is Doc => !!v && typeof v === 'object' && !Array.isArray(v);

/** Runs the migration steps of a file, so that it has the current schema version. */
function upgrade(kind: FileKind, raw: unknown): Doc {
  if (!isDoc(raw)) throw new InvalidFileError(`Invalid ${kind} file`);
  let doc = raw;
  let version = typeof doc['schemaVersion'] === 'number' ? doc['schemaVersion'] : 1;
  if (version > SCHEMA_VERSION) throw new NewerSchemaError(kind, version);
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[kind].find((m) => m.from === version);
    if (!step) throw new InvalidFileError(`No migration for ${kind} from version ${version}`);
    doc = step.up(doc);
    version += 1;
  }
  return { ...doc, schemaVersion: SCHEMA_VERSION };
}

/** Fills in fields that are absent. An explicit null is kept, so that validation rejects it where null is not allowed. */
const or = <T>(v: T | undefined, fallback: T): T => (v === undefined ? fallback : v);

function fillMissingTask(doc: Doc): Doc {
  const t = doc;
  return {
    ...t,
    parentId: or(t['parentId'], null),
    projectId: or(t['projectId'], null),
    sectionId: or(t['sectionId'], null),
    title: or(t['title'], ''),
    description: or(t['description'], ''),
    assigneeId: or(t['assigneeId'], null),
    dueDate: or(t['dueDate'], null),
    dueTime: or(t['dueTime'], null),
    status: or(t['status'], 'todo'),
    completedAt: or(t['completedAt'], null),
    order: or(t['order'], 0),
    followerIds: or(t['followerIds'], []),
    attachments: or(t['attachments'], []),
    comments: or(t['comments'], []),
    activity: or(t['activity'], []),
    deletedAt: or(t['deletedAt'], null),
    fieldUpdatedAt: or(t['fieldUpdatedAt'], {}),
  };
}

function fillMissingProject(doc: Doc): Doc {
  return { ...doc, sections: or(doc['sections'], []) };
}

/** Strict: every record must be valid, otherwise the whole file is rejected. Used for writes and backups. */
export function migrate<T>(kind: FileKind, raw: unknown): T {
  const doc = upgrade(kind, raw);
  switch (kind) {
    case 'task':
      return validate(() => validateTask(fillMissingTask(doc), kind)) as T;
    case 'workspace':
      return validate(() => validateWorkspace(doc, kind)) as T;
    case 'users':
    case 'projects': {
      const { items, rejected } = collection(kind, doc);
      const [first] = rejected;
      if (first) throw new InvalidFileError(`${kind}: ${first.message}`);
      return { schemaVersion: SCHEMA_VERSION, [kind]: items } as T;
    }
  }
}

/**
 * Lenient: a file whose envelope is fine but which contains broken records yields the valid records
 * and the rejected ones, so that one bad user or project does not hide the rest of the workspace.
 */
export function migrateCollection(kind: 'users' | 'projects', raw: unknown): { items: User[] | Project[]; rejected: RejectedRecord[] } {
  return collection(kind, upgrade(kind, raw));
}

function collection(kind: 'users' | 'projects', doc: Doc): { items: User[] | Project[]; rejected: RejectedRecord[] } {
  const field = kind;
  const list = doc[field] ?? [];
  if (!Array.isArray(list)) throw new InvalidFileError(`${kind}: expected a list`);
  const items: (User | Project)[] = [];
  const rejected: RejectedRecord[] = [];
  list.forEach((raw, i) => {
    const path = `${kind}[${i}]`;
    try {
      items.push(kind === 'users' ? validateUser(raw, path) : validateProject(isDoc(raw) ? fillMissingProject(raw) : raw, path));
    } catch (e) {
      rejected.push({ path, message: e instanceof InvalidRecordError ? e.message : String(e) });
    }
  });
  return { items: items as User[] | Project[], rejected };
}

function validate<T>(run: () => T): T {
  try {
    return run();
  } catch (e) {
    if (e instanceof InvalidRecordError) throw new InvalidFileError(e.message);
    throw e;
  }
}
