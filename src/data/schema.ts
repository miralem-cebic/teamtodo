import type { Color, ID, Project, Section, Task, User, WorkspaceFile } from './types';
import { COLORS } from './types';

export const SCHEMA_VERSION = 1;

export const newId = (): ID => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

export function makeTask(fields: Partial<Task> & { createdBy: ID }): Task {
  const at = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    parentId: null,
    projectId: null,
    sectionId: null,
    title: '',
    description: '',
    assigneeId: null,
    dueDate: null,
    dueTime: null,
    status: 'todo',
    completedAt: null,
    order: Date.now(),
    followerIds: [],
    attachments: [],
    comments: [],
    activity: [],
    createdAt: at,
    deletedAt: null,
    fieldUpdatedAt: {},
    ...fields,
  };
}

export function makeUser(name: string, color: Color): User {
  const at = nowIso();
  return { id: newId(), name, color, createdAt: at, updatedAt: at, deletedAt: null };
}

export function makeSection(name: string, order: number): Section {
  return { id: newId(), name, order, updatedAt: nowIso(), deletedAt: null };
}

export function makeProject(name: string, color: Color, order: number, sectionNames: string[] = ['Aufgaben']): Project {
  const at = nowIso();
  return {
    id: newId(),
    name,
    color,
    order,
    sections: sectionNames.map((n, i) => makeSection(n, i + 1)),
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
    deletedAt: null,
  };
}

export function makeWorkspace(name: string): WorkspaceFile {
  return { schemaVersion: SCHEMA_VERSION, id: newId(), name, createdAt: nowIso(), lastBackupDate: null, lastPurgeAt: null };
}

export const pickColor = (index: number): Color => COLORS[index % COLORS.length]!;
