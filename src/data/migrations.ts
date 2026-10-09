import { SCHEMA_VERSION } from './schema';
import type { ProjectsFile, Task, UsersFile, WorkspaceFile } from './types';

// Migrationsschicht: Jede Datei wird beim Lesen auf SCHEMA_VERSION gehoben.
// Neue Migration: Eintrag { from: n, up } in der passenden Liste ergänzen und SCHEMA_VERSION erhöhen.

export type FileKind = 'workspace' | 'users' | 'projects' | 'task';

interface Migration {
  from: number;
  up: (raw: Record<string, unknown>) => Record<string, unknown>;
}

const MIGRATIONS: Record<FileKind, Migration[]> = {
  workspace: [],
  users: [],
  projects: [],
  task: [],
};

export class NewerSchemaError extends Error {
  override name = 'NewerSchemaError';
  constructor(
    public readonly kind: FileKind,
    public readonly version: number,
  ) {
    super(`Datei (${kind}) hat Schema-Version ${version}, diese App kennt nur bis ${SCHEMA_VERSION}.`);
  }
}

export class InvalidFileError extends Error {}

export function migrate<T>(kind: FileKind, raw: unknown): T {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InvalidFileError(`Ungültige ${kind}-Datei`);
  let doc = raw as Record<string, unknown>;
  let version = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 1;
  if (version > SCHEMA_VERSION) throw new NewerSchemaError(kind, version);
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[kind].find((m) => m.from === version);
    if (!step) throw new InvalidFileError(`Keine Migration für ${kind} von Version ${version}`);
    doc = step.up(doc);
    version += 1;
  }
  return normalize(kind, { ...doc, schemaVersion: SCHEMA_VERSION }) as T;
}

/** Fehlende optionale Felder ergänzen, damit der Rest der App sich darauf verlassen kann. */
function normalize(kind: FileKind, doc: Record<string, unknown>): unknown {
  switch (kind) {
    case 'task': {
      const t = doc as unknown as Task;
      return {
        ...t,
        parentId: t.parentId ?? null,
        projectId: t.projectId ?? null,
        sectionId: t.sectionId ?? null,
        title: t.title ?? '',
        description: t.description ?? '',
        assigneeId: t.assigneeId ?? null,
        dueDate: t.dueDate ?? null,
        dueTime: t.dueTime ?? null,
        status: t.status ?? 'todo',
        completedAt: t.completedAt ?? null,
        order: typeof t.order === 'number' ? t.order : 0,
        followerIds: t.followerIds ?? [],
        attachments: t.attachments ?? [],
        comments: t.comments ?? [],
        activity: t.activity ?? [],
        deletedAt: t.deletedAt ?? null,
        fieldUpdatedAt: t.fieldUpdatedAt ?? {},
      } satisfies Task;
    }
    case 'users':
      return { ...doc, users: (doc as unknown as UsersFile).users ?? [] };
    case 'projects': {
      const f = doc as unknown as ProjectsFile;
      return { ...f, projects: (f.projects ?? []).map((p) => ({ ...p, sections: p.sections ?? [] })) };
    }
    case 'workspace':
      return doc as unknown as WorkspaceFile;
  }
}
