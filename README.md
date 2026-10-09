# teamtodo

[![CI](https://github.com/miralem-cebic/teamtodo/actions/workflows/ci.yml/badge.svg)](https://github.com/miralem-cebic/teamtodo/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/miralem-cebic/teamtodo?include_prereleases&sort=semver)](https://github.com/miralem-cebic/teamtodo/releases)
[![License: MIT](https://img.shields.io/github/license/miralem-cebic/teamtodo)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**teamtodo** is a task management tool for marketing teams, modeled after the interaction style of Asana.

It runs entirely in the browser and needs no server. All data is stored as plain files in a shared folder, for example on OneDrive or SharePoint, so your team keeps full control over its data.

<!-- TODO: add a screenshot at docs/screenshot.png and uncomment the line below -->
<!-- ![teamtodo screenshot](docs/screenshot.png) -->

## Highlights

- **Fast task entry**: type a title, press Enter, and the next task is ready. Keyboard-first, with a full set of shortcuts.
- **Lists, boards, and my tasks**: switch views, filter, sort, and group. Drag and drop tasks, sections, and subtasks.
- **Team collaboration**: assign tasks, mention people, comment, follow tasks, and see changes from others in an inbox.
- **Field-level merging**: when two people edit the same task at the same time, changes to different fields are both kept.
- **No server, your data**: data lives as files in a shared folder. Daily backups are kept automatically, and deleted tasks can be restored for 30 days.

## Requirements

- **Google Chrome** or **Microsoft Edge**. The app writes into a folder via the File System Access API, which Safari and Firefox do not support.

## Getting started

### Use a release

1. Go to the [Releases](https://github.com/miralem-cebic/teamtodo/releases) page.
2. Download the latest `teamtodo-<version>.zip` and verify it with the attached `.sha256` file.
3. Extract the archive, then double-click `index.html` to open the app in Chrome or Edge.

The [user guide](docs/user-guide.md) explains how to connect the shared data folder, set up your team, and work with tasks.

### Build from source

```bash
git clone https://github.com/miralem-cebic/teamtodo.git
cd teamtodo
npm ci
npm run dev        # development server at http://localhost:5173
npm run build      # type check and production build into dist/
npm test           # unit tests
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for the architecture, all scripts, and the build setup for `file://`.

## Documentation

- [User guide](docs/user-guide.md): using teamtodo day to day, keyboard shortcuts, backups, and known limitations.
- [Development guide](DEVELOPMENT.md): setup, architecture, data format, and tests.
- [Contributing guide](CONTRIBUTING.md): how to propose changes, coding conventions, and the pull request workflow.
- [Code of Conduct](CODE_OF_CONDUCT.md): how we expect everyone to behave.
- [Security policy](SECURITY.md): how to report vulnerabilities responsibly.
- [Changelog](CHANGELOG.md): what changed in each release.

## Contributing

Contributions are welcome, whether it is a bug report, a feature idea, documentation, or code.

- Look at [open issues](https://github.com/miralem-cebic/teamtodo/issues) and pick one labeled `good first issue` or `help wanted`.
- Open an issue before starting larger changes so we can agree on the approach.
- Submit your changes as a pull request. Every change goes through a pull request and CI before it lands on `main`.

Please read the [contributing guide](CONTRIBUTING.md) first.

## Community

- Report a bug or request a feature with the [issue templates](https://github.com/miralem-cebic/teamtodo/issues/new/choose).
- Report a security issue privately, see [SECURITY.md](SECURITY.md).

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
