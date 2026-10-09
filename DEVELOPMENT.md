# Development guide

teamtodo is a local web app (React 18, TypeScript, Vite) for task management, modeled after the interaction style of Asana. It runs without a server: open `dist/index.html` directly via `file://` in Chrome or Edge. Data is stored through the File System Access API in a folder chosen by the user.

## Setup

Requirements: Node.js 20 or newer (CI uses Node 22).

```bash
npm ci             # install exact dependencies from package-lock.json
npm run dev        # development server at http://localhost:5173
```

Tip: the project should not live inside a synced folder such as OneDrive, because `node_modules` contains tens of thousands of files. Sync only the build output.

## Scripts

| Script                         | Purpose                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                  | Vite development server                                                                                        |
| `npm run build`                | Type check and production build into `dist/`                                                                   |
| `npm run typecheck`            | TypeScript check only                                                                                          |
| `npm run lint`                 | ESLint                                                                                                         |
| `npm test`                     | Unit tests (Vitest): data logic, repository, persister, grouping, date parser                                  |
| `npm run test:e2e`             | Build, then Playwright tests against `dist/index.html` via `file://` in installed Chrome                       |
| `npm run check:file`           | Build acceptance test: opens `dist/index.html` via `file://` and checks console, secure context, API, and font |
| `npm run deploy -- "<folder>"` | Copy `dist/` into a target folder (for example OneDrive)                                                       |

Playwright uses the installed Chrome (`channel: 'chrome'`), so no browsers are downloaded. To see the browser window, set `HEADED=1`.

## Building for `file://`

Chrome blocks module scripts and CORS requests under `file://`. Therefore:

- `vite.config.ts`: `format: 'iife'`, no code splitting, `base: './'`, `modulePreload: false`.
- `build/fileProtocol.ts`: a Vite plugin that removes `type="module"` and `crossorigin` from the built `index.html` and loads the script with `defer`. It fails the build if `type="module"` remains.
- The Hanken Grotesk font (`@fontsource`) is embedded as a `data:` URL in the CSS.

## Architecture

```text
src/
  main.tsx, App.tsx          Entry point; shows onboarding or the workspace
  app/session.ts             Startup: check browser → folder → permission → load → person
  data/
    types.ts                 Data model
    schema.ts                Factories, SCHEMA_VERSION
    migrations.ts            Migration layer (per file type), normalization
    repository.ts            Repository interface, error classes
    fs/FsRepository.ts       Implementation on FileSystemDirectoryHandle
    fs/memoryFs.ts           In-memory folder (tests, ?e2e)
    fs/handleStore.ts        Folder handle stored in IndexedDB
    persister.ts             Observes the store, writes changed entities (400 ms debounce)
    merge.ts                 Field-level merge (tasks, projects, team)
    sync.ts                  SyncEngine (every 10 s + window focus), applying external changes
    maintenance.ts           Daily backup (14 kept), purge after 30 days, restore
    fs/storageFs.ts          Folder in localStorage (E2E: two windows share one folder)
    seed.ts                  Sample data
  store/
    appStore.ts              State (zustand) and all actions, undo stack, panel, focus
    selectors.ts             Visibility, hierarchy, grouping, filters, sorting (pure, tested)
    prefs.ts                 Per-browser settings (localStorage)
  features/                  onboarding, workspace, shell (sidebar/header/toolbar/data dialog), list, board,
                             task-panel (feed, attachments, followers), inbox, dnd, keys
  components/                Popover/menu, person and date pickers, fields, toast, dialog, avatar, icon
  hooks/listNav.ts           DOM helpers for keyboard navigation
  styles/                    tokens.css, base.css, components.css (from the prototype), app.css
```

### Data flow

1. The UI calls actions in `store/appStore.ts`. They change the state immediately (optimistic) and immutably (new objects).
2. `Persister` compares object references between the old and new state and queues changed tasks, `projects.json`, and `users.json`. Objects that are already saved are tracked in a `WeakSet`.
3. After 400 ms of inactivity it writes through the `Repository`. Status → `save` in the store → header.
4. Failed writes stay in the queue. An emergency copy is kept in `localStorage` (`teamtodo.unsaved.v1`) and restored on the next start.

### Synchronization and merging

- `FsRepository.known` remembers the `lastModified` of every file it read or wrote.
- **Writing** (`writeChecked`): if the file is newer than the known version, it is read and merged with `merge.ts`, and the result is written. The persister takes it into the store (`integrateWrittenTask`).
- **Polling** (`SyncEngine.poll`, every 10 s, on `focus` / `visibilitychange`): waits for ongoing writes, reads only changed files (`pullChanges`), and detects removed tasks and conflict copies. `applyChanges`: if the local task is clean, it is replaced; if it has unsaved changes, the two are merged and then written. Visibly changed rows briefly flash (`flash`).
- **Tasks:** per field, the newer `fieldUpdatedAt` value wins (on a tie, the local value). Comments, activity, and attachments are combined by ID. `removedAt` / `deletedAt` stay set.
- **Projects:** project fields follow the project's `updatedAt`; sections are merged individually by their own `updatedAt`. Section changes do not touch the project's `updatedAt`.
- **Team:** combined by ID; the newer entry wins.

### Maintenance

- `dailyBackup`: if `workspace.lastBackupDate` is not today → write `backups/YYYY-MM-DD.json` (full state without attachments), and remove all but the 14 newest.
- `purge`: runs at most once per day. Removes task files (including `attachments/<id>`) whose `deletedAt` (or that of their parent task or project) is older than 30 days, plus old sections, projects, and removed attachments.
- `restoreBackup`: creates a backup first (`vor-wiederherstellung-…`), sets all fields with a new timestamp (so they win the merge), and soft-deletes tasks and projects that do not exist in the backup.

### Drag and drop

`features/dnd/TaskDnd.tsx` uses dnd-kit (mouse and touch). IDs: `t:<id>` task, `p:<id>` subtask in the panel, `s:<id>` section, `g:<key>` group end / column. Before/after is computed from the real pointer position and the current position of the target, not from dnd-kit deltas (which include auto-scroll). Dropping into another group applies `group.apply`; groups with `apply: null` (Overdue) reject drops. Keyboard: Ctrl/⌘ + Shift + ↑/↓.

### Inbox

`features/inbox/inbox.ts` derives entries from `activity` (assigned, completed on followed tasks) and `comments` (mention, comment on followed tasks) from the last 30 days, only for actions by others. Read status is stored in `localStorage` under `teamtodo.inbox.<workspaceId>.<userId>` (`readBefore` + IDs).

### Important rules

- **Drafts:** new empty rows have `draft: true` and are never written. A file is created only once the row has a title.
- **Soft delete:** `deletedAt` is set instead of deleting the file (tasks, sections, projects). Removed permanently after 30 days (`maintenance.ts`).
- **`fieldUpdatedAt`:** every change to a mergeable field sets that field's timestamp. This is the basis of the field-level merge.
- **Undo:** entries store the previous state of the affected tasks and projects. Undoing resets changed fields with a new timestamp; comments and activity are kept.
- **Focus:** `requestFocus(id, scope)` + `claimFocus()`: each request takes effect exactly once (rows that move to another group do not steal focus again).
- **Who am I:** stored per browser in `localStorage` (`teamtodo.me.<workspaceId>`), not in the shared folder.

## Data format (schema version 1)

```text
<data folder>/
  workspace.json   { schemaVersion, id, name, createdAt, lastBackupDate, lastPurgeAt }
  users.json       { schemaVersion, users: User[] }
  projects.json    { schemaVersion, projects: Project[] }   sections are stored in the project (sections[])
  tasks/<uuid>.json  Task (one file per main or subtask)
  attachments/<taskId>/<file>
  backups/<YYYY-MM-DD>.json
```

Types are defined in `src/data/types.ts`. Important task fields:

| Field                    | Meaning                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `parentId`               | Parent task (subtasks, multi-level)                                                                |
| `projectId`, `sectionId` | Project and section; without a project, only visible in "Meine Aufgaben"; subtasks have no section |
| `status`                 | `todo` / `doing` / `waiting`                                                                       |
| `completedAt`            | Set = completed (status is kept so the task can be reopened)                                       |
| `order`                  | Fractional index among siblings or within the section                                              |
| `dueDate`, `dueTime`     | `YYYY-MM-DD`, optional `HH:MM`                                                                     |
| `activity[]`             | Type and data (text is generated at display time)                                                  |
| `fieldUpdatedAt`         | Timestamp per field for merging                                                                    |
| `tags`, `recurrence`     | Reserved for later                                                                                 |

OneDrive conflict copies (file names that are not a UUID, for example `<uuid>-LAPTOP-1.json` or `users-MacBook.json`) are ignored and counted when loading. Helper files (`*.crswap`, `.DS_Store`, `~$…`) are skipped.

### Migrations

To introduce a new schema version, increase `SCHEMA_VERSION` in `data/schema.ts` and add `{ from: n, up(raw) }` in `data/migrations.ts` for each affected file type. Files are migrated up when read and saved in the new version on the next write. Files from a newer version block startup with a message.

## Tests

- **Unit** (`tests/unit`): repository, migrations, store actions including undo, grouping, persister including the error path, date parser, merging, two clients on one folder (conflicting writes, change detection), attachments, backups, cleanup, restore.
- **E2E** (`tests/e2e`): real build under `file://`. Covered: five tasks and three subtasks entered only by keyboard; the panel without page navigation and without losing scroll position; undo; reload; projects and sections; **two windows see each other's changes within 10 s**; **simultaneous changes to different fields are kept**; a comment with @mention → inbox; attachments; filter, grouping, and sorting; drag and drop (list, sections, board, rejection on "Überfällig"); board with Enter chain; restoring a backup.

Test mode `?e2e`: replaces the native folder dialog with a folder in `localStorage` (`data/fs/storageFs.ts`). Several windows of the same browser profile share it, which makes multi-user behavior testable. `window.__e2e` provides `flush()`, `sync()`, and `repo()`. `?poll=ms` shortens the polling interval. Only active with this URL parameter.
