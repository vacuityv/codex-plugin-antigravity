#!/usr/bin/env node
// codex-runner.mjs — the Codex-for-Antigravity companion runtime.
//
// Drives the `codex` CLI (`codex exec`) on behalf of the Antigravity agent for:
//   setup                check the codex CLI is installed + authenticated
//   review               read-only code review of local git changes
//   adversarial-review   steerable review that challenges the design
//   task                 delegate a coding/diagnosis task to Codex
//   status / result / cancel   manage background jobs
//
// Long runs can be detached with `--background`; the job then survives this
// process and is tracked on disk (see lib/jobs.mjs).
import { spawn } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { buildCodexArgs, codexAuthStatus, codexVersion, runCodexSync, runCodexToLog } from "./lib/codex.mjs";
import { describeReviewTarget, isGitRepo } from "./lib/git.mjs";
import {
  createJob,
  elapsed,
  listJobs,
  newJobId,
  paths,
  pidAlive,
  readMeta,
  updateMeta
} from "./lib/jobs.mjs";

const __filename = fileURLToPath(import.meta.url);
const CWD = process.cwd();

const ADVERSARIAL_PREAMBLE = [
  "Perform an ADVERSARIAL design review of the changes below.",
  "Do not just list implementation defects — challenge the approach itself.",
  "Interrogate: Is this the right design? What assumptions does it depend on, and which are unstated or fragile?",
  "Where could it fail under real-world conditions (auth, data loss, rollback, races, reliability, scale)?",
  "Would a simpler or safer alternative have been better? Name the tradeoff.",
  "Cite specific files/lines. End with a one-paragraph verdict on whether the direction is sound.",
  ""
].join("\n");

// ---------------------------------------------------------------------------
// arg parsing
// ---------------------------------------------------------------------------

/** Split a raw arg string into tokens, respecting simple quoting. */
function tokenize(raw) {
  if (!raw) return [];
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

/**
 * Pull known flags out of a token list, returning { flags, rest }.
 * `rest` keeps positional/free text (e.g. review focus, task prompt).
 */
function parseFlags(tokens, valueFlags = []) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("--")) {
      const name = t.slice(2);
      if (valueFlags.includes(name)) {
        flags[name] = tokens[++i] ?? "";
      } else {
        flags[name] = true;
      }
    } else {
      rest.push(t);
    }
  }
  return { flags, rest };
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------

function cmdSetup(tokens) {
  const { flags } = parseFlags(tokens);
  const version = codexVersion();
  const report = { tool: "codex", available: version.available, version: version.version };

  if (!version.available) {
    report.loggedIn = false;
    report.ready = false;
    report.detail = version.detail;
    report.fix = "Install Codex: `npm install -g @openai/codex` (Node 18.18+), then rerun setup.";
  } else {
    const auth = codexAuthStatus();
    report.loggedIn = auth.loggedIn;
    report.authDetail = auth.detail;
    report.ready = auth.loggedIn;
    if (!auth.loggedIn) {
      report.fix = "Authenticate Codex: run `codex login` in a terminal (ChatGPT sign-in or API key), then rerun setup.";
    }
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return report.ready ? 0 : 1;
  }

  const lines = [];
  lines.push("## Codex for Antigravity — setup check\n");
  lines.push(`- Codex CLI: ${version.available ? `✅ installed (${version.version})` : "❌ not found"}`);
  if (version.available) {
    lines.push(`- Auth: ${report.loggedIn ? `✅ ${report.authDetail}` : "❌ not authenticated"}`);
  }
  lines.push(`- Ready: ${report.ready ? "✅ yes — `/codex:review` and `/codex:rescue` are good to go" : "⚠️ not yet"}`);
  if (report.fix) {
    lines.push(`\n**Next step:** ${report.fix}`);
  }
  process.stdout.write(lines.join("\n") + "\n");
  return report.ready ? 0 : 1;
}

// ---------------------------------------------------------------------------
// review / adversarial-review
// ---------------------------------------------------------------------------

function cmdReview(kind, tokens) {
  const { flags, rest } = parseFlags(tokens, ["base", "scope", "model"]);
  const focus = rest.join(" ").trim();
  const background = Boolean(flags.background);
  const scope = flags.scope || "auto";
  const base = flags.base || null;

  if (!isGitRepo(CWD)) {
    process.stdout.write("Not inside a git repository — nothing for Codex to review.\n");
    return 1;
  }

  const target = describeReviewTarget(CWD, { base, scope });
  if (target.empty) {
    process.stdout.write(`No changes to review (${target.scope}: ${target.summary}).\n`);
    return 0;
  }

  // adversarial-review folds its framing + any focus text into a custom prompt.
  let prompt = null;
  if (kind === "adversarial-review") {
    prompt = ADVERSARIAL_PREAMBLE + (focus ? `Extra focus from the user: ${focus}\n` : "");
  } else if (focus) {
    prompt = focus; // plain review normally has none, but pass through if given
  }

  const args = buildCodexArgs({
    kind: "review",
    cwd: CWD,
    prompt,
    model: flags.model || null,
    base: target.scope === "branch" ? target.base : null,
    uncommitted: target.scope !== "branch"
  });

  if (background) {
    return launchBackground({ kind, args, summary: `${kind} (${target.scope})`, captureStdout: true });
  }

  const label = kind === "adversarial-review" ? "adversarial review" : "review";
  process.stderr.write(`Running Codex ${label} on ${target.scope} changes (${target.summary})…\n`);
  const res = runCodexSync(args, { cwd: CWD, timeoutMs: 55 * 60 * 1000 });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.code !== 0 && res.stderr) {
    process.stdout.write(`\n[codex exited ${res.code}]\n${res.stderr}\n`);
  }
  return res.code;
}

// ---------------------------------------------------------------------------
// task (rescue / delegation)
// ---------------------------------------------------------------------------

function cmdTask(tokens) {
  const { flags, rest } = parseFlags(tokens, ["model", "effort", "sandbox"]);
  const prompt = rest.join(" ").trim();
  if (!prompt) {
    process.stdout.write("No task text provided. Usage: task [--background] [--write] [--resume-last] <what codex should do>\n");
    return 1;
  }
  const background = Boolean(flags.background);
  const write = Boolean(flags.write);
  const sandbox = flags.sandbox || (write ? "workspace-write" : "read-only");
  const resumeLast = Boolean(flags["resume-last"]);

  const args = buildCodexArgs({
    kind: "exec",
    cwd: CWD,
    prompt,
    model: flags.model || null,
    sandbox,
    resumeLast,
    skipGitCheck: !isGitRepo(CWD)
  });

  if (background) {
    return launchBackground({ kind: "task", args, summary: shorten(prompt), captureStdout: false, usesOutputFile: true });
  }

  // Foreground: capture the final message to a temp file for a clean result,
  // but also stream nothing extra — print codex's own stdout.
  process.stderr.write(`Delegating to Codex (${sandbox}${resumeLast ? ", resume" : ""})…\n`);
  const res = runCodexSync(args, { cwd: CWD, timeoutMs: 55 * 60 * 1000 });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.code !== 0 && res.stderr) {
    process.stdout.write(`\n[codex exited ${res.code}]\n${res.stderr}\n`);
  }
  return res.code;
}

// ---------------------------------------------------------------------------
// background job lifecycle
// ---------------------------------------------------------------------------

function launchBackground({ kind, args, summary, usesOutputFile = false }) {
  const id = newJobId(kind);
  const p = paths(id);
  createJob({ id, kind, cwd: CWD, summary, args });

  // For tasks we let codex write its final message to output.txt directly.
  const finalArgs = usesOutputFile ? [...args, "-o", p.output] : args;
  updateMeta(id, { args: finalArgs });

  const child = spawn(process.execPath, [__filename, "__run-job", id], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();

  process.stdout.write(
    [
      `Started Codex ${kind} in the background.`,
      `Job ID: ${id}`,
      ``,
      `Check progress:  /codex:status ${id}`,
      `Get the result:  /codex:result ${id}`,
      `Cancel it:       /codex:cancel ${id}`
    ].join("\n") + "\n"
  );
  return 0;
}

async function runJob(id) {
  const meta = readMeta(id);
  if (!meta) process.exit(1);
  const p = paths(id);
  updateMeta(id, { status: "running", phase: "codex working", pid: process.pid });

  const code = await runCodexToLog(meta.args, { cwd: meta.cwd, logPath: p.log });

  // Capture a result payload. Tasks use codex's -o output file; reviews use the log.
  let output = "";
  if (fs.existsSync(p.output) && fs.statSync(p.output).size > 0) {
    output = fs.readFileSync(p.output, "utf8");
  } else if (fs.existsSync(p.log)) {
    output = fs.readFileSync(p.log, "utf8");
    fs.writeFileSync(p.output, output);
  }

  updateMeta(id, {
    status: code === 0 ? "completed" : "failed",
    phase: code === 0 ? "done" : `codex exited ${code}`,
    exitCode: code,
    finishedAt: new Date().toISOString()
  });
  process.exit(0);
}

// ---------------------------------------------------------------------------
// status / result / cancel
// ---------------------------------------------------------------------------

function cmdStatus(tokens) {
  const { flags, rest } = parseFlags(tokens, ["timeout-ms"]);
  const id = rest[0];

  if (id) {
    const meta = readMeta(id);
    if (!meta) {
      process.stdout.write(`No Codex job found with ID \`${id}\`.\n`);
      return 1;
    }
    const lines = [
      `# Codex job ${id}`,
      ``,
      `- Kind: ${meta.kind}`,
      `- Status: ${meta.status}`,
      `- Phase: ${meta.phase}`,
      `- Elapsed: ${elapsed(meta)}`,
      `- Summary: ${meta.summary ?? "—"}`
    ];
    if (meta.status === "completed" || meta.status === "failed") {
      lines.push(``, `Result: \`/codex:result ${id}\``);
    }
    process.stdout.write(lines.join("\n") + "\n");
    return 0;
  }

  const jobs = listJobs({ cwd: CWD, all: Boolean(flags.all) });
  if (jobs.length === 0) {
    process.stdout.write("No Codex jobs recorded for this repository yet.\n");
    return 0;
  }
  const rows = jobs
    .slice(0, 20)
    .map((j) => `| ${j.id} | ${j.kind} | ${j.status} | ${j.phase} | ${elapsed(j)} | ${j.summary ?? ""} |`)
    .join("\n");
  process.stdout.write(
    `| Job ID | Kind | Status | Phase | Elapsed | Summary |\n|---|---|---|---|---|---|\n${rows}\n`
  );
  return 0;
}

function cmdResult(tokens) {
  const { rest } = parseFlags(tokens);
  let id = rest[0];
  if (!id) {
    const jobs = listJobs({ cwd: CWD }).filter((j) => j.status === "completed" || j.status === "failed");
    if (jobs.length === 0) {
      process.stdout.write("No finished Codex jobs to show. Try `/codex:status`.\n");
      return 1;
    }
    id = jobs[0].id;
  }
  const meta = readMeta(id);
  if (!meta) {
    process.stdout.write(`No Codex job found with ID \`${id}\`.\n`);
    return 1;
  }
  if (meta.status === "running" || meta.status === "starting") {
    process.stdout.write(`Job \`${id}\` is still ${meta.status}. Check \`/codex:status ${id}\`.\n`);
    return 0;
  }
  const p = paths(id);
  const body = fs.existsSync(p.output) ? fs.readFileSync(p.output, "utf8") : "(no output captured)";
  process.stdout.write(`# Codex ${meta.kind} result — ${id} (${meta.status})\n\n${body}\n`);
  return meta.status === "completed" ? 0 : 1;
}

function cmdCancel(tokens) {
  const { rest } = parseFlags(tokens);
  let id = rest[0];
  if (!id) {
    const active = listJobs({ cwd: CWD }).filter((j) => j.status === "running" || j.status === "starting");
    if (active.length === 0) {
      process.stdout.write("No active Codex jobs to cancel.\n");
      return 0;
    }
    id = active[0].id;
  }
  const meta = readMeta(id);
  if (!meta) {
    process.stdout.write(`No Codex job found with ID \`${id}\`.\n`);
    return 1;
  }
  if (meta.pid && pidAlive(meta.pid)) {
    try {
      process.kill(meta.pid);
    } catch {
      /* already gone */
    }
  }
  updateMeta(id, { status: "cancelled", phase: "cancelled by user", finishedAt: new Date().toISOString() });
  process.stdout.write(`Cancelled Codex job \`${id}\`.\n`);
  return 0;
}

// ---------------------------------------------------------------------------
// helpers + dispatch
// ---------------------------------------------------------------------------

function shorten(text, limit = 72) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length <= limit ? s : `${s.slice(0, limit - 1)}…`;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const tokens = rest.length === 1 ? tokenize(rest[0]) : rest;

  switch (command) {
    case "setup":
      return cmdSetup(tokens);
    case "review":
      return cmdReview("review", tokens);
    case "adversarial-review":
      return cmdReview("adversarial-review", tokens);
    case "task":
      return cmdTask(tokens);
    case "status":
      return cmdStatus(tokens);
    case "result":
      return cmdResult(tokens);
    case "cancel":
      return cmdCancel(tokens);
    case "__run-job":
      return runJob(tokens[0]);
    default:
      process.stdout.write(
        "Usage: codex-runner.mjs <setup|review|adversarial-review|task|status|result|cancel> [args]\n"
      );
      return 1;
  }
}

main()
  .then((code) => {
    if (typeof code === "number") process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`codex-runner error: ${err?.stack || err}\n`);
    process.exitCode = 1;
  });
