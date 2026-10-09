# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Open source project setup: license, contributing guide, code of conduct, security policy, issue and pull request templates.
- Continuous integration: pull request title check, Markdown linting, and build packaging.
- Automated release workflow with checksums and generated release notes.
- Dependabot updates for GitHub Actions.

### Changed

- Project renamed to **teamtodo**: package name, app title, storage keys, and default data folder name.
- README, user guide, and development guide translated to English (`docs/user-guide.md`, `DEVELOPMENT.md`).
- Build output (`dist/`) and test results are no longer tracked in git. Releases are built by CI.

### Fixed

- Unit test for merging simultaneous edits used fixed past timestamps and failed once the sample data was older than them. It now uses timestamps relative to the current time.

### Notes

- The user interface and code comments are still in German.
