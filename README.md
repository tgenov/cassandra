# Cassandra

*In Greek mythology, Cassandra was a Trojan priestess cursed to see the future but never be believed. She foresaw the fall of Troy -- the ultimate conflict -- yet no one listened until it was too late.*

This extension channels that gift: it foresees merge conflicts before they happen, giving you time to act. Unlike the original Cassandra, this one comes with buttons you can click.

Cassandra is a Visual Studio Code extension that detects merge conflicts in real time against a configurable remote branch using `git merge-tree` -- without touching your working tree. When conflicts appear, it warns you and provides interactive tools for viewing and resolving them.

## Getting Started

1. Install the extension in VS Code.
2. Open a workspace that contains a `.git` directory. The extension activates automatically.
3. By default, it checks for conflicts against `origin/main` every 60 seconds. To change the target branch or interval, open **Settings** and search for `conflictWatcher`.
4. Watch the status bar for conflict indicators. Click the status bar item at any time to view conflicting files.

No additional setup is required. The extension runs `git fetch` and `git merge-tree` in the background and never modifies your working tree unless you explicitly accept a resolution.

## Features

### Real-Time Conflict Detection

The extension polls at a configurable interval (default 60 seconds, minimum 10 seconds) to fetch from the remote and run `git merge-tree`, detecting which files would conflict if you merged right now.

### Status Bar Indicator

A persistent status bar item shows the current state at a glance:

| Icon | Meaning |
|------|---------|
| Check mark | No conflicts detected |
| Warning with count | N file(s) would conflict |
| Error | Something went wrong (hover for details) |
| Pause | Polling is paused |
| Spinner | A check is in progress |

Click the status bar item to open the conflict file picker.

### Warning Notifications

When new conflicts are detected, a warning notification appears showing the number of conflicting files. Click "Show Conflicts" to jump straight into the file picker.

### Interactive Quick Pick

Select a conflicting file from the list, then choose how to view it:

- **VS Code Diff** -- Opens a side-by-side (or inline) diff of your local version against the incoming remote version, using the built-in `vscode.diff` command. This respects your VS Code diff display preference.
- **Preview with conflict markers** -- Opens a single read-only editor showing the full file with `<<<<<<< OURS`, `=======`, and `>>>>>>> THEIRS` markers.

### Conflict Resolution

After viewing a conflict, a notification offers three actions:

- **Accept Ours** -- Overwrites the working tree file with your local version (confirms with a modal dialog).
- **Accept Theirs** -- Overwrites the working tree file with the incoming remote version (confirms with a modal dialog).
- **Open in Editor** -- Opens the actual working tree file in a side-by-side editor for manual editing.

Resolved files are immediately removed from the conflict count. The status bar updates without waiting for the next poll cycle.

### Hover Tooltip

When viewing the "theirs" side of a diff, hover over the content to see the incoming commit log from the remote branch since the merge base.

### Optional Auto-Pull

When enabled, the extension performs a fast-forward-only pull after each fetch. This only runs when the working tree is clean and a fast-forward is possible. A notification reports how many commits were pulled.

### Dual Git Support

The extension detects your Git version at startup. For Git 2.38 and later, it uses the modern `git merge-tree --write-tree` mode. For older versions, it falls back to the legacy three-way `git merge-tree` invocation with an explicit merge base.

## Commands

All commands are available through the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).

| Command | Title | Description |
|---------|-------|-------------|
| `conflictWatcher.checkNow` | Cassandra: Check Now | Run a conflict check immediately |
| `conflictWatcher.showConflicts` | Cassandra: Show Conflicts | Open the conflict file picker |
| `conflictWatcher.togglePause` | Cassandra: Toggle Pause | Pause or resume automatic polling |

## Configuration

Open **Settings** and search for `conflictWatcher`, or edit `settings.json` directly.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `conflictWatcher.remote` | string | `"origin"` | Git remote to check against |
| `conflictWatcher.branch` | string | `"main"` | Remote branch to check against |
| `conflictWatcher.pollIntervalSeconds` | number | `60` | Poll interval in seconds (minimum 10) |
| `conflictWatcher.enabled` | boolean | `true` | Enable or disable conflict watching |
| `conflictWatcher.autoPull` | boolean | `false` | Auto fast-forward pull after each fetch (only when working tree is clean) |

Configuration changes take effect immediately -- the polling timer restarts automatically.

## How It Works

Traditional conflict detection requires attempting a merge, which modifies the working tree and index. Cassandra takes a different approach:

1. On each poll cycle, the extension runs `git fetch` to update remote refs.
2. It then runs `git merge-tree` with your current `HEAD` and the remote branch tip. This command simulates a three-way merge entirely in memory and reports which files would conflict, along with their blob OIDs for each side (base, ours, theirs).
3. The extension parses the merge-tree output to build a list of conflicting files.
4. If the set of conflicting files has changed since the last check, the status bar updates and a notification fires.
5. When you select a file for viewing, the extension reads the blob contents via `git show <oid>` and presents them through VS Code's virtual document system -- no temporary files are written to disk.
6. If you choose to accept a version, the extension reads the blob and writes it to the working tree file (after modal confirmation).

Because `git merge-tree` operates on object storage rather than the working tree, polling is safe to run continuously and has no side effects on your files or index.

## Requirements

- Visual Studio Code 1.80 or later
- Git 2.0 or later (enhanced conflict detection with Git 2.38+)
