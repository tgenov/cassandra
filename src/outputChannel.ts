import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Conflict Watcher');
  }
  return channel;
}

export function log(msg: string): void {
  const ts = new Date().toISOString();
  getOutputChannel().appendLine(`[${ts}] ${msg}`);
}

export function logError(msg: string, err?: unknown): void {
  const errMsg = err instanceof Error ? err.message : String(err ?? '');
  log(`ERROR: ${msg}${errMsg ? ' — ' + errMsg : ''}`);
}
