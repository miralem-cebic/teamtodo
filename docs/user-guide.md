# teamtodo User Guide

teamtodo is a task management tool for marketing teams. It runs directly in the browser, needs no server and no internet connection. All data is stored as files in a shared folder, for example on OneDrive.

## Opening the app

1. Open the folder with the app. It contains `index.html` and the `assets` folder.
2. Double-click **`index.html`**.
3. The app opens in your default browser. It only works in **Google Chrome** and **Microsoft Edge**. If another browser is your default, right-click `index.html` → "Open with" → Chrome or Edge.

Tip: bookmark the opened page to get there faster next time.

## Connecting the data folder

On first start, the app asks for the **data folder**. This is the folder where your team's tasks are stored.

- Everyone in the team selects the **same** folder, for example a shared OneDrive folder named "teamtodo".
- If the folder is empty, the app creates its files. You can optionally start with sample data.
- If the folder already contains other files, the app suggests creating a subfolder named "teamtodo" instead.

On later starts the app shows **"Continue with folder …"**. One click is enough. For security reasons the browser asks once per session whether the app may access the folder. Confirm with **Allow**.

**Important with OneDrive:** In Finder or Explorer, right-click the data folder and choose **"Always keep on this device"** (the menu name depends on the language of your OneDrive). Otherwise OneDrive first has to download the files and the app starts more slowly.

## Setting up your team

- On first start, choose **who you are**. If your name is missing, add yourself directly.
- This choice only applies to your browser. You can change it at the bottom left: click your name → **Switch person**.
- Further people are created automatically: type a new name in the person field and choose **Add "…" to the team**.

## Working with tasks

- **Create a task:** type the title, press **Enter**, then type the next task. No form, no save button.
- **Person and date:** click the field in the row, or press **Alt + P** (person) and **Alt + D** (date). In the date field you can type `today`, `tomorrow`, `fr`, `next week`, `+3` or `12.10.`. The German words (`heute`, `morgen`, `nächste woche`, `montag`, …) still work too.
- **Complete:** click the circle in front of the title, or press **Ctrl + Enter** (Mac: ⌘ + Enter).
- **Details:** click the row, or press **Ctrl + O**. A panel opens on the right with description and subtasks. The list stays visible.
- **Subtasks:** in the detail panel under **Subtasks**, or with **Alt + S** in the row. Each subtask has its own person and date.
- **Sections:** inside a project, sections group tasks. Add one with **Add section** below the last section. Rename it by double-clicking the name.
- **My tasks** shows everything assigned to you, across all projects, sorted by due date.

### Moving tasks with drag and drop

When you hover over a row, a handle (⋮⋮) appears on its left edge. Drag it to move a task within a section or into another section. Sections are moved by the handle next to their name; subtasks work the same way in the detail panel. Dragging a task onto **Today** in **My tasks** sets its date to today. Nothing can be dropped onto **Overdue**.

### Board, filter, sort, group

- **List or board:** switch at the top, or press **L** / **B**. On the board, the columns follow the current grouping (by default the sections of a project). Drag cards to another column.
- **Filter** by responsible person, due date, and status. Active filters are highlighted, and the small × resets them.
- **Sort** by due date, title, person, or creation date. Ordering by dragging is only available with **Manual**.
- **Group** by section, person, due date, status, or project.
- **Open tasks / All tasks / Completed tasks** shows or hides completed tasks.

### Comments, attachments, followers

- **Comments** are written at the bottom of the detail panel. Type **@** and the first letters of a name to mention someone. Send with **Ctrl + Enter** (Mac: ⌘ + Enter).
- **Attachments:** use **Attach a file**, or drag files into the **Attachments** area. The file is copied into the data folder (`attachments`). Click it to open.
- **Followers** are notified about comments on a task. Whoever creates a task, is assigned to it, comments on it, or is mentioned in it follows it automatically.
- **History:** **Comments and activity** shows who changed what and when. **Show comments only** hides the changes.

### Inbox

The **Inbox** shows what others did for you: a task assigned to you, a mention, a comment or completion on a task you follow. Unread items are marked with a dot, and the count appears in the navigation. Press **G**, then **I** to jump there.

### Teamwork

The app syncs with the data folder every 10 seconds and whenever you return to the window. Changes by others appear without reloading, and the row briefly lights up. If two people edit the same task at the same time, the app merges the changes field by field: if one person changes the title and another changes the date, both changes are kept. Only when both change the same field does the later change win. Comments are never lost.

### Undo instead of confirmation prompts

Completing, deleting, moving, and reassigning happen immediately. A notice with **Undo** appears at the bottom. Alternatively, press **Ctrl + Z** (Mac: ⌘ + Z) while no input field is active.

### Saving

The app saves every change automatically. The status at the top right shows **Saving …** or **Saved**. If a red message appears there:

- **"No access to the folder."** → click **Reconnect** and allow access.
- **"Data folder not found. Was it moved or renamed?"** → at the bottom left, choose **Choose another data folder**.

Until saving works again, the app keeps your changes. Do not close the window in the meantime.

## Keyboard shortcuts

Press **?** to show the full list in the app.

| Key                         | Action                                                                  |
| --------------------------- | ----------------------------------------------------------------------- |
| Enter                       | Save task, new row below                                                |
| Ctrl/⌘ + Enter              | Complete / reopen                                                       |
| ↑ / ↓                       | Previous / next task                                                    |
| Ctrl/⌘ + Shift + ↑ / ↓      | Move task                                                               |
| Tab                         | Next field (person, date, status)                                       |
| Alt + P / Alt + M / Alt + D | Choose person / assign to me / choose date                              |
| Alt + S                     | Create subtask                                                          |
| Esc                         | Leave input. Then ↑/↓ selects rows, Space opens details, Delete removes |
| N                           | New task                                                                |
| /                           | Search                                                                  |
| G, then M                   | Go to **My tasks**                                                      |
| G, then I                   | Go to inbox                                                             |
| L / B                       | List / board                                                            |
| Ctrl/⌘ + Z                  | Undo                                                                    |
| ?                           | All shortcuts                                                           |

On a Mac, Alt is the ⌥ (Option) key.

## Backing up and restoring

All data is stored as files in the data folder:

```text
teamtodo/
  workspace.json   name and version
  users.json       team
  projects.json    projects and sections
  tasks/           one file per task
  attachments/     attachments, one folder per task
  backups/         daily backups
```

- **Automatic:** the first person to open the app on a given day creates a full backup in `backups`. The latest 14 are kept.
- **Restore:** open **Data and backups** from the navigation, then click **Restore …** on the backup you want. The current state is backed up first, so a wrong restore can be undone. Attachments are not part of the backups; they stay in the `attachments` folder.
- **Additionally:** copy the whole data folder as a ZIP now and then. OneDrive also keeps earlier versions of each file (right-click → version history).
- **Deleted tasks** stay as files at first and are only removed permanently after 30 days.

## Known limitations

- **Only Chrome and Edge.** Safari and Firefox cannot write directly into folders.
- **Confirm once per session.** The browser asks for folder access on every start.
- **OneDrive conflicts:** if two computers save the same file at the same moment, OneDrive sometimes creates a conflict copy (for example `…-LAPTOP-123.json`). The app ignores such copies and shows a notice at the bottom left. The file names are listed under **Data and backups**. They can be deleted in the data folder.
- **OneDrive delay:** the app only sees changes made by others once OneDrive has downloaded them to your computer. This usually takes seconds, sometimes longer.
- **Clock of the computer:** for simultaneous changes, the newer one wins. If a computer's clock is far off, the order can be wrong.
- **Read markers in the inbox** only apply to the browser where you set them.
- **Keyboard drag and drop:** instead of dragging, move with Ctrl/⌘ + Shift + ↑/↓. To move to another section, use the section field of the row.
