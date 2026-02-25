import * as vscode from 'vscode';
import { ConflictDetector } from './conflictDetector';
import { StatusBar } from './statusBar';
import { ConflictContentProvider, SCHEME } from './contentProvider';
import { ConflictCodeLensProvider } from './conflictCodeLens';
import { ConflictHoverProvider } from './conflictHover';
import { registerCommands } from './commands';
import { onConfigChanged } from './config';
import { log } from './outputChannel';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    log('No workspace folder found, not activating.');
    return;
  }

  const cwd = workspaceFolder.uri.fsPath;
  log(`Activating Conflict Watcher for ${cwd}`);

  const contentProvider = new ConflictContentProvider();
  const statusBarItem = new StatusBar();
  const detector = new ConflictDetector(cwd);

  // Register content provider and language features
  const codeLensProvider = new ConflictCodeLensProvider(contentProvider);
  const hoverProvider = new ConflictHoverProvider(contentProvider);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(SCHEME, contentProvider),
    vscode.languages.registerCodeLensProvider({ scheme: SCHEME }, codeLensProvider),
    vscode.languages.registerHoverProvider({ scheme: SCHEME }, hoverProvider),
  );

  // Wire up events
  context.subscriptions.push(
    detector.onConflictsUpdated(({ snapshot, change }) => {
      statusBarItem.update(snapshot);

      // Notify on new conflicts
      if (change.isNewConflict && snapshot.status === 'conflicts') {
        const count = snapshot.conflictFiles.length;
        vscode.window.showWarningMessage(
          `Conflict Watcher: ${count} file${count !== 1 ? 's' : ''} would conflict with ${getRemoteRef()}`,
          'Show Conflicts'
        ).then(action => {
          if (action === 'Show Conflicts') {
            vscode.commands.executeCommand('conflictWatcher.showConflicts');
          }
        });
      }
    })
  );

  // Wire up auto-pull notifications
  context.subscriptions.push(
    detector.onAutoPulled(({ commitCount }) => {
      if (commitCount === 0) { return; }
      const msg = `Conflict Watcher: Auto-pulled ${commitCount} commit${commitCount !== 1 ? 's' : ''}`;
      log(msg);
      vscode.window.showInformationMessage(msg);
    })
  );

  // Register commands
  registerCommands(context, detector, statusBarItem, contentProvider, cwd);

  // Watch for config changes
  context.subscriptions.push(
    onConfigChanged(() => {
      log('Configuration changed, restarting detector');
      detector.restartTimer();
    })
  );

  // Push disposables
  context.subscriptions.push(detector, statusBarItem, contentProvider);

  // Start polling
  detector.start();
}

function getRemoteRef(): string {
  const cfg = vscode.workspace.getConfiguration('conflictWatcher');
  return `${cfg.get('remote', 'origin')}/${cfg.get('branch', 'main')}`;
}

export function deactivate(): void {
  // Disposables registered via context.subscriptions are cleaned up automatically
}
