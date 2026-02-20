import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 10 * 1024 * 1024; // 10 MB
const TIMEOUT_MS = 30_000; // 30 seconds

export interface GitExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Executes a git command and returns stdout, stderr, and exitCode.
 *
 * By default, promisified execFile throws on non-zero exit codes.
 * Callers that expect non-zero exits (e.g. merge-tree with conflicts)
 * should pass the expected codes in `allowedExitCodes`.
 */
async function exec(
  args: string[],
  cwd: string,
  allowedExitCodes: number[] = [0],
): Promise<GitExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: MAX_BUFFER,
      timeout: TIMEOUT_MS,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: unknown) {
    // execFile throws an Error with additional properties when the
    // child process exits with a non-zero code. Extract what we need.
    const err = error as {
      code?: number | string;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
    };

    const exitCode =
      typeof err.code === "number" ? err.code : undefined;

    if (exitCode !== undefined && allowedExitCodes.includes(exitCode)) {
      return {
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? "",
        exitCode,
      };
    }

    throw error;
  }
}

/**
 * Returns true if the installed git version supports the modern
 * `git merge-tree --write-tree` three-way merge (requires >= 2.38).
 */
export function supportsModernMergeTree(versionString: string): boolean {
  // Expected format: "git version 2.43.0" or "git version 2.38.1.windows.1"
  const match = versionString.match(/(\d+)\.(\d+)/);
  if (!match) {
    return false;
  }
  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  return major > 2 || (major === 2 && minor >= 38);
}

/** Returns the raw `git --version` output. */
export async function gitVersion(): Promise<GitExecResult> {
  return exec(["--version"], ".");
}

/** Fetches the latest refs from the given remote. */
export async function gitFetch(
  cwd: string,
  remote: string,
): Promise<GitExecResult> {
  return exec(["fetch", remote], cwd);
}

/** Resolves a ref to a full SHA. */
export async function gitRevParse(
  cwd: string,
  ref: string,
): Promise<GitExecResult> {
  return exec(["rev-parse", ref], cwd);
}

/** Finds the best common ancestor of two commits. */
export async function gitMergeBase(
  cwd: string,
  a: string,
  b: string,
): Promise<GitExecResult> {
  return exec(["merge-base", a, b], cwd);
}

/**
 * Modern three-way merge-tree (git >= 2.38).
 *
 * Runs `git merge-tree --write-tree <head> <remote>`.
 * Exit code 0 means no conflicts; exit code 1 means conflicts exist.
 * Both are valid outcomes -- only unexpected exit codes are re-thrown.
 */
export async function gitMergeTreeModern(
  cwd: string,
  head: string,
  remote: string,
): Promise<GitExecResult> {
  return exec(["merge-tree", "--write-tree", head, remote], cwd, [0, 1]);
}

/**
 * Legacy three-way merge-tree (git < 2.38).
 *
 * Runs `git merge-tree <base> <head> <remote>`.
 * Always exits 0; conflict information is written to stdout.
 */
export async function gitMergeTreeLegacy(
  cwd: string,
  base: string,
  head: string,
  remote: string,
): Promise<GitExecResult> {
  return exec(["merge-tree", base, head, remote], cwd);
}

/** Shows the content of a commit object. */
export async function gitShow(
  cwd: string,
  ref: string,
): Promise<GitExecResult> {
  return exec(["show", ref], cwd);
}

/** Shows the content of a specific file at a given ref. */
export async function gitShowFile(
  cwd: string,
  ref: string,
  filepath: string,
): Promise<GitExecResult> {
  return exec(["show", `${ref}:${filepath}`], cwd);
}

/** Returns the working tree status (empty stdout = clean). */
export async function gitStatus(cwd: string): Promise<GitExecResult> {
  return exec(["status", "--porcelain"], cwd);
}

/** Returns the working tree status for tracked files only (empty stdout = clean for merge). */
export async function gitStatusTracked(cwd: string): Promise<GitExecResult> {
  return exec(["status", "--porcelain", "-uno"], cwd);
}

/** Resolves the current branch's upstream ref. Exit 128 = no upstream configured. */
export async function gitUpstream(cwd: string): Promise<GitExecResult> {
  return exec(["rev-parse", "@{upstream}"], cwd, [0, 128]);
}

/** Rebase current branch onto its upstream, auto-stashing any local changes. Exit 0 = success, 1/128 = rebase failed. */
export async function gitPullRebase(cwd: string): Promise<GitExecResult> {
  return exec(["pull", "--rebase", "--autostash"], cwd, [0, 1, 128]);
}

/** Returns oneline log of commits reachable from `until` but not from `since`, scoped to a file. */
export async function gitLog(
  cwd: string,
  filepath: string,
  since: string,
  until: string,
): Promise<GitExecResult> {
  return exec(
    ['log', '--oneline', '--no-decorate', `${since}..${until}`, '--', filepath],
    cwd,
  );
}

/** Creates a temporary commit from the working tree state. No side effects — does not mutate index, working tree, or stash list. */
export async function gitStashCreate(cwd: string): Promise<GitExecResult> {
  return exec(["stash", "create"], cwd);
}

/** Counts commits reachable from `to` but not from `from`. */
export async function gitRevListCount(
  cwd: string,
  from: string,
  to: string,
): Promise<GitExecResult> {
  return exec(["rev-list", "--count", `${from}..${to}`], cwd);
}
