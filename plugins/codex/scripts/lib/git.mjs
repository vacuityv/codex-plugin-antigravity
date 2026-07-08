// Git scope detection for Codex reviews.
// Maps the plugin's `--scope` / `--base` flags onto `codex exec review` flags.
import { spawnSync } from "node:child_process";

/**
 * Run a git command synchronously and return trimmed stdout (or "" on failure).
 * @param {string[]} args
 * @param {string} cwd
 */
export function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    return "";
  }
  return (result.stdout ?? "").trim();
}

/** @param {string} cwd */
export function isGitRepo(cwd) {
  return git(["rev-parse", "--is-inside-work-tree"], cwd) === "true";
}

/**
 * Summarise what would be reviewed so the caller can size the run.
 * @param {string} cwd
 * @param {{ base?: string|null, scope?: string }} options
 * @returns {{ empty: boolean, summary: string, base: string|null, scope: string }}
 */
export function describeReviewTarget(cwd, options = {}) {
  const scope = options.scope ?? "auto";
  const base = options.base ?? null;

  if (scope === "branch" || (scope === "auto" && base)) {
    const ref = base ?? "main";
    const stat = git(["diff", "--shortstat", `${ref}...HEAD`], cwd);
    const names = git(["diff", "--name-only", `${ref}...HEAD`], cwd);
    return {
      empty: names.length === 0,
      summary: stat || "no committed differences from base",
      base: ref,
      scope: "branch"
    };
  }

  // working-tree (default): staged + unstaged + untracked
  const status = git(["status", "--short", "--untracked-files=all"], cwd);
  const staged = git(["diff", "--shortstat", "--cached"], cwd);
  const unstaged = git(["diff", "--shortstat"], cwd);
  const summaryParts = [];
  if (staged) summaryParts.push(`staged: ${staged}`);
  if (unstaged) summaryParts.push(`unstaged: ${unstaged}`);
  return {
    empty: status.length === 0,
    summary: summaryParts.join("; ") || (status ? "untracked changes only" : "clean working tree"),
    base,
    scope: "working-tree"
  };
}
