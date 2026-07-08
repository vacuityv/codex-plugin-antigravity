---
name: codex-cli-runtime
description: Internal contract for invoking the Codex runner (codex-runner.mjs) that shells out to the local `codex` CLI. Use when routing a task, review, or job-management command to Codex from Antigravity.
---

# Codex CLI runtime

The plugin never talks to Codex over a private protocol — it shells out to the
`codex` binary via one Node entrypoint:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-runner.mjs" <command> [args…]
```

`${CLAUDE_PLUGIN_ROOT}` is the plugin's install directory, set by the host
(Antigravity `agy` and Claude Code both provide it for installed plugins). If it
is ever unset, resolve the path to `scripts/codex-runner.mjs` under this plugin
directory and call `node` on it directly.

## Commands

| Command | Purpose | Notes |
|---|---|---|
| `setup [--json]` | Check codex is installed + authenticated | Reports `Ready: ✅/⚠️` |
| `review "<args>"` | Read-only review of git changes | `--base <ref>`, `--scope`, `--background` |
| `adversarial-review "<args>"` | Steerable design-challenge review | Same targets; trailing text = focus |
| `task "<args>"` | Delegate a task to Codex | `--write`, `--resume-last`, `--model`, `--background` |
| `status [job-id] [--all]` | List or detail background jobs | Table when no id |
| `result [job-id]` | Final output of a finished job | Defaults to newest finished |
| `cancel [job-id]` | Kill an active job | Defaults to newest active |

## Invariants

- **The runner owns backgrounding.** `--background` makes the runner detach a
  child process and return a job ID immediately — you do NOT need any
  host-specific "run in background" mechanism. Foreground runs block until Codex
  finishes.
- **Sandbox is explicit.** `review`/`adversarial-review` always run Codex
  read-only. `task` is read-only unless `--write` is passed (then
  `workspace-write`).
- **Output is verbatim.** Return the runner's stdout to the user as-is. Reviews
  are Codex's own text; task results are Codex's final message, captured
  reliably via `codex exec -o`.
- **One call per action.** Do not chain extra reasoning, file reads, or repo
  inspection around the forward — the runner and Codex do that work.

## Failure handling

- If the runner prints that Codex is missing or unauthenticated, stop and point
  the user to `/codex:setup`.
- A non-zero codex exit is surfaced in the output (`[codex exited N]`) — pass it
  through rather than retrying blindly.
