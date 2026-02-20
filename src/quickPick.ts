import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ConflictSnapshot } from './conflictState';
import type { ConflictFileEntry } from './mergeTreeParser';
import { ConflictContentProvider } from './contentProvider';
import { gitShowFile, gitShow, gitMergeBase } from './gitOps';
import { getConfig } from './config';
import { log, logError } from './outputChannel';

export async function showConflictQuickPick(
  snapshot: ConflictSnapshot | undefined,
  contentProvider: ConflictContentProvider,
  cwd: string
): Promise<void> {
  if (!snapshot || snapshot.status !== 'conflicts' || snapshot.conflictFiles.length === 0) {
    vscode.window.showInformationMessage('Conflict Watcher: No conflicts detected.');
    return;
  }

  // First pick: select a file
  const fileItems = snapshot.conflictFiles.map(f => ({
    label: f.filepath,
    description: `base:${f.baseOid.slice(0, 7) || '(none)'} ours:${f.oursOid.slice(0, 7) || '(none)'} theirs:${f.theirsOid.slice(0, 7) || '(none)'}`,
    file: f,
  }));

  const picked = await vscode.window.showQuickPick(fileItems, {
    placeHolder: `${snapshot.conflictFiles.length} conflicting file(s) — select to view`,
  });
  if (!picked) return;

  // Second pick: choose view mode
  const viewMode = await vscode.window.showQuickPick(
    [
      { label: '$(diff) VS Code Diff', description: 'Diff view (respects your inline/side-by-side setting)', mode: 'diff' as const },
      { label: '$(file) Preview with conflict markers', description: 'Single editor with markers', mode: 'preview' as const },
    ],
    { placeHolder: `How to view ${picked.file.filepath}?` }
  );
  if (!viewMode) return;

  try {
    if (viewMode.mode === 'diff') {
      await showDiffView(picked.file, contentProvider, cwd);
    } else {
      await showPreview(picked.file, snapshot.toplevelTreeOid, contentProvider, cwd);
    }
  } catch (err) {
    logError(`Failed to show ${viewMode.mode} view for ${picked.file.filepath}`, err);
    vscode.window.showErrorMessage(`Conflict Watcher: Failed to show ${viewMode.mode} view.`);
  }
}

async function showDiffView(
  file: ConflictFileEntry,
  contentProvider: ConflictContentProvider,
  cwd: string
): Promise<void> {
  // Get "ours" content from working tree
  let oursContent: string;
  try {
    const fullPath = path.join(cwd, file.filepath);
    oursContent = await fs.readFile(fullPath, 'utf-8');
  } catch {
    // Fallback: read from git object
    if (file.oursOid) {
      const result = await gitShow(cwd, file.oursOid);
      oursContent = result.stdout;
    } else {
      oursContent = '';
    }
  }

  // Get "theirs" content from git object
  let theirsContent = '';
  if (file.theirsOid) {
    const result = await gitShow(cwd, file.theirsOid);
    theirsContent = result.stdout;
  }

  const oursUri = ConflictContentProvider.buildUri(file.filepath, 'ours');
  const theirsUri = ConflictContentProvider.buildUri(file.filepath, 'theirs');

  contentProvider.setContent(oursUri, oursContent);
  contentProvider.setContent(theirsUri, theirsContent);
  contentProvider.setFileMetadata(file.filepath, file);

  // Compute merge-base for hover provider context
  const cfg = getConfig();
  const remoteRef = `${cfg.remote}/${cfg.branch}`;
  try {
    const mbResult = await gitMergeBase(cwd, 'HEAD', remoteRef);
    const mergeBase = mbResult.stdout.trim();
    contentProvider.setContext(cwd, remoteRef, mergeBase);
  } catch {
    log('Could not compute merge-base; hover commit log will be unavailable');
  }

  await vscode.commands.executeCommand(
    'vscode.diff',
    oursUri,
    theirsUri,
    `${file.filepath} (Ours ↔ Theirs)`
  );
  log(`Opened diff view for ${file.filepath}`);

  await promptConflictAction(file, cwd);
}

async function showPreview(
  file: ConflictFileEntry,
  toplevelTreeOid: string,
  contentProvider: ConflictContentProvider,
  cwd: string
): Promise<void> {
  let previewContent: string;

  if (toplevelTreeOid) {
    // Modern mode: tree OID contains conflict markers already
    try {
      const result = await gitShowFile(cwd, toplevelTreeOid, file.filepath);
      previewContent = result.stdout;
    } catch {
      previewContent = await buildConflictMarkers(file, cwd);
    }
  } else {
    previewContent = await buildConflictMarkers(file, cwd);
  }

  const previewUri = ConflictContentProvider.buildUri(file.filepath, 'preview');
  contentProvider.setContent(previewUri, previewContent);
  contentProvider.setFileMetadata(file.filepath, file);

  const doc = await vscode.workspace.openTextDocument(previewUri);
  await vscode.window.showTextDocument(doc, { preview: true });
  log(`Opened preview for ${file.filepath}`);

  await promptConflictAction(file, cwd);
}

async function promptConflictAction(file: ConflictFileEntry, cwd: string): Promise<void> {
  const action = await vscode.window.showInformationMessage(
    `Conflict: ${file.filepath}`,
    'Accept Ours',
    'Accept Theirs',
    'Open in Editor',
  );

  if (action === 'Accept Ours') {
    await vscode.commands.executeCommand('conflictWatcher.acceptVersion', file.filepath, 'ours');
  } else if (action === 'Accept Theirs') {
    await vscode.commands.executeCommand('conflictWatcher.acceptVersion', file.filepath, 'theirs');
  } else if (action === 'Open in Editor') {
    const fileUri = vscode.Uri.file(path.join(cwd, file.filepath));
    await vscode.window.showTextDocument(fileUri, { viewColumn: vscode.ViewColumn.Beside });
  }
}

async function buildConflictMarkers(file: ConflictFileEntry, cwd: string): Promise<string> {
  let oursContent = '';
  let theirsContent = '';

  if (file.oursOid) {
    const result = await gitShow(cwd, file.oursOid);
    oursContent = result.stdout;
  }
  if (file.theirsOid) {
    const result = await gitShow(cwd, file.theirsOid);
    theirsContent = result.stdout;
  }

  return [
    '<<<<<<< OURS',
    oursContent,
    '=======',
    theirsContent,
    '>>>>>>> THEIRS',
    '',
  ].join('\n');
}
