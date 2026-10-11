# CLAUDE.md

Guidance for AI agents working in this repository. Details live in [DEVELOPMENT.md](DEVELOPMENT.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Commands

Run these before a change is done. They are the same checks CI runs:

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint .
npm test              # vitest unit tests (tests/unit)
npm run build         # typecheck + production build into dist/
npm run check:file    # opens dist/index.html via file:// and checks the build
npm run test:e2e      # Playwright against dist/index.html (needs installed Chrome)
```

## Layering

- `src/data/` (file formats, merge, migrations, persister, sync, maintenance) never imports from `src/features/` or `src/components/`.
- `src/store/appStore.ts` owns every state change. Components dispatch actions; they do not write files.
- Only `src/data/fs/` talks to the File System Access API. Everything else goes through the `Repository` interface.
- User-facing text goes only through `src/i18n/` and must exist in all five languages (`en`, `de`, `fr`, `es`, `it`).

## Data invariants

- Every change to a mergeable field sets that field's `fieldUpdatedAt` entry. The field-level merge depends on it.
- Deletes are soft: set `deletedAt` (or `removedAt`); do not remove files or entries directly. Physical removal happens only in `data/maintenance.ts` after 30 days.
- Draft rows (`draft: true`) are never written to disk. A file is created only once the row has a title.
- Records keyed by IDs that come from file content use `Map` (or a null-prototype object), never a plain object that is written with file-provided keys.
- Anything read from the data folder is untrusted until it has passed validation at the boundary. Do not use `JSON.parse(...) as T`.
- Links: only `http:` and `https:` may become an `href`.

## Build constraints (`file://`)

The app must run by double-clicking `dist/index.html` in Chrome or Edge:

- Single classic IIFE script (`vite.config.ts`), no `type="module"`, no `crossorigin` (`build/fileProtocol.ts` enforces this).
- No code splitting, no network requests, no runtime dependencies beyond those in `package.json`.
- Fonts are embedded as `data:` URLs.

## Schema changes

1. Increase `SCHEMA_VERSION` in `src/data/schema.ts`.
2. Add a `{ from: n, up(raw) }` step in `src/data/migrations.ts` for each affected file type.
3. Add or extend a migration test in `tests/unit/migrations.test.ts`.

## Conventions

- New code, comments, log messages, and test names are in English. Older German comments are translated when the code around them changes.
- Commit messages and pull request titles follow Conventional Commits (see CONTRIBUTING.md).
- Keep changes focused. Do not refactor unrelated code in the same change.
- Update `CHANGELOG.md` under `## [Unreleased]` for user-visible changes.
