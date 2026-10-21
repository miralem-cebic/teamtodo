# Development guide

teamtodo is a local web app (React 19, TypeScript, Vite) for task management, modeled after the interaction style of Asana. It runs without a server: open `dist/index.html` directly via `file://` in Chrome or Edge. Data is stored through the File System Access API in a folder chosen by the user.

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
- The same plugin adds a Content Security Policy to the built `index.html` (`CONTENT_SECURITY_POLICY` in `build/fileProtocol.ts`): no network access (`connect-src 'none'`), scripts only from the build. It is not added in `npm run dev`, because the dev server injects inline scripts. `npm run check:file` shows a refused inline script as a console error, which fails the check.

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
    validate.ts              Runtime checks for every file, backup and emergency copy read (hand-written)
    parse/parseFile.ts       One file: JSON.parse, then migrate and validate (pure, runs in the worker or on the main thread)
    parse/parseWorker.ts     Parse worker, built into the app inline (`?worker&inline`); started from a blob: URL (CSP `worker-src`)
    parse/parseClient.ts     Sends the texts of a load or pull to the worker in one message; falls back to the main thread
    fs/fileNames.ts          Safe attachment file names (sanitize on write, check on read)
    sync.ts                  SyncEngine (every 10 s + window focus), applying external changes
    maintenance.ts           Daily backup (14 kept), purge after 30 days, restore
    fs/storageFs.ts          Folder in localStorage (E2E: two windows share one folder)
    seed.ts                  Sample data
  store/
    appStore.ts              State (zustand) and all actions, undo stack, panel, focus
    selectors.ts             Visibility, hierarchy, grouping, filters, sorting, project order (pure, tested)
    prefs.ts                 Per-browser settings (localStorage)
  lib/tags.ts                Tag names: normalizing, uniqueness, list of tags in use
  components/ErrorBoundary.tsx  Keeps a failing part of the screen from taking down the rest
  app/crashReporting.ts      Global handlers for uncaught errors (emergency copy, then a toast)
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
4. The repository reads and writes return a `Result` (`data/result.ts`): a failed operation is a value that the caller must handle, not an exception. The persister and the sync engine handle failures explicitly. Exceptions from the browser API are turned into results once, in `FsRepository`. Code that wants exceptions (startup, maintenance) calls `must()` explicitly.
5. Failed writes stay in the queue. An emergency copy is kept in `localStorage` (`teamtodo.unsaved.v1`) and restored on the next start.

### Synchronization and merging

- `FsRepository.known` remembers the `lastModified` of every file it read or wrote.
- **Writing** (`writeChecked`): if the file is newer than the known version, it is read and merged with `merge.ts`, and the result is written. The persister takes it into the store (`integrateWrittenTask`).
- **Polling** (`SyncEngine.poll`, every 10 s, on `focus` / `visibilitychange`): waits for ongoing writes, reads only changed files (`pullChanges`), and detects removed tasks and conflict copies. `applyChanges`: if the local task is clean, it is replaced; if it has unsaved changes, the two are merged and then written. Visibly changed rows briefly flash (`flash`).
- **Tasks:** per field, the newer `fieldUpdatedAt` value wins (on a tie, the local value). Comments, activity, and attachments are combined by ID. `removedAt` / `deletedAt` stay set.
- **Clean local tasks are merged, not replaced:** if a saved task holds a newer value that the file lacks (another client wrote the file at the same moment and overwrote it), the poll keeps that value and writes it again.
- **Timestamps** come from `data/clock.ts`: a hybrid clock. Every timestamp read from the folder is observed, and a new one is never earlier than the newest seen. A device with a slow clock therefore cannot make its later edits look older. Limit: a device with a clock far in the future moves the stamps of everyone after it.
- **Users and projects** are saved leniently: a broken record from another client is kept in the file unchanged, and the valid records are merged and saved.
- **Projects:** project fields follow the project's `updatedAt`; sections are merged individually by their own `updatedAt`. Section changes do not touch the project's `updatedAt`.
- **Team:** combined by ID; the newer entry wins.

### Maintenance

- `dailyBackup`: if `workspace.lastBackupDate` is not today → write `backups/YYYY-MM-DD.json` (full state without attachments), and remove all but the 14 newest.
- `purge`: runs at most once per day. Removes task files (including `attachments/<id>`) whose `deletedAt` (or that of their parent task, or the deletion time of their project) is older than 30 days, plus old sections, projects, and removed attachments.
- `restoreBackup`: creates a backup first (`before-restore-…`), sets all fields with a new timestamp (so they win the merge), and soft-deletes tasks and projects that do not exist in the backup.

### Drag and drop

`features/dnd/TaskDnd.tsx` uses dnd-kit (mouse and touch). IDs: `t:<id>` task, `p:<id>` subtask in the panel, `s:<id>` section, `g:<key>` group end / column. Before/after is computed from the real pointer position and the current position of the target, not from dnd-kit deltas (which include auto-scroll). Dropping into another group applies `group.apply`; groups with `apply: null` (Overdue) reject drops. Keyboard: Ctrl/⌘ + Shift + ↑/↓.

### Inbox

`features/inbox/inbox.ts` derives entries from `activity` (assigned, completed on followed tasks) and `comments` (mention, comment on followed tasks) from the last 30 days, only for actions by others. Read status is stored in `localStorage` under `teamtodo.inbox.<workspaceId>.<userId>` (`readBefore` + IDs).

### Boundary rules

- Everything read from the data folder, a backup or the `localStorage` emergency copy goes through `validate.ts` (via `migrate` in `data/migrations.ts`). Wrong types and unknown values are errors; a missing field is filled in, an explicit `null` is only accepted where null is allowed.
- Users and projects are read leniently on load: a broken record is left out and reported as a load issue (`LoadResult.issues`). Writes, backups and restores are strict.
- IDs from file content must match `[A-Za-z0-9_-]` and must not be names that exist on every object (`__proto__`, `constructor`, …).
- IDs are branded types (`data/ids.ts`): `TaskId`, `ProjectId`, `SectionId`, `UserId`, `CommentId`, `ActivityId`, `AttachmentId`. The brand is added in the validators (after the check) and by the generators. The UI brands an ID only where it reads one from the DOM or from storage it has just checked. The workspace ID is still a plain string.
- Project state: the file stores `Project.state` (`active`, `archived` or `deleted`, each with its time) and the `template` flag. `projectStatus()` (`store/selectors.ts`) combines them into `active`, `archived`, `template` or `deleted`. Code asks for the status instead of combining the fields itself.
- `switch` over a union must be exhaustive (`@typescript-eslint/switch-exhaustiveness-check`, type-aware lint for `src/`), and `noImplicitReturns` is on.
- Attachment names read from a task file are checked (`fileNames.ts`) before any file access.

### Important rules

- **Drafts:** new empty rows have `draft: true` and are never written. A file is created only once the row has a title.
- **Soft delete:** `deletedAt` is set instead of deleting the file (tasks, sections); a project gets `state: { kind: 'deleted', at }`. Removed permanently after 30 days (`maintenance.ts`).
- **`fieldUpdatedAt`:** every change to a mergeable field sets that field's timestamp. This is the basis of the field-level merge.
- **Templates:** a template is a project with `template: true` in `projects.json`. It is excluded from the project list and from all task views (`hiddenProjectIds` in `store/selectors.ts`). Its tasks are the blueprint: `saveAsTemplate` and `addProjectFromTemplate` copy the structure (`copyTaskTree`) without assignees, due dates, followers, comments or status.
- **Tags:** `Task.tags` is a list of short names (`lib/tags.ts`), unique per task without regard to case. Tags are merged like other fields. Templates copy them.
- **Tag management:** the "Manage tags…" link in the tags filter opens `features/shell/TagsDialog.tsx`. Rename, merge and "remove from all tasks" go through `renameTag` and `removeTagEverywhere` in `store/appStore.ts`, which change every task that has the tag in one undoable step. Renaming onto a tag that already exists merges the two (no duplicate per task, see `renameInList` in `lib/tags.ts`).
- **Group by tag:** a task is listed under its first tag only, so one task is one row in one group (drag and drop needs unique rows). Tasks without tags are in "No tag". Tag groups are not drop targets: a task cannot be dragged into a tag group, because that would change its tags. Use the task panel to change tags.
- **Pinned projects:** `Project.pinned`. The sidebar shows pinned projects first, then by `order`. Moves (`reorderWithinGroup`) stay inside a group.
- **Links:** text is stored as typed. `lib/links.ts` finds bare `http(s)://` and `www.` addresses and `[label](https://…)` links; `components/RichText.tsx` renders them. Only http and https are accepted.
- **Undo:** entries store the previous state of the affected tasks and projects. Undoing resets changed fields with a new timestamp; comments and activity are kept.
- **Focus:** `requestFocus(id, scope)` + `claimFocus()`: each request takes effect exactly once (rows that move to another group do not steal focus again).
- **Who am I:** stored per browser in `localStorage` (`teamtodo.me.<workspaceId>`), not in the shared folder.
- **Renamed from Teamaufgaben:** settings in `localStorage`, the saved folder handle in IndexedDB, and the emergency copy are migrated from their `teamaufgaben` names on first read (`lib/storage.ts`, `data/fs/handleStore.ts`). An existing subfolder `Teamaufgaben` is used only if it contains a workspace (`app/session.ts`).

## Data format (schema version 2)

Version 2 changed projects: `archivedAt` and `deletedAt` are replaced by one `state` (`{ kind: 'active' }`, `{ kind: 'archived', at }` or `{ kind: 'deleted', at }`). A deleted project keeps the time it was deleted; the 30-day purge uses it. `template` stays a flag. Version 1 files are upgraded when read (`migrations.ts`); a version 2 folder blocks clients that only know version 1.

Optional fields added after the first release: `Project.pinned` (boolean) and `Task.tags` (list of strings). Older files are read without them.

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

| Field                    | Meaning                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `parentId`               | Parent task (subtasks, multi-level)                                                          |
| `projectId`, `sectionId` | Project and section; without a project, only visible in "My tasks"; subtasks have no section |
| `status`                 | `todo` / `doing` / `waiting`                                                                 |
| `completedAt`            | Set = completed (status is kept so the task can be reopened)                                 |
| `order`                  | Fractional index among siblings or within the section                                        |
| `dueDate`, `dueTime`     | `YYYY-MM-DD`, optional `HH:MM`                                                               |
| `activity[]`             | Type and data (text is generated at display time)                                            |
| `fieldUpdatedAt`         | Timestamp per field for merging                                                              |
| `tags`, `recurrence`     | Reserved for later                                                                           |

OneDrive conflict copies (file names that are not a UUID, for example `<uuid>-LAPTOP-1.json` or `users-MacBook.json`) are ignored and counted when loading. Helper files (`*.crswap`, `.DS_Store`, `~$…`) are skipped.

### Migrations

To introduce a new schema version, increase `SCHEMA_VERSION` in `data/schema.ts` and add `{ from: n, up(raw) }` in `data/migrations.ts`. The version is shared by all file types, so every file type needs a step at every version: the affected ones change, the others use `unchanged(n)`. Files are migrated up when read and saved in the new version on the next write. Files from a newer version block startup with a message.

A backup keeps the version it was written with (`runReadBackup`), so its projects are upgraded from that version and not from the current one.

To test a migration, write the old file with `schemaVersion: n` into a `MemDir` and load it (`tests/unit/upgradeFolder.test.ts`).

## Performance

Baseline with 10,000 tasks (`npm run bench`, one run on the development sandbox; numbers vary by machine):

| Operation | Before | Now |
| --- | --- | --- |
| `loadSnapshot` | 11.7 ms | 11–21 ms (noisy) |
| `visibleTasks` (called by several components per change) | 4.4 ms | 1.0 ms (memoised by its inputs) |
| `buildGroups`, project view | 5.9 ms | 3.3–4.0 ms |
| Persister work per change | 4.3 ms (pass over all tasks) | about 1 ms (only the touched tasks) |
| `updateTask`, store only | 4.1 ms | 4.1 ms |

The persister finds the changed tasks through `touchTasks` in the store (every write to the task record reports the IDs it touched); a full pass every 10 seconds (`SWEEP_MS`) writes anything that was not reported, so a missed report costs at most that delay. `tests/unit/touched.test.ts` checks both paths.

Browser, 10,000 tasks (Chromium, the e2e folder in localStorage; a throwaway fixture, not committed):

| Step | Before | Now |
| --- | --- | --- |
| Typing 5 characters in a row title | 6.7 s | 0.8 s |
| Rows in the DOM | 2,685 | 2,685 (no virtualization yet) |

What made the difference: a row re-rendered on every change to the list. Three causes, fixed in order:

- `TaskDnd` subscribed to the whole task record and passed new handler objects to the drag context, so every row's drag hooks re-rendered. Handlers are now stable and read the record when they run.
- Each row passed new `data` objects to dnd-kit. They are now kept stable while their content is the same.
- Rows rendered again although their task did not change. `TaskRow` is memoised and reads siblings, group defaults and subtasks from a snapshot the list publishes (`listSnapshot.ts`), not from props.

Rows also use `content-visibility: auto` (app.css): the browser skips layout and paint of rows outside the screen, and the rows stay in the DOM. Typing 5 characters: 0.82 s → 0.58 s. What is left is native style and layout over about 2,700 rows; JavaScript is now a small share of the time. Fewer DOM rows needs virtualization, which must keep keyboard navigation (it finds rows in the DOM) and drag and drop (drop targets are DOM nodes) working.

Startup with 10,000 tasks (about 18 s here) is dominated by reading the files (`File` and `text`, about 5 s in the profile); parsing and validation do not show near the top.

Parsing and validation run in a worker (`src/data/parse/`), reads stay on the main thread. Measured in Node with 10,000 tasks: JSON.parse + migrate + validate 84 ms, the worker's reply copied back to the main thread (structured clone) 62 ms, the request 14 ms. So the worker moves about as much work off the main thread as the copy costs on it. It is kept because it was requested and keeps the validation off the main thread for large pulls; it does not make startup faster. Measure in the browser before expecting a gain.

Still open: the store copies the whole task record per change (`Map` would copy about 3× faster, measured 1.2 ms against 3.6 ms at 10,000 keys; not done, since the change touches every reader), and about 160 ms per keystroke remains with 2,685 rows in the DOM. Virtualization is the next step for that; it has to keep keyboard navigation (which finds rows in the DOM) and drag and drop working.

## Tests

- **Property-based** (`tests/unit/properties.test.ts`, fast-check): merge rules, link safety and migrations for generated inputs. CI uses a fixed seed (`CI` is set); locally the seed is random. Use `FC_SEED=<seed>` to repeat a failing run and `FC_RUNS=<n>` for more cases.
- **Budgets** (`tests/unit/memory.test.ts`): with 10,000 tasks, the largest write of a backup and the size of the undo stack stay within fixed limits. They count bytes, not time.
- **Crash recovery** (`tests/e2e/crash.spec.ts`): an injected error in one part of the screen leaves the rest usable. The injection is a test hook that only works with `?e2e` (`window.__e2eCrash`).

- **Unit** (`tests/unit`): repository, migrations, store actions including undo, grouping, persister including the error path, date parser, merging, two clients on one folder (conflicting writes, change detection), attachments, backups, cleanup, restore.
- **E2E** (`tests/e2e`): real build under `file://`. Covered: five tasks and three subtasks entered only by keyboard; the panel without page navigation and without losing scroll position; undo; reload; projects and sections; **two windows see each other's changes within 10 s**; **simultaneous changes to different fields are kept**; a comment with @mention → inbox; attachments; filter, grouping, and sorting; drag and drop (list, sections, board, rejection on "Überfällig"); board with Enter chain; restoring a backup.

Test mode `?e2e`: replaces the native folder dialog with a folder in `localStorage` (`data/fs/storageFs.ts`). Several windows of the same browser profile share it, which makes multi-user behavior testable. `window.__e2e` provides `flush()`, `sync()`, and `repo()`. `?poll=ms` shortens the polling interval. Only active with this URL parameter.
