import * as vscode from 'vscode';
import type { ConflictFileEntry } from './mergeTreeParser';

export const SCHEME = 'conflict-watcher';

export type ConflictVersion = 'base' | 'ours' | 'theirs' | 'preview';

export interface ConflictContext {
  cwd: string;
  remoteRef: string;
  mergeBase: string;
}

export class ConflictContentProvider implements vscode.TextDocumentContentProvider {
  private content = new Map<string, string>();
  private metadata = new Map<string, ConflictFileEntry>();
  private context: ConflictContext | undefined;
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  setContent(uri: vscode.Uri, text: string): void {
    this.content.set(uri.toString(), text);
    this._onDidChange.fire(uri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.content.get(uri.toString()) ?? '';
  }

  /** Build a URI for a conflict file version */
  static buildUri(filepath: string, version: ConflictVersion): vscode.Uri {
    return vscode.Uri.parse(
      `${SCHEME}:///${filepath}?version=${version}&ts=${Date.now()}`
    );
  }

  /** Extract filepath and version from a conflict-watcher URI. */
  static parseUri(uri: vscode.Uri): { filepath: string; version: ConflictVersion } {
    const filepath = uri.path.replace(/^\//, '');
    const version = new URLSearchParams(uri.query).get('version') as ConflictVersion;
    return { filepath, version };
  }

  setFileMetadata(filepath: string, entry: ConflictFileEntry): void {
    this.metadata.set(filepath, entry);
  }

  getFileMetadata(filepath: string): ConflictFileEntry | undefined {
    return this.metadata.get(filepath);
  }

  setContext(cwd: string, remoteRef: string, mergeBase: string): void {
    this.context = { cwd, remoteRef, mergeBase };
  }

  getContext(): ConflictContext | undefined {
    return this.context;
  }

  clear(): void {
    this.content.clear();
    this.metadata.clear();
    this.context = undefined;
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}
