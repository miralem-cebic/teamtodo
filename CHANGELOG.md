# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Interface translations: German, French, Spanish, and Italian in addition to English. The app starts in your browser's language. Change it under **Language** in the account menu at the bottom left.
- Pastel color themes: Light blue, Light green, Pink, Lavender, and Peach. Choose one under **Theme** in the account menu. Dark mode works with each theme.
- Browser notifications (opt-in, **Notifications** in the account menu) when a teammate assigns you a task, when one of your tasks is due today, or when it is due within an hour.

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
