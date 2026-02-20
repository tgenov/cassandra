import * as vscode from 'vscode';
import { ConflictContentProvider } from './contentProvider';
import { gitLog } from './gitOps';
import { logError } from './outputChannel';

export class ConflictHoverProvider implements vscode.HoverProvider {
  private cache = new Map<string, string>();

  constructor(private readonly contentProvider: ConflictContentProvider) {}

  async provideHover(
    document: vscode.TextDocument,
  ): Promise<vscode.Hover | undefined> {
    const { filepath, version } = ConflictContentProvider.parseUri(document.uri);
    if (version !== 'theirs') {
      return undefined;
    }

    const ctx = this.contentProvider.getContext();
    if (!ctx) {
      return undefined;
    }

    let logOutput = this.cache.get(filepath);
    if (logOutput === undefined) {
      try {
        const result = await gitLog(ctx.cwd, filepath, ctx.mergeBase, ctx.remoteRef);
        logOutput = result.stdout.trim();
      } catch (err) {
        logError(`Failed to get commit log for ${filepath}`, err);
        logOutput = '';
      }
      this.cache.set(filepath, logOutput);
    }

    if (!logOutput) {
      return undefined;
    }

    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**Incoming commits for** \`${filepath}\`\n\n`);
    md.appendCodeblock(logOutput, 'text');
    return new vscode.Hover(md);
  }
}
