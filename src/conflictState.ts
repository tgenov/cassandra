import type { ConflictFileEntry } from './mergeTreeParser';

export type ConflictStatus = 'clean' | 'conflicts' | 'error' | 'paused' | 'checking';

export interface ConflictSnapshot {
  timestamp: number;
  status: ConflictStatus;
  errorKind?: 'fetch-failed' | 'no-head' | 'branch-missing' | 'merge-tree-failed';
  errorMessage?: string;
  conflictFiles: ConflictFileEntry[];
  toplevelTreeOid: string;
}

export interface StateChange {
  changed: boolean;
  isNewConflict: boolean;
}

/**
 * Extracts and sorts file paths from a conflict snapshot for comparison.
 */
function sortedFilePaths(snapshot: ConflictSnapshot): string[] {
  return snapshot.conflictFiles.map(f => f.filepath).sort();
}

/**
 * Returns true when two snapshots have identical sets of conflicting file paths.
 */
function conflictFileSetsEqual(
  a: ConflictSnapshot,
  b: ConflictSnapshot,
): boolean {
  const pathsA = sortedFilePaths(a);
  const pathsB = sortedFilePaths(b);

  if (pathsA.length !== pathsB.length) {
    return false;
  }

  for (let i = 0; i < pathsA.length; i++) {
    if (pathsA[i] !== pathsB[i]) {
      return false;
    }
  }

  return true;
}

const STATUSES_THAT_TRANSITION_TO_NEW_CONFLICT: ReadonlySet<ConflictStatus> =
  new Set<ConflictStatus>(['clean', 'error', 'paused']);

/**
 * Manages conflict state and deduplication for notifications.
 *
 * Tracks the previous snapshot so callers can determine whether a new
 * notification should be emitted. The comparison is based on the status
 * field and the set of conflicting file paths (order-independent).
 */
export class ConflictState {
  private previous: ConflictSnapshot | undefined;

  /**
   * Compares the incoming snapshot against the previous one and reports
   * whether the state changed and whether a new conflict notification
   * should fire.
   *
   * A change is detected when:
   *  - The status field differs from the previous snapshot, OR
   *  - The set of conflicting file paths differs.
   *
   * A new conflict is detected when:
   *  - Transitioning from clean/error/paused to conflicts, OR
   *  - Already in conflicts but the file set changed.
   */
  update(snapshot: ConflictSnapshot): StateChange {
    const prev = this.previous;
    this.previous = snapshot;

    if (prev === undefined) {
      return {
        changed: true,
        isNewConflict: snapshot.status === 'conflicts',
      };
    }

    const statusChanged = prev.status !== snapshot.status;
    const fileSetChanged = !conflictFileSetsEqual(prev, snapshot);
    const changed = statusChanged || fileSetChanged;

    const transitionToConflicts =
      snapshot.status === 'conflicts' &&
      STATUSES_THAT_TRANSITION_TO_NEW_CONFLICT.has(prev.status);

    const conflictSetGrew =
      snapshot.status === 'conflicts' &&
      prev.status === 'conflicts' &&
      fileSetChanged;

    const isNewConflict = transitionToConflicts || conflictSetGrew;

    return { changed, isNewConflict };
  }

  /** Returns the most recent snapshot, or undefined if no update has occurred. */
  get current(): ConflictSnapshot | undefined {
    return this.previous;
  }

  /** Clears all tracked state, as if freshly constructed. */
  reset(): void {
    this.previous = undefined;
  }
}
