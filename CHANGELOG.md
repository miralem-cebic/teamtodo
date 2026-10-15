# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The app is available on GitHub Pages: <https://miralem-cebic.github.io/teamtodo/>. Each release is published there, and the website works like the downloaded package in Chrome or Edge. Data stays in the folder you choose.
- The browser tab shows the teamtodo icon.

### Changed

- On a browser that cannot run the app, the start screen tells you to copy the page's address and open it in Chrome or Edge when the app is opened from the website.

## [0.4.0] - 2026-10-11

### Added

- Tags for tasks: add tags in the task panel, filter every view by a tag. Tags are kept when a project is created from a template.
- Manage tags from the tags filter: rename a tag (renaming onto an existing tag merges them), remove a tag from all tasks, and see how many tasks use each tag. Both actions are undoable.
- Group the list or board by tag. A task with several tags is listed under its first tag only.
- Pin projects to the top of the sidebar. Arrange projects by drag and drop in the sidebar, or with Ctrl/⌘ + Shift + ↑/↓ on a focused project. A project stays in its group: unpinned projects cannot move above pinned ones. Both are undoable.
- Conflicting copies from the shared folder (for example OneDrive's `…-LAPTOP.json`) are listed in a dialog. Each copy can be merged into the workspace or discarded. A copy is removed only after its merged content was saved.
- A crash in one part of the screen (the sidebar, a view, the task panel or a dialog) shows a short message with **Try again** and **Copy diagnostics**. The rest of the app keeps working, and unsaved changes are kept.

### Changed

- Projects have one state (active, archived or deleted) instead of two dates. Files are written in format version 2 and are upgraded when read. **Every device that shares the folder must run this version before it saves again:** a device on an older version shows a message and does not load the folder.
- Files from the data folder are parsed and validated in a background worker during loading and sync. If the worker cannot start, the same work runs on the main thread.
- Files from the data folder, backups and the emergency copy are checked when they are read. A broken user or project is left out and reported; the rest of the workspace still loads.
- Backups are written in batches, and the undo stack and attachment previews use bounded memory.
- The built app sends a Content Security Policy: no network access, scripts and styles only from the app itself.

### Fixed

- Attachment names read from task files are checked before they are used. HTML, SVG and XML attachments are always downloaded, never opened as a page.
- A change made at the same moment as another one is no longer lost: when another client overwrites the shared file, the next poll brings the change back and writes it again.
- A device with a slow clock no longer makes its later edits lose against earlier edits from other devices.
- One broken user or project record in the shared folder no longer blocks saving users and projects.
- Merging a task no longer keeps an older change timestamp on a field. Such a timestamp could let an older edit win over a newer one later.

## [0.3.0] - 2026-10-10

### Added

- Links in descriptions and comments: a web address (`https://…`) is clickable by itself. Select text and press Ctrl/⌘ + K to turn it into a link. Only `http` and `https` links are accepted.
- Templates: save a project as a template (project menu, **Save as template**). Create a new project from a template or start from a blank project. Templates keep sections, tasks, descriptions and subtasks; assignments and due dates are not copied. Manage them under **Templates** in the navigation.

### Changed

- The arrows at the top of the task detail panel go to the previous and next task in the list. They previously stepped back and forward through the tasks you had opened.
- **+** next to **Projects** opens a dialog that asks for a name and a starting point (blank or template).

### Fixed

- A backup or restore started before the workspace was loaded no longer writes an invalid snapshot (#20, #22).
- Finding subtasks is faster in large task trees (#21).
- Merging task fields is checked by the compiler instead of unsafe casts (#19).
- Comments and log messages in the source are in English (#23).

## [0.2.0] - 2026-10-10

### Added

- Interface translations: German, French, Spanish, and Italian in addition to English. The app starts in your browser's language. Change it under **Language** in the account menu at the bottom left.
- Pastel color themes: Light blue, Light green, Pink, Lavender, and Peach. Choose one under **Theme** in the account menu. Dark mode works with each theme.
- Browser notifications (opt-in, **Notifications** in the account menu) when a teammate assigns you a task, when one of your tasks is due today, or when it is due within an hour.
- Calendar view: a month overview of the open tasks by due date (weeks start on Monday), with a list of tasks without a date. Switch with **Calendar** in the toolbar or press **C**. The project header shows the latest due date of its open tasks.
- Calendar export: save a task, or all open tasks of the current view, as a calendar file (`.ics`) for Outlook, Apple Calendar, or Google Calendar. Open the file or attach it to an email. Timed tasks are written in UTC.

## [0.1.1] - 2026-10-10

### Added

- Team management: rename people, remove them (their open tasks become unassigned, with undo), and restore removed people. Open it with the edit icon next to **Team** in the sidebar.
- User guide: screenshots of the list and board views.
- README: app icon and screenshot collage.

## [0.1.0] - 2026-10-10

### Added

- Open source project setup: license, contributing guide, code of conduct, security policy, issue and pull request templates.
- Continuous integration: pull request title check, Markdown linting, and build packaging.
- Automated release workflow with checksums and generated release notes.
- Dependabot updates for GitHub Actions.

### Changed

- Project renamed to **teamtodo**: package name, app title, storage keys, and default data folder name. Existing settings, the saved folder, and the emergency copy from the old `teamaufgaben` names are migrated automatically, and an existing `Teamaufgaben` subfolder with a workspace is still used.
- README, user guide, and development guide translated to English (`docs/user-guide.md`, `DEVELOPMENT.md`).
- User interface, code comments, sample data, and tests are in English. Date input still accepts the German shorthands (`morgen`, `nächste woche`, `fr`, …).
- Build output (`dist/`) and test results are no longer tracked in git. Releases are built by CI.

### Fixed

- Unit test for merging simultaneous edits used fixed past timestamps and failed once the sample data was older than them. It now uses timestamps relative to the current time.
