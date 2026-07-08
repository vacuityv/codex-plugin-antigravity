---
name: codex
description: Delegate coding, debugging, or investigation tasks to OpenAI Codex, or get a Codex code review, from inside Antigravity. Activate this skill whenever the user asks to "use Codex", "ask Codex", "review with Codex", "get a second opinion from Codex", "delegate this to Codex", or otherwise hand work to the OpenAI Codex CLI. The Antigravity agent shells out to the local `codex` CLI via a bundled Node runner.
---

# Use Codex from Antigravity

This skill lets the Antigravity (Gemini) agent hand work to **OpenAI Codex** by
running a bundled Node runner in the terminal. Everything goes through one
entrypoint that shells out to `codex exec`.

**First, resolve the runner path once** (global install first, then workspace),
and reuse it for every call this session:

```bash
RUNNER="$HOME/.gemini/config/plugins/codex/scripts/codex-runner.mjs"
[ -f "$RUNNER" ] || RUNNER=".agents/plugins/codex/scripts/codex-runner.mjs"
[ -f "$RUNNER" ] || RUNNER="_agents/plugins/codex/scripts/codex-runner.mjs"
node "$RUNNER" <command> [args…]
```

## When to use which command

| User intent | Command |
|---|---|
| "Is Codex set up / installed?" | `setup` |
| "Review my changes with Codex" | `review` |
| "Challenge this design / adversarial review" | `adversarial-review "<focus>"` |
| "Delegate this / ask Codex to fix/build X" | `task "<what to do>"` |
| "How's the background Codex job?" | `status` |
| "Show me Codex's result" | `result` |
| "Stop the Codex job" | `cancel` |

## How to run each

- **Setup check** (always safe to run first):
  ```bash
  node "$RUNNER" setup
  ```
  If it reports not installed → `npm install -g @openai/codex`. If not
  authenticated → the user runs `codex login` in a terminal.

- **Code review** (read-only; never edits):
  ```bash
  node "$RUNNER" review "--base main"
  ```
  Omit `--base …` to review uncommitted working-tree changes. Add `--background`
  for large diffs, then poll with `status` and fetch with `result`.

- **Delegate a task**:
  ```bash
  node "$RUNNER" task "fix the failing test in tests/auth.test.js"
  ```
  Add `--write` only if the user wants Codex to actually edit files
  (`workspace-write` sandbox); otherwise it stays read-only. Add `--resume-last`
  to continue Codex's previous session.

  **Foreground vs background — this matters for UX.** Codex is a real agent and a
  non-trivial task (generating files, a refactor, writing tests, anything with
  `--write`) legitimately takes 1–3 minutes. A foreground run **blocks the
  terminal** for that whole time. So:
  - Quick, read-only questions → run foreground.
  - Anything with `--write`, or clearly multi-step / long work → add
    `--background`. The runner returns a **job ID immediately**; then poll
    `node "$RUNNER" status <id>` and fetch `node "$RUNNER" result <id>`. Do NOT
    sit blocking on a foreground call for a long task.

  Note: the runner uses `codex exec` (non-interactive) with a `-s` sandbox, so
  Codex never pauses for an approval prompt and never waits on stdin — a
  foreground run that seems "stuck" is just Codex still working, not hung.

## Rules

- Return Codex's output to the user **verbatim** — it is Codex's review or
  answer, not yours. Do not re-do the work yourself or silently "improve" it.
- Reviews are always read-only. Only pass `--write` on `task` when the user
  clearly wants edits applied.
- Run exactly one runner command per request; the runner + Codex do the heavy
  lifting (git scoping, backgrounding, capturing the final message).
- If the runner says Codex is missing or unauthenticated, stop and tell the user
  to run the setup step above.
