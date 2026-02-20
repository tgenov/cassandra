/**
 * Parsers for `git merge-tree` output in both modern (--write-tree) and
 * legacy formats. Produces a structured result describing which files
 * conflict and the OIDs for each stage (base, ours, theirs).
 */

export interface ConflictFileEntry {
  filepath: string;
  baseOid: string;
  oursOid: string;
  theirsOid: string;
}

export interface MergeTreeResult {
  hasConflicts: boolean;
  toplevelTreeOid: string;
  conflictFiles: ConflictFileEntry[];
  messages: string[];
}

const EMPTY_OID = '0'.repeat(40);

/**
 * Regex for modern merge-tree stage lines.
 * Captures: mode, oid (40-hex), stage number, filepath.
 *
 * Example line:
 *   100644 abc123...def789 2	src/file.ts
 */
const MODERN_STAGE_RE = /^(\d{6})\s([0-9a-f]{40})\s(\d)\t(.+)$/;

/**
 * Regex for legacy merge-tree content lines within a conflict block.
 * Captures: side (base|our|their), mode, oid, filepath.
 *
 * Example line:
 *     base   100644 abc123...def789 src/file.ts
 */
const LEGACY_CONTENT_RE = /^\s+(base|our|their)\s+(\d{6})\s+([0-9a-f]{40})\s+(.+)$/;

/**
 * Regex for legacy merge-tree block header lines.
 *
 * Example lines:
 *   changed in both
 *   added in both
 */
const LEGACY_BLOCK_RE = /^(changed in both|added in both|removed in both)/;

/**
 * Parses the output of `git merge-tree --write-tree` (Git 2.38+).
 *
 * Output format:
 *   Line 0: top-level tree OID (always present).
 *   If exitCode is 0, merge is clean -- no conflicts.
 *   If exitCode is 1, subsequent lines list conflicted file stages
 *   in the format: mode oid stage<TAB>filepath.
 *   A blank line separates stage entries from informational messages.
 *
 * Files may lack a base stage (stage 1) when both branches added the
 * same path independently. In that case, baseOid is set to EMPTY_OID.
 */
export function parseModernMergeTree(
  stdout: string,
  exitCode: number,
): MergeTreeResult {
  const lines = stdout.split('\n');

  const toplevelTreeOid = (lines[0] ?? '').trim();

  if (exitCode === 0) {
    return {
      hasConflicts: false,
      toplevelTreeOid,
      conflictFiles: [],
      messages: [],
    };
  }

  const stageMap = new Map<
    string,
    { baseOid: string; oursOid: string; theirsOid: string }
  >();
  const messages: string[] = [];
  let inMessages = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];

    if (inMessages) {
      if (line.length > 0) {
        messages.push(line);
      }
      continue;
    }

    // A blank line marks the transition from stage entries to messages.
    if (line === '') {
      inMessages = true;
      continue;
    }

    const match = MODERN_STAGE_RE.exec(line);
    if (!match) {
      // Unexpected line format; treat as a message.
      messages.push(line);
      continue;
    }

    const oid = match[2];
    const stage = match[3];
    const filepath = match[4];

    let entry = stageMap.get(filepath);
    if (!entry) {
      entry = { baseOid: EMPTY_OID, oursOid: EMPTY_OID, theirsOid: EMPTY_OID };
      stageMap.set(filepath, entry);
    }

    switch (stage) {
      case '1':
        entry.baseOid = oid;
        break;
      case '2':
        entry.oursOid = oid;
        break;
      case '3':
        entry.theirsOid = oid;
        break;
    }
  }

  const conflictFiles: ConflictFileEntry[] = [];
  for (const [filepath, oids] of stageMap) {
    conflictFiles.push({ filepath, ...oids });
  }

  return {
    hasConflicts: conflictFiles.length > 0,
    toplevelTreeOid,
    conflictFiles,
    messages,
  };
}

/**
 * Parses the output of the legacy `git merge-tree` command (pre-2.38).
 *
 * Output format consists of blocks introduced by a header line such as
 * "changed in both" or "added in both", followed by indented lines
 * describing each side's version of the file:
 *
 *   changed in both
 *     base   100644 <oid> <filepath>
 *     our    100644 <oid> <filepath>
 *     their  100644 <oid> <filepath>
 *
 * The legacy format does not produce a top-level tree OID.
 */
export function parseLegacyMergeTree(stdout: string): MergeTreeResult {
  const lines = stdout.split('\n');

  const fileMap = new Map<
    string,
    { baseOid: string; oursOid: string; theirsOid: string }
  >();
  let insideBlock = false;

  for (const line of lines) {
    if (LEGACY_BLOCK_RE.test(line)) {
      insideBlock = true;
      continue;
    }

    if (!insideBlock) {
      continue;
    }

    // A non-indented, non-empty line that is not a block header ends the
    // current block. A blank line also ends the block.
    if (line === '' || (line.length > 0 && !/^\s/.test(line))) {
      insideBlock = false;
      // If this new line is itself a block header, re-enter block mode.
      if (LEGACY_BLOCK_RE.test(line)) {
        insideBlock = true;
      }
      continue;
    }

    const match = LEGACY_CONTENT_RE.exec(line);
    if (!match) {
      continue;
    }

    const side = match[1];
    const oid = match[3];
    const filepath = match[4];

    let entry = fileMap.get(filepath);
    if (!entry) {
      entry = { baseOid: EMPTY_OID, oursOid: EMPTY_OID, theirsOid: EMPTY_OID };
      fileMap.set(filepath, entry);
    }

    switch (side) {
      case 'base':
        entry.baseOid = oid;
        break;
      case 'our':
        entry.oursOid = oid;
        break;
      case 'their':
        entry.theirsOid = oid;
        break;
    }
  }

  const conflictFiles: ConflictFileEntry[] = [];
  for (const [filepath, oids] of fileMap) {
    conflictFiles.push({ filepath, ...oids });
  }

  return {
    hasConflicts: conflictFiles.length > 0,
    toplevelTreeOid: '',
    conflictFiles,
    messages: [],
  };
}
