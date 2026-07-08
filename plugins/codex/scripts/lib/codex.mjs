// Resolve and invoke the Codex CLI (`codex exec`) for the Antigravity plugin.
//
// Everything here is host-agnostic: the plugin never depends on Claude Code or
// Antigravity internals, it only shells out to the `codex` binary. That is what
// lets the same runtime work whether the caller is `agy`, Claude Code, or a
// plain terminal.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Resolve the codex binary. Honours CODEX_BIN, then PATH, then common
 * install locations. Returns the command string to spawn.
 */
export function resolveCodexBin() {
  if (process.env.CODEX_BIN && fs.existsSync(process.env.CODEX_BIN)) {
    return process.env.CODEX_BIN;
  }
  // Trust PATH first — spawn resolves it on every platform.
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", ["codex"], {
    encoding: "utf8"
  });
  if (probe.status === 0 && probe.stdout.trim()) {
    return "codex";
  }
  // Fallbacks for common global-npm locations.
  const candidates = [
    path.join(os.homedir(), ".local", "bin", "codex"),
    "/usr/local/bin/codex",
    "/opt/homebrew/bin/codex"
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return "codex"; // let spawn fail with a clear ENOENT
}

/** @returns {{ available: boolean, version: string|null, detail: string }} */
export function codexVersion() {
  const bin = resolveCodexBin();
  const result = spawnSync(bin, ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    return {
      available: false,
      version: null,
      detail: result.error ? String(result.error.message) : (result.stderr || "codex --version failed").trim()
    };
  }
  return { available: true, version: result.stdout.trim(), detail: result.stdout.trim() };
}

/**
 * Check Codex auth via `codex login status`.
 * @returns {{ loggedIn: boolean, detail: string }}
 */
export function codexAuthStatus() {
  const bin = resolveCodexBin();
  const result = spawnSync(bin, ["login", "status"], { encoding: "utf8" });
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status === 0 && /logged in/i.test(out)) {
    return { loggedIn: true, detail: out || "Logged in" };
  }
  return { loggedIn: false, detail: out || "Not logged in" };
}

/**
 * Build the argv for a `codex exec` invocation.
 * @param {object} o
 * @param {"exec"|"review"} o.kind          exec = free-form task, review = code review
 * @param {string} o.cwd
 * @param {string|null} [o.prompt]           prompt / custom review instructions
 * @param {string|null} [o.model]
 * @param {"read-only"|"workspace-write"|"danger-full-access"} [o.sandbox]
 * @param {string|null} [o.outputFile]       exec: capture final message with -o
 * @param {boolean} [o.resumeLast]           exec: resume most recent session
 * @param {string|null} [o.base]             review: base branch
 * @param {boolean} [o.uncommitted]          review: staged+unstaged+untracked
 * @param {boolean} [o.skipGitCheck]
 * @returns {string[]}
 */
export function buildCodexArgs(o) {
  const args = ["exec"];

  if (o.kind === "review") {
    args.push("review");
  } else if (o.resumeLast) {
    args.push("resume", "--last");
  }

  if (o.model) {
    args.push("-m", o.model);
  }

  if (o.kind === "exec") {
    // `-C` is valid on `codex exec` but NOT on the `review` subcommand; the
    // spawn cwd covers review's working directory either way.
    args.push("-C", o.cwd);
    args.push("-s", o.sandbox ?? "read-only");
    if (o.outputFile) {
      args.push("-o", o.outputFile);
    }
    if (o.skipGitCheck) {
      args.push("--skip-git-repo-check");
    }
  } else {
    // review subcommand
    if (o.base) {
      args.push("--base", o.base);
    } else if (o.uncommitted !== false) {
      args.push("--uncommitted");
    }
  }

  if (o.prompt && o.prompt.trim()) {
    args.push(o.prompt);
  }
  return args;
}

/**
 * Run codex synchronously, capturing stdout. Used for foreground reviews.
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
export function runCodexSync(args, { cwd, timeoutMs } = {}) {
  const bin = resolveCodexBin();
  const result = spawnSync(bin, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs
  });
  return {
    code: result.status ?? (result.signal ? 124 : 1),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? (result.error ? String(result.error.message) : "")
  };
}

/**
 * Spawn codex with stdout+stderr streamed to a log file. Used by background jobs.
 * Resolves when the process exits.
 * @returns {Promise<number>} exit code
 */
export function runCodexToLog(args, { cwd, logPath }) {
  return new Promise((resolve) => {
    const bin = resolveCodexBin();
    const out = fs.openSync(logPath, "a");
    const child = spawn(bin, args, { cwd, stdio: ["ignore", out, out] });
    child.on("error", (err) => {
      fs.appendFileSync(logPath, `\n[codex-runner] spawn error: ${err.message}\n`);
      resolve(127);
    });
    child.on("close", (code) => {
      fs.closeSync(out);
      resolve(code ?? 1);
    });
  });
}
