import * as vscode from 'vscode';
import { getConfig } from './config';
import { gitVersion, gitFetch, gitRevParse, gitMergeBase, gitMergeTreeModern, gitMergeTreeLegacy, supportsModernMergeTree, gitStatusTracked, gitUpstream, gitMergeFF, gitRevListCount } from './gitOps';
import { parseModernMergeTree, parseLegacyMergeTree } from './mergeTreeParser';
import { ConflictState } from './conflictState';
import type { ConflictSnapshot, StateChange } from './conflictState';
import { log, logError } from './outputChannel';

export class ConflictDetector implements vscode.Disposable {
  private readonly state = new ConflictState();
  private readonly _onConflictsUpdated = new vscode.EventEmitter<{ snapshot: ConflictSnapshot; change: StateChange }>();
  readonly onConflictsUpdated = this._onConflictsUpdated.event;

  private readonly _onAutoPulled = new vscode.EventEmitter<{ commitCount: number; newHead: string }>();
  readonly onAutoPulled = this._onAutoPulled.event;

  private timer: ReturnType<typeof setInterval> | undefined;
  private isRunning = false;
  private isPaused = false;
  private useModern = true;
  private readonly cwd: string;
  private readonly resolvedFiles = new Set<string>();
  private lastRawFilepaths: string[] = [];

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  async start(): Promise<void> {
    // Detect git version
    try {
      const result = await gitVersion();
      const version = result.stdout.trim().replace(/^git version\s*/, '');
      this.useModern = supportsModernMergeTree(version);
      log(`Git version: ${version}, modern merge-tree: ${this.useModern}`);
    } catch (err) {
      logError('Failed to detect git version', err);
      this.useModern = false;
    }

    await this.checkNow();
    this.restartTimer();
  }

  restartTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    const config = getConfig();
    if (!config.enabled) {
      return;
    }
    this.timer = setInterval(() => {
      if (!this.isPaused) {
        this.checkNow();
      }
    }, config.pollIntervalMs);
  }

  async checkNow(): Promise<void> {
    if (this.isRunning) {
      log('Check already in progress, skipping');
      return;
    }
    this.isRunning = true;

    // Emit checking state
    const checkingSnapshot: ConflictSnapshot = {
      timestamp: Date.now(),
      status: 'checking',
      conflictFiles: [],
      toplevelTreeOid: '',
    };
    this._onConflictsUpdated.fire({ snapshot: checkingSnapshot, change: { changed: true, isNewConflict: false } });

    try {
      const config = getConfig();
      const remoteRef = `${config.remote}/${config.branch}`;

      // Step 1: Fetch
      try {
        await gitFetch(this.cwd, config.remote);
      } catch (err) {
        this.emitError('fetch-failed', `Failed to fetch from ${config.remote}`, err);
        return;
      }

      // Step 2: Get HEAD
      let head: string;
      try {
        const result = await gitRevParse(this.cwd, 'HEAD');
        head = result.stdout.trim();
      } catch (err) {
        this.emitError('no-head', 'Failed to resolve HEAD', err);
        return;
      }

      // Step 3: Get remote ref
      let remote: string;
      try {
        const result = await gitRevParse(this.cwd, remoteRef);
        remote = result.stdout.trim();
      } catch (err) {
        this.emitError('branch-missing', `Remote branch ${remoteRef} not found`, err);
        return;
      }

      // Step 3.5: Auto-pull (fast-forward current branch from its upstream)
      if (config.autoPull) {
        try {
          const upstreamResult = await gitUpstream(this.cwd);
          if (upstreamResult.exitCode !== 0) {
            log('Auto-pull: current branch has no upstream, skipping');
          } else {
            const upstreamSha = upstreamResult.stdout.trim();
            if (head === upstreamSha) {
              // Already up to date, nothing to pull
            } else {
              const statusResult = await gitStatusTracked(this.cwd);
              if (statusResult.stdout.trim() !== '') {
                log('Auto-pull: tracked files have uncommitted changes, skipping');
              } else {
                const oldHead = head;
                const mergeResult = await gitMergeFF(this.cwd);
                if (mergeResult.exitCode === 0) {
                  const newHeadResult = await gitRevParse(this.cwd, 'HEAD');
                  head = newHeadResult.stdout.trim();
                  const countResult = await gitRevListCount(this.cwd, oldHead, head);
                  const commitCount = parseInt(countResult.stdout.trim(), 10) || 0;
                  log(`Auto-pull: fast-forwarded ${commitCount} commit(s), new HEAD: ${head}`);
                  this._onAutoPulled.fire({ commitCount, newHead: head });
                } else {
                  log('Auto-pull: cannot fast-forward, skipping');
                }
              }
            }
          }
        } catch (err) {
          logError('Auto-pull failed, continuing with conflict check', err);
        }
      }

      // Step 4: merge-tree
      try {
        let snapshot: ConflictSnapshot;

        if (this.useModern) {
          const result = await gitMergeTreeModern(this.cwd, head, remote);
          const parsed = parseModernMergeTree(result.stdout, result.exitCode);
          snapshot = {
            timestamp: Date.now(),
            status: parsed.hasConflicts ? 'conflicts' : 'clean',
            conflictFiles: parsed.conflictFiles,
            toplevelTreeOid: parsed.toplevelTreeOid,
          };
        } else {
          const baseResult = await gitMergeBase(this.cwd, head, remote);
          const base = baseResult.stdout.trim();
          const result = await gitMergeTreeLegacy(this.cwd, base, head, remote);
          const parsed = parseLegacyMergeTree(result.stdout);
          snapshot = {
            timestamp: Date.now(),
            status: parsed.hasConflicts ? 'conflicts' : 'clean',
            conflictFiles: parsed.conflictFiles,
            toplevelTreeOid: parsed.toplevelTreeOid,
          };
        }

        // Track raw conflict set; clear resolved files when git state changes
        const rawFilepaths = snapshot.conflictFiles.map(f => f.filepath).sort();
        if (
          rawFilepaths.length !== this.lastRawFilepaths.length ||
          rawFilepaths.some((fp, i) => fp !== this.lastRawFilepaths[i])
        ) {
          this.resolvedFiles.clear();
        }
        this.lastRawFilepaths = rawFilepaths;

        // Filter out user-resolved files
        const effectiveFiles = snapshot.conflictFiles.filter(
          f => !this.resolvedFiles.has(f.filepath),
        );
        snapshot = {
          ...snapshot,
          conflictFiles: effectiveFiles,
          status: effectiveFiles.length > 0 ? 'conflicts' : 'clean',
        };

        const change = this.state.update(snapshot);
        if (change.changed) {
          log(`State changed: ${snapshot.status}, ${snapshot.conflictFiles.length} conflict files (${this.resolvedFiles.size} resolved)`);
        }
        this._onConflictsUpdated.fire({ snapshot, change });
      } catch (err) {
        this.emitError('merge-tree-failed', 'merge-tree failed', err);
      }
    } finally {
      this.isRunning = false;
    }
  }

  togglePause(): boolean {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      const snapshot: ConflictSnapshot = {
        timestamp: Date.now(),
        status: 'paused',
        conflictFiles: [],
        toplevelTreeOid: '',
      };
      this._onConflictsUpdated.fire({ snapshot, change: { changed: true, isNewConflict: false } });
    } else {
      this.checkNow();
    }
    return this.isPaused;
  }

  /** Mark a file as resolved so it's excluded from the conflict count until git state changes. */
  markResolved(filepath: string): void {
    this.resolvedFiles.add(filepath);
    log(`Marked "${filepath}" as resolved`);

    // Re-emit an updated snapshot immediately so the status bar refreshes
    const current = this.state.current;
    if (current && current.status === 'conflicts') {
      const effectiveFiles = current.conflictFiles.filter(
        f => !this.resolvedFiles.has(f.filepath),
      );
      const snapshot: ConflictSnapshot = {
        ...current,
        timestamp: Date.now(),
        conflictFiles: effectiveFiles,
        status: effectiveFiles.length > 0 ? 'conflicts' : 'clean',
      };
      const change = this.state.update(snapshot);
      this._onConflictsUpdated.fire({ snapshot, change });
    }
  }

  get paused(): boolean {
    return this.isPaused;
  }

  get currentSnapshot(): ConflictSnapshot | undefined {
    return this.state.current;
  }

  private emitError(errorKind: ConflictSnapshot['errorKind'], message: string, err?: unknown): void {
    logError(message, err);
    const snapshot: ConflictSnapshot = {
      timestamp: Date.now(),
      status: 'error',
      errorKind,
      errorMessage: message,
      conflictFiles: [],
      toplevelTreeOid: '',
    };
    const change = this.state.update(snapshot);
    this._onConflictsUpdated.fire({ snapshot, change });
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this._onConflictsUpdated.dispose();
    this._onAutoPulled.dispose();
  }
}
