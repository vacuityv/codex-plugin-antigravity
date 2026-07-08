---
description: Delegate a coding, debugging, or implementation task to Codex
argument-hint: '[--background] [--write] [--resume|--fresh] [--model <name>] <what codex should do>'
allowed-tools: Bash, Task
---

Hand a substantial coding, debugging, or investigation task to Codex via the `codex:codex-rescue` subagent.

Raw user request: `$ARGUMENTS`

Routing rules:
- Route this to the `codex:codex-rescue` subagent — it is a thin forwarder to `codex exec`.
- If the request contains `--background`, tell the subagent to run detached (the runner returns a job ID immediately). Prefer this for open-ended, multi-step, or long-running work.
- `--write` lets Codex edit files (`workspace-write` sandbox). Without it, Codex runs read-only (diagnosis / research / review only). Default to read-only unless the user clearly wants edits applied.
- `--resume` continues Codex's most recent session in this repo; `--fresh` forces a new one. If the user says "continue", "keep going", or "apply the top fix" and `--fresh` is absent, resume.
- `--model <name>` overrides the model; otherwise leave it to Codex's default.
- Strip the routing flags (`--background`, `--write`, `--resume`, `--fresh`, `--model`) from the task text before forwarding, but pass them to the subagent as controls.

Return the subagent's output verbatim. If it was backgrounded, tell the user to check `/codex:status` and `/codex:result`. If Codex is missing or unauthenticated, tell the user to run `/codex:setup`.
