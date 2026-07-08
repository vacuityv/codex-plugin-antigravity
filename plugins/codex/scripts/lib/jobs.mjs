// Background-job store for Codex runs.
//
// Jobs are tracked on disk so that `status` / `result` / `cancel` work across
// separate CLI invocations (and across host restarts). Each job is a directory:
//
//   <root>/<job-id>/
//     meta.json     job metadata + live status
//     codex.log     streamed stdout+stderr from codex
//     output.txt    final captured message (task) or full review text
//
// The store is host-agnostic — no dependency on the calling IDE.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function jobsRoot() {
  const base = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  return path.join(base, "antigravity-plugin", "jobs");
}

function jobDir(id) {
  return path.join(jobsRoot(), id);
}

export function newJobId(kind) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const rand = crypto.randomBytes(3).toString("hex");
  return `${kind}-${stamp}-${rand}`;
}

/**
 * @param {object} meta
 * @param {string} meta.id
 * @param {string} meta.kind
 * @param {string} meta.cwd
 */
export function createJob(meta) {
  const dir = jobDir(meta.id);
  fs.mkdirSync(dir, { recursive: true });
  const record = {
    status: "starting",
    phase: "queued",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pid: null,
    exitCode: null,
    ...meta
  };
  writeMeta(meta.id, record);
  return record;
}

export function paths(id) {
  const dir = jobDir(id);
  return {
    dir,
    meta: path.join(dir, "meta.json"),
    log: path.join(dir, "codex.log"),
    output: path.join(dir, "output.txt")
  };
}

export function readMeta(id) {
  try {
    return JSON.parse(fs.readFileSync(paths(id).meta, "utf8"));
  } catch {
    return null;
  }
}

export function writeMeta(id, meta) {
  const p = paths(id).meta;
  meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(p, JSON.stringify(meta, null, 2));
}

export function updateMeta(id, patch) {
  const meta = readMeta(id);
  if (!meta) return null;
  Object.assign(meta, patch);
  writeMeta(id, meta);
  return meta;
}

/**
 * List jobs, newest first. Filtered to `cwd` unless `all` is set.
 * Reconciles stale "running" jobs whose process has died.
 */
export function listJobs({ cwd, all = false } = {}) {
  const root = jobsRoot();
  if (!fs.existsSync(root)) return [];
  const ids = fs
    .readdirSync(root)
    .filter((name) => fs.existsSync(path.join(root, name, "meta.json")));
  const jobs = [];
  for (const id of ids) {
    const meta = readMeta(id);
    if (!meta) continue;
    reconcile(meta);
    if (all || meta.cwd === cwd) {
      jobs.push(meta);
    }
  }
  jobs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return jobs;
}

/** If a job claims to be running but its PID is gone, mark it failed. */
function reconcile(meta) {
  if ((meta.status === "running" || meta.status === "starting") && meta.pid) {
    if (!pidAlive(meta.pid)) {
      meta.status = "failed";
      meta.phase = "process exited without reporting completion";
      writeMeta(meta.id, meta);
    }
  }
}

export function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function elapsed(meta) {
  const start = Date.parse(meta.createdAt);
  const end = meta.finishedAt ? Date.parse(meta.finishedAt) : Date.now();
  const secs = Math.max(0, Math.round((end - start) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m${String(secs % 60).padStart(2, "0")}s`;
}
