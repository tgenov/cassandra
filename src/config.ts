import * as vscode from 'vscode';

export interface ConflictWatcherConfig {
  remote: string;
  branch: string;
  pollIntervalMs: number;
  enabled: boolean;
  autoPull: boolean;
}

export function getConfig(): ConflictWatcherConfig {
  const cfg = vscode.workspace.getConfiguration('conflictWatcher');
  return {
    remote: cfg.get<string>('remote', 'origin'),
    branch: cfg.get<string>('branch', 'main'),
    pollIntervalMs: Math.max(cfg.get<number>('pollIntervalSeconds', 60), 10) * 1000,
    enabled: cfg.get<boolean>('enabled', true),
    autoPull: cfg.get<boolean>('autoPull', false),
  };
}

export function onConfigChanged(callback: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('conflictWatcher')) {
      callback();
    }
  });
}
