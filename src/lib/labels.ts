import { t, type MessageKey } from '../i18n';
import type { TaskStatus } from '../data/types';
import type { StorageErrorKind } from '../data/repository';
import type { Palette } from '../store/prefs';

// Labels that depend on the UI language. Call them at render time, not at module load.

export const STATUSES: TaskStatus[] = ['todo', 'doing', 'waiting'];

const STATUS_KEY: Record<TaskStatus | 'done', MessageKey> = {
  todo: 'status.todo',
  doing: 'status.doing',
  waiting: 'status.waiting',
  done: 'status.done',
};

export const statusLabel = (s: TaskStatus | 'done'): string => t(STATUS_KEY[s]);

const ERROR_KEY: Record<StorageErrorKind, MessageKey> = {
  permission: 'error.permission',
  notFound: 'error.notFound',
  quota: 'error.quota',
  newerSchema: 'error.newerSchema',
  other: 'error.other',
};

export const errorText = (kind: StorageErrorKind): string => t(ERROR_KEY[kind]);

const PALETTE_KEY: Record<Palette, MessageKey> = {
  standard: 'theme.standard',
  blue: 'theme.blue',
  green: 'theme.green',
  pink: 'theme.pink',
  lavender: 'theme.lavender',
  peach: 'theme.peach',
};

export const paletteLabel = (p: Palette): string => t(PALETTE_KEY[p]);
