import { describe, it, expect } from 'vitest';
import { ConflictState } from './conflictState';
import type { ConflictSnapshot } from './conflictState';
import type { ConflictFileEntry } from './mergeTreeParser';

function makeSnapshot(overrides: Partial<ConflictSnapshot> = {}): ConflictSnapshot {
  return {
    timestamp: Date.now(),
    status: 'clean',
    conflictFiles: [],
    toplevelTreeOid: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    ...overrides,
  };
}

function makeConflictFile(filepath: string): ConflictFileEntry {
  return {
    filepath,
    baseOid: '0000000000000000000000000000000000000000',
    oursOid: '1111111111111111111111111111111111111111',
    theirsOid: '2222222222222222222222222222222222222222',
  };
}

describe('ConflictState', () => {
  it('first update always reports changed', () => {
    const state = new ConflictState();
    const result = state.update(makeSnapshot({ status: 'clean' }));

    expect(result.changed).toBe(true);
  });

  it('first update with conflicts reports isNewConflict', () => {
    const state = new ConflictState();
    const result = state.update(
      makeSnapshot({
        status: 'conflicts',
        conflictFiles: [makeConflictFile('src/index.ts')],
      }),
    );

    expect(result.changed).toBe(true);
    expect(result.isNewConflict).toBe(true);
  });

  it('first update with clean status does not report isNewConflict', () => {
    const state = new ConflictState();
    const result = state.update(makeSnapshot({ status: 'clean' }));

    expect(result.changed).toBe(true);
    expect(result.isNewConflict).toBe(false);
  });

  it('same snapshot twice reports no change and no new conflict', () => {
    const state = new ConflictState();
    const snapshot = makeSnapshot({ status: 'clean' });

    state.update(snapshot);
    const result = state.update(snapshot);

    expect(result.changed).toBe(false);
    expect(result.isNewConflict).toBe(false);
  });

  it('clean to conflicts transition reports isNewConflict', () => {
    const state = new ConflictState();
    state.update(makeSnapshot({ status: 'clean' }));

    const result = state.update(
      makeSnapshot({
        status: 'conflicts',
        conflictFiles: [makeConflictFile('src/app.ts')],
      }),
    );

    expect(result.changed).toBe(true);
    expect(result.isNewConflict).toBe(true);
  });

  it('conflicts to clean transition reports changed but not isNewConflict', () => {
    const state = new ConflictState();
    state.update(
      makeSnapshot({
        status: 'conflicts',
        conflictFiles: [makeConflictFile('src/app.ts')],
      }),
    );

    const result = state.update(makeSnapshot({ status: 'clean' }));

    expect(result.changed).toBe(true);
    expect(result.isNewConflict).toBe(false);
  });

  it('file set change while still in conflicts reports isNewConflict', () => {
    const state = new ConflictState();
    state.update(
      makeSnapshot({
        status: 'conflicts',
        conflictFiles: [makeConflictFile('src/app.ts')],
      }),
    );

    const result = state.update(
      makeSnapshot({
        status: 'conflicts',
        conflictFiles: [
          makeConflictFile('src/app.ts'),
          makeConflictFile('src/utils.ts'),
        ],
      }),
    );

    expect(result.changed).toBe(true);
    expect(result.isNewConflict).toBe(true);
  });

  it('error to conflicts transition reports isNewConflict', () => {
    const state = new ConflictState();
    state.update(
      makeSnapshot({
        status: 'error',
        errorKind: 'fetch-failed',
        errorMessage: 'Network unreachable',
      }),
    );

    const result = state.update(
      makeSnapshot({
        status: 'conflicts',
        conflictFiles: [makeConflictFile('src/config.ts')],
      }),
    );

    expect(result.changed).toBe(true);
    expect(result.isNewConflict).toBe(true);
  });

  it('paused to conflicts transition reports isNewConflict', () => {
    const state = new ConflictState();
    state.update(makeSnapshot({ status: 'paused' }));

    const result = state.update(
      makeSnapshot({
        status: 'conflicts',
        conflictFiles: [makeConflictFile('src/main.ts')],
      }),
    );

    expect(result.changed).toBe(true);
    expect(result.isNewConflict).toBe(true);
  });

  it('reset clears state so next update behaves like first update', () => {
    const state = new ConflictState();
    state.update(makeSnapshot({ status: 'clean' }));
    state.reset();

    expect(state.current).toBeUndefined();

    const result = state.update(
      makeSnapshot({
        status: 'conflicts',
        conflictFiles: [makeConflictFile('src/index.ts')],
      }),
    );

    expect(result.changed).toBe(true);
    expect(result.isNewConflict).toBe(true);
  });

  it('same status conflicts with same files reports no change', () => {
    const state = new ConflictState();
    const conflictFiles = [
      makeConflictFile('src/alpha.ts'),
      makeConflictFile('src/beta.ts'),
    ];

    state.update(makeSnapshot({ status: 'conflicts', conflictFiles }));
    const result = state.update(
      makeSnapshot({ status: 'conflicts', conflictFiles }),
    );

    expect(result.changed).toBe(false);
    expect(result.isNewConflict).toBe(false);
  });
});
