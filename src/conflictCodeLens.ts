import * as vscode from 'vscode';
import { ConflictContentProvider } from './contentProvider';
import { log } from './outputChannel';

export class ConflictCodeLensProvider implements vscode.CodeLensProvider {
  constructor(private readonly contentProvider: ConflictContentProvider) {}

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const { filepath, version } = ConflictContentProvider.parseUri(document.uri);
    log(`CodeLens called: scheme=${document.uri.scheme} version=${version} filepath=${filepath}`);

    if (version !== 'ours' && version !== 'theirs') {
      return [];
    }

    const entry = this.contentProvider.getFileMetadata(filepath);
    if (!entry) {
      log(`CodeLens: no metadata for "${filepath}"`);
      return [];
    }

    const range = new vscode.Range(0, 0, 0, 0);

    if (version === 'ours') {
      return [
        new vscode.CodeLens(range, {
          title: 'Accept Ours (keep this file)',
          command: 'conflictWatcher.acceptVersion',
          arguments: [filepath, 'ours'],
        }),
      ];
    }

    return [
      new vscode.CodeLens(range, {
        title: 'Accept Theirs (take incoming)',
        command: 'conflictWatcher.acceptVersion',
        arguments: [filepath, 'theirs'],
      }),
    ];
  }
}
