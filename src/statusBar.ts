import * as vscode from 'vscode';
import type { ConflictSnapshot } from './conflictState';

export class StatusBar implements vscode.Disposable {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'conflictWatcher.showConflicts';
    this.setClean();
    this.item.show();
  }

  update(snapshot: ConflictSnapshot): void {
    switch (snapshot.status) {
      case 'clean':
        this.setClean(snapshot.dirtyTreeUsed);
        break;
      case 'conflicts':
        this.setConflicts(snapshot.conflictFiles.length, snapshot.dirtyTreeUsed);
        break;
      case 'error':
        this.setError(snapshot.errorMessage);
        break;
      case 'paused':
        this.setPaused();
        break;
      case 'checking':
        this.setChecking();
        break;
    }
  }

  private setClean(dirtyTreeUsed?: boolean): void {
    this.item.text = '$(check) No conflicts';
    this.item.backgroundColor = undefined;
    const suffix = dirtyTreeUsed ? ' (includes uncommitted changes)' : '';
    this.item.tooltip = `Conflict Watcher: No conflicts detected${suffix}`;
  }

  private setConflicts(count: number, dirtyTreeUsed?: boolean): void {
    this.item.text = `$(warning) ${count} conflict${count !== 1 ? 's' : ''}`;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    const suffix = dirtyTreeUsed ? ' (includes uncommitted changes)' : '';
    this.item.tooltip = `Conflict Watcher: ${count} file${count !== 1 ? 's' : ''} with conflicts${suffix}`;
  }

  private setError(message?: string): void {
    this.item.text = '$(error) CW';
    this.item.backgroundColor = undefined;
    this.item.tooltip = `Conflict Watcher: ${message ?? 'Error'}`;
  }

  private setPaused(): void {
    this.item.text = '$(debug-pause) CW paused';
    this.item.backgroundColor = undefined;
    this.item.tooltip = 'Conflict Watcher: Paused';
  }

  private setChecking(): void {
    this.item.text = '$(sync~spin) CW checking';
    this.item.backgroundColor = undefined;
    this.item.tooltip = 'Conflict Watcher: Checking for conflicts...';
  }

  dispose(): void {
    this.item.dispose();
  }
}
