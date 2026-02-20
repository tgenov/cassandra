import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConflictDetector } from './conflictDetector';
import { StatusBar } from './statusBar';
import { ConflictContentProvider, SCHEME } from './contentProvider';
import { showConflictQuickPick } from './quickPick';
import { gitShow } from './gitOps';
import { log, logError } from './outputChannel';

/** Close any conflict-watcher diff/preview tabs that belong to the given filepath. */
async function closeConflictTabs(filepath: string): Promise<void> {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (input instanceof vscode.TabInputTextDiff) {
        const hasConflictSide =
          (input.original.scheme === SCHEME &&
            ConflictContentProvider.parseUri(input.original).filepath === filepath) ||
          (input.modified.scheme === SCHEME &&
            ConflictContentProvider.parseUri(input.modified).filepath === filepath);
        if (hasConflictSide) {
          await vscode.window.tabGroups.close(tab);
        }
      } else if (input instanceof vscode.TabInputText) {
        if (
          input.uri.scheme === SCHEME &&
          ConflictContentProvider.parseUri(input.uri).filepath === filepath
        ) {
          await vscode.window.tabGroups.close(tab);
        }
      }
    }
  }
}

export function registerCommands(
  context: vscode.ExtensionContext,
  detector: ConflictDetector,
  _statusBar: StatusBar,
  contentProvider: ConflictContentProvider,
  cwd: string
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('conflictWatcher.checkNow', () => {
      detector.checkNow();
    }),
    vscode.commands.registerCommand('conflictWatcher.showConflicts', () => {
      showConflictQuickPick(detector.currentSnapshot, contentProvider, cwd);
    }),
    vscode.commands.registerCommand('conflictWatcher.togglePause', () => {
      const paused = detector.togglePause();
      vscode.window.showInformationMessage(
        `Conflict Watcher: ${paused ? 'Paused' : 'Resumed'}`
      );
    }),
    vscode.commands.registerCommand('conflictWatcher.acceptOurs', (uri?: vscode.Uri) => {
      const docUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!docUri || docUri.scheme !== SCHEME) { return; }
      const { filepath } = ConflictContentProvider.parseUri(docUri);
      return vscode.commands.executeCommand('conflictWatcher.acceptVersion', filepath, 'ours');
    }),
    vscode.commands.registerCommand('conflictWatcher.acceptTheirs', (uri?: vscode.Uri) => {
      const docUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!docUri || docUri.scheme !== SCHEME) { return; }
      const { filepath } = ConflictContentProvider.parseUri(docUri);
      return vscode.commands.executeCommand('conflictWatcher.acceptVersion', filepath, 'theirs');
    }),
    vscode.commands.registerCommand(
      'conflictWatcher.acceptVersion',
      async (filepath: string, version: 'ours' | 'theirs') => {
        const entry = contentProvider.getFileMetadata(filepath);
        if (!entry) {
          vscode.window.showErrorMessage('Conflict Watcher: No metadata for this file.');
          return;
        }

        const oid = version === 'ours' ? entry.oursOid : entry.theirsOid;
        const EMPTY_OID = '0'.repeat(40);

        if (!oid || oid === EMPTY_OID) {
          const answer = await vscode.window.showWarningMessage(
            `The "${version}" version has no content (file was deleted or doesn't exist on that side). Delete ${filepath} from the working tree?`,
            { modal: true },
            'Delete',
          );
          if (answer === 'Delete') {
            try {
              await fs.unlink(path.join(cwd, filepath));
              log(`Deleted ${filepath} (accepted empty ${version} version)`);
              detector.markResolved(filepath);
              await closeConflictTabs(filepath);
              vscode.window.showInformationMessage(`Conflict Watcher: Deleted ${filepath}`);
            } catch (err) {
              logError(`Failed to delete ${filepath}`, err);
              vscode.window.showErrorMessage(`Conflict Watcher: Failed to delete ${filepath}`);
            }
          }
          return;
        }

        const answer = await vscode.window.showWarningMessage(
          `Overwrite ${filepath} with the "${version}" version?`,
          { modal: true },
          'Overwrite',
        );
        if (answer !== 'Overwrite') {
          return;
        }

        try {
          const result = await gitShow(cwd, oid);
          const fullPath = path.join(cwd, filepath);
          await fs.writeFile(fullPath, result.stdout, 'utf-8');
          log(`Accepted ${version} version for ${filepath}`);
          detector.markResolved(filepath);
          await closeConflictTabs(filepath);
          vscode.window.showInformationMessage(
            `Conflict Watcher: ${filepath} updated with "${version}" version.`
          );
        } catch (err) {
          logError(`Failed to write ${version} version for ${filepath}`, err);
          vscode.window.showErrorMessage(`Conflict Watcher: Failed to overwrite ${filepath}`);
        }
      }
    )
  );
}
