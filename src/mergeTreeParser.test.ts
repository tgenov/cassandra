import { describe, it, expect } from 'vitest';
import {
  parseModernMergeTree,
  parseLegacyMergeTree,
  type ConflictFileEntry,
} from './mergeTreeParser';

const EMPTY_OID = '0'.repeat(40);
const OID_A = 'a'.repeat(40);
const OID_B = 'b'.repeat(40);
const OID_C = 'c'.repeat(40);
const OID_D = 'd'.repeat(40);
const OID_E = 'e'.repeat(40);
const OID_F = 'f'.repeat(40);
const TREE_OID = '1'.repeat(40);

describe('parseModernMergeTree', () => {
  it('returns no conflicts for a clean merge (exit code 0)', () => {
    const stdout = `${TREE_OID}\n`;
    const result = parseModernMergeTree(stdout, 0);

    expect(result.hasConflicts).toBe(false);
    expect(result.toplevelTreeOid).toBe(TREE_OID);
    expect(result.conflictFiles).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it('parses a single conflict with all three stages', () => {
    const lines = [
      TREE_OID,
      `100644 ${OID_A} 1\tsrc/file.ts`,
      `100644 ${OID_B} 2\tsrc/file.ts`,
      `100644 ${OID_C} 3\tsrc/file.ts`,
    ];
    const stdout = lines.join('\n');
    const result = parseModernMergeTree(stdout, 1);

    expect(result.hasConflicts).toBe(true);
    expect(result.toplevelTreeOid).toBe(TREE_OID);
    expect(result.conflictFiles).toHaveLength(1);
    expect(result.conflictFiles[0]).toEqual<ConflictFileEntry>({
      filepath: 'src/file.ts',
      baseOid: OID_A,
      oursOid: OID_B,
      theirsOid: OID_C,
    });
    expect(result.messages).toEqual([]);
  });

  it('parses multiple conflicting files', () => {
    const lines = [
      TREE_OID,
      `100644 ${OID_A} 1\tsrc/alpha.ts`,
      `100644 ${OID_B} 2\tsrc/alpha.ts`,
      `100644 ${OID_C} 3\tsrc/alpha.ts`,
      `100644 ${OID_D} 1\tsrc/beta.ts`,
      `100644 ${OID_E} 2\tsrc/beta.ts`,
      `100644 ${OID_F} 3\tsrc/beta.ts`,
    ];
    const stdout = lines.join('\n');
    const result = parseModernMergeTree(stdout, 1);

    expect(result.hasConflicts).toBe(true);
    expect(result.conflictFiles).toHaveLength(2);

    expect(result.conflictFiles[0]).toEqual<ConflictFileEntry>({
      filepath: 'src/alpha.ts',
      baseOid: OID_A,
      oursOid: OID_B,
      theirsOid: OID_C,
    });
    expect(result.conflictFiles[1]).toEqual<ConflictFileEntry>({
      filepath: 'src/beta.ts',
      baseOid: OID_D,
      oursOid: OID_E,
      theirsOid: OID_F,
    });
  });

  it('handles added-in-both (missing base stage) with EMPTY_OID for baseOid', () => {
    // When both branches add the same file independently, there is no
    // stage 1 (base). Only stages 2 (ours) and 3 (theirs) appear.
    const lines = [
      TREE_OID,
      `100644 ${OID_B} 2\tnew-file.ts`,
      `100644 ${OID_C} 3\tnew-file.ts`,
    ];
    const stdout = lines.join('\n');
    const result = parseModernMergeTree(stdout, 1);

    expect(result.hasConflicts).toBe(true);
    expect(result.conflictFiles).toHaveLength(1);
    expect(result.conflictFiles[0]).toEqual<ConflictFileEntry>({
      filepath: 'new-file.ts',
      baseOid: EMPTY_OID,
      oursOid: OID_B,
      theirsOid: OID_C,
    });
  });

  it('captures informational messages after the blank separator line', () => {
    const lines = [
      TREE_OID,
      `100644 ${OID_A} 1\tsrc/file.ts`,
      `100644 ${OID_B} 2\tsrc/file.ts`,
      `100644 ${OID_C} 3\tsrc/file.ts`,
      '', // blank line separator
      'Auto-merging src/file.ts',
      'CONFLICT (content): Merge conflict in src/file.ts',
    ];
    const stdout = lines.join('\n');
    const result = parseModernMergeTree(stdout, 1);

    expect(result.hasConflicts).toBe(true);
    expect(result.conflictFiles).toHaveLength(1);
    expect(result.messages).toEqual([
      'Auto-merging src/file.ts',
      'CONFLICT (content): Merge conflict in src/file.ts',
    ]);
  });

  it('handles empty output gracefully', () => {
    const result = parseModernMergeTree('', 0);

    expect(result.hasConflicts).toBe(false);
    expect(result.toplevelTreeOid).toBe('');
    expect(result.conflictFiles).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it('handles empty output with exit code 1 gracefully', () => {
    const result = parseModernMergeTree('', 1);

    expect(result.hasConflicts).toBe(false);
    expect(result.toplevelTreeOid).toBe('');
    expect(result.conflictFiles).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it('treats unexpected non-matching lines as messages', () => {
    const lines = [
      TREE_OID,
      'some unexpected line',
      `100644 ${OID_B} 2\tsrc/file.ts`,
      `100644 ${OID_C} 3\tsrc/file.ts`,
    ];
    const stdout = lines.join('\n');
    const result = parseModernMergeTree(stdout, 1);

    expect(result.messages).toContain('some unexpected line');
    expect(result.conflictFiles).toHaveLength(1);
  });

  it('ignores empty lines within the messages section', () => {
    const lines = [
      TREE_OID,
      `100644 ${OID_A} 1\tsrc/file.ts`,
      `100644 ${OID_B} 2\tsrc/file.ts`,
      `100644 ${OID_C} 3\tsrc/file.ts`,
      '', // separator
      'Auto-merging src/file.ts',
      '', // empty line within messages
      'CONFLICT (content): Merge conflict in src/file.ts',
    ];
    const stdout = lines.join('\n');
    const result = parseModernMergeTree(stdout, 1);

    // Empty lines within the messages section are skipped
    expect(result.messages).toEqual([
      'Auto-merging src/file.ts',
      'CONFLICT (content): Merge conflict in src/file.ts',
    ]);
  });

  it('handles filepaths containing spaces', () => {
    const lines = [
      TREE_OID,
      `100644 ${OID_A} 1\tpath with spaces/my file.ts`,
      `100644 ${OID_B} 2\tpath with spaces/my file.ts`,
      `100644 ${OID_C} 3\tpath with spaces/my file.ts`,
    ];
    const stdout = lines.join('\n');
    const result = parseModernMergeTree(stdout, 1);

    expect(result.conflictFiles).toHaveLength(1);
    expect(result.conflictFiles[0].filepath).toBe('path with spaces/my file.ts');
  });
});

describe('parseLegacyMergeTree', () => {
  it('returns no conflicts for empty output (clean merge)', () => {
    const result = parseLegacyMergeTree('');

    expect(result.hasConflicts).toBe(false);
    expect(result.toplevelTreeOid).toBe('');
    expect(result.conflictFiles).toEqual([]);
    expect(result.messages).toEqual([]);
  });

  it('parses a single "changed in both" block', () => {
    const lines = [
      'changed in both',
      `  base   100644 ${OID_A} src/file.ts`,
      `  our    100644 ${OID_B} src/file.ts`,
      `  their  100644 ${OID_C} src/file.ts`,
    ];
    const stdout = lines.join('\n');
    const result = parseLegacyMergeTree(stdout);

    expect(result.hasConflicts).toBe(true);
    expect(result.toplevelTreeOid).toBe('');
    expect(result.conflictFiles).toHaveLength(1);
    expect(result.conflictFiles[0]).toEqual<ConflictFileEntry>({
      filepath: 'src/file.ts',
      baseOid: OID_A,
      oursOid: OID_B,
      theirsOid: OID_C,
    });
  });

  it('parses multiple conflict blocks', () => {
    const lines = [
      'changed in both',
      `  base   100644 ${OID_A} src/alpha.ts`,
      `  our    100644 ${OID_B} src/alpha.ts`,
      `  their  100644 ${OID_C} src/alpha.ts`,
      '',
      'changed in both',
      `  base   100644 ${OID_D} src/beta.ts`,
      `  our    100644 ${OID_E} src/beta.ts`,
      `  their  100644 ${OID_F} src/beta.ts`,
    ];
    const stdout = lines.join('\n');
    const result = parseLegacyMergeTree(stdout);

    expect(result.hasConflicts).toBe(true);
    expect(result.conflictFiles).toHaveLength(2);

    expect(result.conflictFiles[0]).toEqual<ConflictFileEntry>({
      filepath: 'src/alpha.ts',
      baseOid: OID_A,
      oursOid: OID_B,
      theirsOid: OID_C,
    });
    expect(result.conflictFiles[1]).toEqual<ConflictFileEntry>({
      filepath: 'src/beta.ts',
      baseOid: OID_D,
      oursOid: OID_E,
      theirsOid: OID_F,
    });
  });

  it('handles "added in both" with no base line, setting baseOid to EMPTY_OID', () => {
    const lines = [
      'added in both',
      `  our    100644 ${OID_B} new-file.ts`,
      `  their  100644 ${OID_C} new-file.ts`,
    ];
    const stdout = lines.join('\n');
    const result = parseLegacyMergeTree(stdout);

    expect(result.hasConflicts).toBe(true);
    expect(result.conflictFiles).toHaveLength(1);
    expect(result.conflictFiles[0]).toEqual<ConflictFileEntry>({
      filepath: 'new-file.ts',
      baseOid: EMPTY_OID,
      oursOid: OID_B,
      theirsOid: OID_C,
    });
  });

  it('parses consecutive blocks without blank lines between them', () => {
    // The legacy parser should handle a new block header immediately
    // following the content lines of a previous block.
    const lines = [
      'changed in both',
      `  base   100644 ${OID_A} src/first.ts`,
      `  our    100644 ${OID_B} src/first.ts`,
      `  their  100644 ${OID_C} src/first.ts`,
      'added in both',
      `  our    100644 ${OID_D} src/second.ts`,
      `  their  100644 ${OID_E} src/second.ts`,
    ];
    const stdout = lines.join('\n');
    const result = parseLegacyMergeTree(stdout);

    expect(result.hasConflicts).toBe(true);
    expect(result.conflictFiles).toHaveLength(2);

    expect(result.conflictFiles[0]).toEqual<ConflictFileEntry>({
      filepath: 'src/first.ts',
      baseOid: OID_A,
      oursOid: OID_B,
      theirsOid: OID_C,
    });
    expect(result.conflictFiles[1]).toEqual<ConflictFileEntry>({
      filepath: 'src/second.ts',
      baseOid: EMPTY_OID,
      oursOid: OID_D,
      theirsOid: OID_E,
    });
  });

  it('ignores lines before the first block header', () => {
    const lines = [
      'some preamble text',
      'another line',
      'changed in both',
      `  base   100644 ${OID_A} src/file.ts`,
      `  our    100644 ${OID_B} src/file.ts`,
      `  their  100644 ${OID_C} src/file.ts`,
    ];
    const stdout = lines.join('\n');
    const result = parseLegacyMergeTree(stdout);

    expect(result.hasConflicts).toBe(true);
    expect(result.conflictFiles).toHaveLength(1);
    expect(result.conflictFiles[0].filepath).toBe('src/file.ts');
  });

  it('handles "removed in both" block headers', () => {
    // The regex also matches "removed in both" even though it typically
    // does not produce conflict entries with content lines.
    const lines = [
      'removed in both',
      '',
      'changed in both',
      `  base   100644 ${OID_A} src/file.ts`,
      `  our    100644 ${OID_B} src/file.ts`,
      `  their  100644 ${OID_C} src/file.ts`,
    ];
    const stdout = lines.join('\n');
    const result = parseLegacyMergeTree(stdout);

    expect(result.hasConflicts).toBe(true);
    expect(result.conflictFiles).toHaveLength(1);
    expect(result.conflictFiles[0].filepath).toBe('src/file.ts');
  });

  it('always returns an empty string for toplevelTreeOid', () => {
    const lines = [
      'changed in both',
      `  base   100644 ${OID_A} src/file.ts`,
      `  our    100644 ${OID_B} src/file.ts`,
      `  their  100644 ${OID_C} src/file.ts`,
    ];
    const stdout = lines.join('\n');
    const result = parseLegacyMergeTree(stdout);

    expect(result.toplevelTreeOid).toBe('');
  });

  it('always returns an empty messages array', () => {
    const lines = [
      'changed in both',
      `  base   100644 ${OID_A} src/file.ts`,
      `  our    100644 ${OID_B} src/file.ts`,
      `  their  100644 ${OID_C} src/file.ts`,
    ];
    const stdout = lines.join('\n');
    const result = parseLegacyMergeTree(stdout);

    expect(result.messages).toEqual([]);
  });
});
